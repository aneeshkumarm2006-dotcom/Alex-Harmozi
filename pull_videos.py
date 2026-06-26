#!/usr/bin/env python3
"""
Pull long-form videos + transcripts from a YouTube channel.

Pipeline (stages 1-2 of the "chat with Alex Hormozi" build):
  1. List all videos on the channel (YouTube Data API v3)
  2. Enrich each with duration, keep only long-form (drops Shorts)
  3. Fetch captions for the long-form set (youtube-transcript-api via Webshare proxy)

Output (under --out, default ./data):
  videos.json              -> every video's metadata, including duration_seconds
  transcripts/<id>.json    -> raw caption snippets [{text, start, duration}, ...]
  manifest.json            -> per-video transcript status

Resumable + fault-tolerant: re-running skips finished videos and re-tries the rest.
A single failing video is marked "retry_later" and the run continues (no crash).

Setup:
  pip install youtube-transcript-api google-api-python-client
  export YOUTUBE_API_KEY="..."
  export WEBSHARE_PROXY_USERNAME="..."     # Webshare dashboard -> Residential proxy
  export WEBSHARE_PROXY_PASSWORD="..."

Run:
  python pull_videos.py --handle AlexHormozi --max 25     # smoke test
  python pull_videos.py --handle AlexHormozi              # full long-form run
"""

import argparse
import json
import os
import random
import re
import sys
import time
from pathlib import Path

import requests
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
    IpBlocked,
    RequestBlocked,
    YouTubeTranscriptApiException,
)

# Load .env (if present) so the API key + proxy creds are picked up automatically.
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

# Won't change on retry -> mark done-with-no-transcript.
PERMANENT_ERRORS = (TranscriptsDisabled, NoTranscriptFound, VideoUnavailable)
# Worth retrying on a fresh IP: YouTube IP/blocks + any network/429 error from requests.
RETRYABLE_ERRORS = (IpBlocked, RequestBlocked, requests.exceptions.RequestException)
PREFERRED_LANGS = ["en", "en-US", "en-GB"]
_ISO_DUR = re.compile(r"P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?")


# ----------------------------- stage 1: list videos -----------------------------

def resolve_uploads_playlist(youtube, handle, channel_id):
    if channel_id:
        resp = youtube.channels().list(part="contentDetails", id=channel_id).execute()
    else:
        resp = youtube.channels().list(
            part="contentDetails", forHandle=handle.lstrip("@")).execute()
    items = resp.get("items", [])
    if not items:
        sys.exit(f"Could not resolve channel (handle={handle!r}, id={channel_id!r}).")
    return items[0]["contentDetails"]["relatedPlaylists"]["uploads"]


def list_all_videos(youtube, uploads_playlist):
    videos, page_token = [], None
    while True:
        resp = youtube.playlistItems().list(
            part="snippet,contentDetails", playlistId=uploads_playlist,
            maxResults=50, pageToken=page_token).execute()
        for it in resp.get("items", []):
            vid = it["contentDetails"]["videoId"]
            sn = it["snippet"]
            videos.append({
                "video_id": vid, "title": sn.get("title", ""),
                "description": sn.get("description", ""),
                "published_at": it["contentDetails"].get("videoPublishedAt", ""),
                "url": f"https://www.youtube.com/watch?v={vid}",
            })
        page_token = resp.get("nextPageToken")
        print(f"  collected {len(videos)} videos...", flush=True)
        if not page_token:
            return videos


# ----------------------------- stage 2: durations -----------------------------

def parse_duration(iso):
    m = _ISO_DUR.fullmatch(iso or "")
    if not m:
        return 0
    d, h, mi, s = (int(x) if x else 0 for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + s


def enrich_durations(youtube, videos):
    missing = [v for v in videos if "duration_seconds" not in v]
    if not missing:
        return False
    print(f"Fetching durations for {len(missing)} videos...")
    by_id = {v["video_id"]: v for v in missing}
    ids = list(by_id)
    for i in range(0, len(ids), 50):
        resp = youtube.videos().list(
            part="contentDetails", id=",".join(ids[i:i + 50])).execute()
        for it in resp.get("items", []):
            by_id[it["id"]]["duration_seconds"] = parse_duration(
                it["contentDetails"].get("duration", ""))
        print(f"  durations: {min(i + 50, len(ids))}/{len(ids)}", flush=True)
    for v in missing:
        v.setdefault("duration_seconds", 0)
    return True


# ----------------------------- stage 3: transcripts -----------------------------

def using_proxy():
    return bool(os.environ.get("WEBSHARE_PROXY_USERNAME")
                and os.environ.get("WEBSHARE_PROXY_PASSWORD"))


def build_api():
    """Fresh client each call -> a new proxy connection -> a new residential IP."""
    if using_proxy():
        from youtube_transcript_api.proxies import WebshareProxyConfig
        return YouTubeTranscriptApi(proxy_config=WebshareProxyConfig(
            os.environ["WEBSHARE_PROXY_USERNAME"], os.environ["WEBSHARE_PROXY_PASSWORD"]))
    return YouTubeTranscriptApi()


def fetch_one(ytt, video_id):
    try:
        return ytt.fetch(video_id, languages=PREFERRED_LANGS).to_raw_data(), "en"
    except NoTranscriptFound:
        for tr in ytt.list(video_id):
            return tr.fetch().to_raw_data(), tr.language_code
        raise


def fetch_with_retry(video_id, attempts, base_delay):
    """Retry transient/429 failures, each attempt on a fresh IP. Raises on give-up."""
    last = None
    for n in range(1, attempts + 1):
        try:
            return fetch_one(build_api(), video_id)
        except PERMANENT_ERRORS:
            raise
        except RETRYABLE_ERRORS as e:
            last = e
            if n < attempts:
                delay = min(base_delay * n, 15) + random.uniform(0, 1.5)
                print(f"    {video_id}: {type(e).__name__} -> new IP in {delay:.0f}s "
                      f"({n}/{attempts})", flush=True)
                time.sleep(delay)
        # any other library exception propagates and is recorded as "error"
    raise last


def pull_transcripts(videos, out_dir, manifest, sleep, attempts, base_delay):
    tdir = out_dir / "transcripts"
    tdir.mkdir(parents=True, exist_ok=True)
    todo = [v for v in videos
            if manifest.get(v["video_id"], {}).get("status") not in ("ok", "no_transcript")]
    print(f"\nTranscripts: {len(videos) - len(todo)} done, {len(todo)} to fetch.\n")

    for i, v in enumerate(todo, 1):
        vid = v["video_id"]
        prefix = f"[{i}/{len(todo)}] {vid}"
        try:
            raw, lang = fetch_with_retry(vid, attempts, base_delay)
            (tdir / f"{vid}.json").write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
            manifest[vid] = {"status": "ok", "lang": lang, "snippets": len(raw)}
            print(f"{prefix}  ok ({lang}, {len(raw)} snippets)", flush=True)
        except PERMANENT_ERRORS as e:
            manifest[vid] = {"status": "no_transcript", "error": type(e).__name__}
            print(f"{prefix}  no captions ({type(e).__name__}) -> Whisper later", flush=True)
        except RETRYABLE_ERRORS as e:
            manifest[vid] = {"status": "retry_later", "error": type(e).__name__}
            print(f"{prefix}  gave up after {attempts} tries ({type(e).__name__}) "
                  f"-> retry_later", flush=True)
        except YouTubeTranscriptApiException as e:
            manifest[vid] = {"status": "error", "error": type(e).__name__}
            print(f"{prefix}  error ({type(e).__name__})", flush=True)

        if i % 20 == 0:
            save_manifest(out_dir, manifest)
        time.sleep(sleep + random.uniform(0, 0.4))


# ----------------------------- io helpers -----------------------------

def load_json(p, default):
    return json.loads(Path(p).read_text()) if Path(p).exists() else default

def save_manifest(out_dir, manifest):
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

def save_videos(path, videos):
    Path(path).write_text(json.dumps(videos, indent=2, ensure_ascii=False), encoding="utf-8")


# ----------------------------- main -----------------------------

def main():
    ap = argparse.ArgumentParser(description="Pull long-form videos + transcripts from a channel.")
    ap.add_argument("--handle", default="AlexHormozi")
    ap.add_argument("--channel-id", default=None)
    ap.add_argument("--out", default="data")
    ap.add_argument("--min-seconds", type=int, default=180, help="drop videos shorter than this")
    ap.add_argument("--max", type=int, default=None, help="cap long-form videos (for testing)")
    ap.add_argument("--refresh", action="store_true", help="rebuild the video list")
    ap.add_argument("--sleep", type=float, default=1.0, help="base pause between videos")
    ap.add_argument("--retries", type=int, default=6, help="retry attempts per video (new IP each)")
    ap.add_argument("--backoff", type=float, default=3.0, help="base backoff seconds for retries")
    args = ap.parse_args()

    if not os.environ.get("YOUTUBE_API_KEY"):
        sys.exit("Set YOUTUBE_API_KEY (Google Cloud -> enable 'YouTube Data API v3').")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    youtube = build("youtube", "v3", developerKey=os.environ["YOUTUBE_API_KEY"], cache_discovery=False)
    videos_path = out_dir / "videos.json"

    # Stage 1 -- list videos
    videos = load_json(videos_path, None)
    if videos is None or args.refresh:
        try:
            uploads = resolve_uploads_playlist(youtube, args.handle, args.channel_id)
            print(f"Uploads playlist: {uploads}\nListing videos...")
            videos = list_all_videos(youtube, uploads)
        except HttpError as e:
            sys.exit(f"YouTube Data API error: {e}")
        save_videos(videos_path, videos)
        print(f"Saved {len(videos)} videos.")
    else:
        print(f"Loaded {len(videos)} videos from {videos_path} (use --refresh to rebuild).")

    # Stage 2 -- durations + long-form filter
    try:
        if enrich_durations(youtube, videos):
            save_videos(videos_path, videos)
    except HttpError as e:
        sys.exit(f"YouTube Data API error while fetching durations: {e}")

    longform = [v for v in videos if v.get("duration_seconds", 0) >= args.min_seconds]
    print(f"\nLong-form (>= {args.min_seconds}s): {len(longform)} of {len(videos)} videos "
          f"({len(videos) - len(longform)} skipped).")
    if args.max:
        longform = longform[: args.max]
        print(f"Capped to {len(longform)} for this run.")

    print("Proxy: " + ("Webshare residential (rotating)." if using_proxy()
          else "NONE -> direct requests will likely be blocked. Set WEBSHARE_PROXY_*."))

    # Stage 3 -- transcripts
    manifest = load_json(out_dir / "manifest.json", {})
    pull_transcripts(longform, out_dir, manifest, args.sleep, args.retries, args.backoff)
    save_manifest(out_dir, manifest)

    counts = {}
    for m in manifest.values():
        counts[m.get("status")] = counts.get(m.get("status"), 0) + 1
    print(f"\nDone. {counts}")
    if counts.get("retry_later"):
        print(f"{counts['retry_later']} videos hit rate limits -- just re-run to retry them.")
    print(f"Data in: {out_dir.resolve()}")


if __name__ == "__main__":
    main()