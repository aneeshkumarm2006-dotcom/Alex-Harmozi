#!/usr/bin/env python3
"""
Free transcript fetcher using yt-dlp (no proxy required).

Drop-in alternative to stage 3 of pull_videos.py. Reuses the same files:
  reads   <out>/videos.json      (produced by pull_videos.py -- already saved)
  writes  <out>/transcripts/<id>.json   [{text, start, duration}, ...]
  updates <out>/manifest.json    per-video status (ok / no_transcript / retry_later)

Why yt-dlp instead of youtube-transcript-api + proxy?
  yt-dlp is far more resistant to YouTube's bot-blocking, so it can pull
  captions straight from your home IP -- no paid residential proxy needed.
  It is NOT magic: at high volume YouTube may still throttle you. When that
  happens the video is parked as "retry_later" and you just re-run later --
  finished videos are skipped, so each run chips away at the remainder.

  Logged-in cookies make this dramatically more reliable. If you are signed
  into YouTube in your browser, add:  --cookies-from-browser chrome
  (or edge / firefox). yt-dlp then looks like a real logged-in viewer.

Setup:
  pip install yt-dlp

Run (resumes where the proxy run left off -- your 2283 videos are already saved):
  python pull_transcripts_ytdlp.py --out data_moremozi
  python pull_transcripts_ytdlp.py --out data_moremozi --cookies-from-browser chrome
"""

import argparse
import json
import random
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

PREFERRED_LANGS = ["en", "en-US", "en-GB", "en-orig"]

# yt-dlp stderr fragments that mean "this video will never have captions" ->
# mark done-with-no-transcript (don't waste re-runs on it).
PERMANENT_MARKERS = (
    "video unavailable", "private video", "this video is not available",
    "has been removed", "account associated with this video has been terminated",
    "members-only", "this video is no longer available", "deleted",
)


# ----------------------------- yt-dlp plumbing -----------------------------

def ytdlp_available():
    try:
        subprocess.run([sys.executable, "-m", "yt_dlp", "--version"],
                       capture_output=True, timeout=30)
        return True
    except (subprocess.SubprocessError, OSError):
        return False


def run_ytdlp(video_id, tmp_dir, cookies_from_browser, cookies_file, proxy):
    """Download English subs (manual + auto) as json3 into tmp_dir.
    Returns (exit_code, stderr_text)."""
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--ignore-config", "--no-playlist", "--no-warnings", "--no-progress",
        "--skip-download",
        "--write-subs", "--write-auto-subs",
        "--sub-langs", "en.*,en-orig",
        "--sub-format", "json3",
        "-P", str(tmp_dir),
        "-o", "%(id)s.%(ext)s",
    ]
    if cookies_from_browser:
        cmd += ["--cookies-from-browser", cookies_from_browser]
    if cookies_file:
        cmd += ["--cookies", cookies_file]
    if proxy:
        cmd += ["--proxy", proxy]
    cmd.append(f"https://www.youtube.com/watch?v={video_id}")

    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    return proc.returncode, (proc.stderr or "")


def pick_subtitle_file(tmp_dir, video_id):
    """Choose the best english json3 file yt-dlp wrote. Returns (path, lang) or (None, None)."""
    files = list(Path(tmp_dir).glob(f"{video_id}*.json3"))
    if not files:
        return None, None

    def lang_of(p):
        # "<id>.<lang>.json3" -> "<lang>"
        parts = p.name.split(".")
        return parts[-2] if len(parts) >= 3 else ""

    def score(p):
        lang = lang_of(p)
        if lang in PREFERRED_LANGS:
            return PREFERRED_LANGS.index(lang)
        if lang.startswith("en"):
            return len(PREFERRED_LANGS)
        return len(PREFERRED_LANGS) + 1

    best = min(files, key=score)
    return best, lang_of(best)


def parse_json3(path):
    """YouTube json3 captions -> [{text, start, duration}], matching youtube-transcript-api."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    out = []
    for ev in data.get("events", []):
        segs = ev.get("segs")
        if not segs:
            continue
        text = "".join(s.get("utf8", "") for s in segs).replace("\n", " ").strip()
        if not text:
            continue
        out.append({
            "text": text,
            "start": ev.get("tStartMs", 0) / 1000.0,
            "duration": ev.get("dDurationMs", 0) / 1000.0,
        })
    return out


def is_permanent(stderr):
    low = stderr.lower()
    return any(marker in low for marker in PERMANENT_MARKERS)


# ----------------------------- fetch one video -----------------------------

def fetch_one(video_id, out_tdir, opts, attempts, base_delay):
    """Returns one of:
        ("ok", lang, snippet_count)
        ("no_transcript", reason, 0)
        ("retry_later", reason, 0)
    """
    last_reason = "unknown"
    for n in range(1, attempts + 1):
        tmp = Path(tempfile.mkdtemp(prefix=f"ytt_{video_id}_"))
        try:
            code, stderr = run_ytdlp(
                video_id, tmp, opts["cookies_from_browser"],
                opts["cookies_file"], opts["proxy"])

            sub_path, lang = pick_subtitle_file(tmp, video_id)
            if sub_path is not None:
                snippets = parse_json3(sub_path)
                if snippets:
                    (out_tdir / f"{video_id}.json").write_text(
                        json.dumps(snippets, ensure_ascii=False), encoding="utf-8")
                    return "ok", lang, len(snippets)
                # File present but empty -> treat as no usable captions.
                return "no_transcript", "EmptyCaptions", 0

            # No subtitle file produced.
            if code == 0:
                # yt-dlp succeeded but the video genuinely has no captions.
                return "no_transcript", "NoCaptions", 0
            if is_permanent(stderr):
                return "no_transcript", "Unavailable", 0

            # Transient/block error -> back off and retry on next loop.
            last_reason = "Blocked/429" if ("429" in stderr or "sign in to confirm" in stderr.lower()) else "ytdlpError"
        except subprocess.TimeoutExpired:
            last_reason = "Timeout"
        except (OSError, ValueError, json.JSONDecodeError) as e:
            last_reason = type(e).__name__
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

        if n < attempts:
            delay = min(base_delay * n, 30) + random.uniform(0, 2.0)
            print(f"    {video_id}: {last_reason} -> retry in {delay:.0f}s ({n}/{attempts})", flush=True)
            time.sleep(delay)

    return "retry_later", last_reason, 0


# ----------------------------- io helpers -----------------------------

def load_json(p, default):
    return json.loads(Path(p).read_text(encoding="utf-8")) if Path(p).exists() else default


def build_video_list(out_dir, handle, channel_id):
    """Rebuild videos.json (stages 1-2) by reusing pull_videos.py's working API code."""
    try:
        import pull_videos as pv  # loads .env on import -> YOUTUBE_API_KEY available
    except ImportError as e:
        sys.exit(f"Can't build the video list (need pull_videos.py beside this script): {e}")
    import os
    if not os.environ.get("YOUTUBE_API_KEY"):
        sys.exit("videos.json is missing and YOUTUBE_API_KEY isn't set -- can't build the list.\n"
                 "Set YOUTUBE_API_KEY in .env, or run pull_videos.py first.")
    from googleapiclient.discovery import build as build_youtube
    youtube = build_youtube("youtube", "v3",
                            developerKey=os.environ["YOUTUBE_API_KEY"], cache_discovery=False)
    uploads = pv.resolve_uploads_playlist(youtube, handle, channel_id)
    print(f"videos.json missing -> rebuilding list.\nUploads playlist: {uploads}\nListing videos...")
    videos = pv.list_all_videos(youtube, uploads)
    pv.enrich_durations(youtube, videos)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "videos.json").write_text(
        json.dumps(videos, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Saved {len(videos)} videos.\n")
    return videos

def save_manifest(out_dir, manifest):
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")


# ----------------------------- main -----------------------------

def main():
    ap = argparse.ArgumentParser(description="Free transcript fetcher via yt-dlp (no proxy).")
    ap.add_argument("--out", default="data", help="same --out dir you used with pull_videos.py")
    ap.add_argument("--handle", default="AlexHormozi", help="channel handle, used only if videos.json must be rebuilt")
    ap.add_argument("--channel-id", default=None, help="channel id (alternative to --handle)")
    ap.add_argument("--min-seconds", type=int, default=180, help="long-form threshold (match pull_videos.py)")
    ap.add_argument("--max", type=int, default=None, help="cap videos this run (for testing)")
    ap.add_argument("--sleep", type=float, default=2.0, help="base pause between videos")
    ap.add_argument("--retries", type=int, default=3, help="in-run retry attempts per video")
    ap.add_argument("--backoff", type=float, default=5.0, help="base backoff seconds for retries")
    ap.add_argument("--cookies-from-browser", default=None,
                    help="chrome|edge|firefox|... -- use your logged-in YouTube cookies (recommended)")
    ap.add_argument("--cookies", default=None, help="path to a cookies.txt file (alternative to --cookies-from-browser)")
    ap.add_argument("--proxy", default=None, help="optional proxy URL, e.g. http://user:pass@host:port")
    args = ap.parse_args()

    if not ytdlp_available():
        sys.exit("yt-dlp is not installed. Run:  pip install yt-dlp")

    out_dir = Path(args.out)
    videos_path = out_dir / "videos.json"
    videos = load_json(videos_path, None)
    if videos is None:
        videos = build_video_list(out_dir, args.handle, args.channel_id)

    longform = [v for v in videos if v.get("duration_seconds", 0) >= args.min_seconds]
    if args.max:
        longform = longform[: args.max]

    tdir = out_dir / "transcripts"
    tdir.mkdir(parents=True, exist_ok=True)
    manifest = load_json(out_dir / "manifest.json", {})

    todo = [v for v in longform
            if manifest.get(v["video_id"], {}).get("status") not in ("ok", "no_transcript")]
    print(f"Long-form videos: {len(longform)}  |  already done: {len(longform) - len(todo)}  |  to fetch: {len(todo)}")
    print("Engine: yt-dlp (free, no proxy)."
          + ("  cookies: " + (args.cookies_from_browser or args.cookies) if (args.cookies_from_browser or args.cookies) else "  (tip: add --cookies-from-browser chrome to reduce blocks)"))
    print()

    opts = {
        "cookies_from_browser": args.cookies_from_browser,
        "cookies_file": args.cookies,
        "proxy": args.proxy,
    }

    for i, v in enumerate(todo, 1):
        vid = v["video_id"]
        prefix = f"[{i}/{len(todo)}] {vid}"
        status, reason, count = fetch_one(vid, tdir, opts, args.retries, args.backoff)
        manifest[vid] = {"status": status, **({"lang": reason, "snippets": count} if status == "ok" else {"error": reason})}

        if status == "ok":
            print(f"{prefix}  ok ({reason}, {count} snippets)", flush=True)
        elif status == "no_transcript":
            print(f"{prefix}  no captions ({reason})", flush=True)
        else:
            print(f"{prefix}  gave up ({reason}) -> retry_later", flush=True)

        if i % 20 == 0:
            save_manifest(out_dir, manifest)
        time.sleep(args.sleep + random.uniform(0, 0.5))

    save_manifest(out_dir, manifest)

    counts = {}
    for m in manifest.values():
        counts[m.get("status")] = counts.get(m.get("status"), 0) + 1
    print(f"\nDone. {counts}")
    if counts.get("retry_later"):
        print(f"{counts['retry_later']} videos were blocked/throttled -- wait a bit and just re-run to pick them up.")
    print(f"Data in: {out_dir.resolve()}")


if __name__ == "__main__":
    main()
