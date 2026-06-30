#!/usr/bin/env python3
"""
Stage 4a -- chunk raw caption snippets into retrieval units.

Reads:
  data/manifest.json        -> which videos have status "ok"
  data/videos.json          -> title / url / published_at per video
  data/transcripts/<id>.json-> [{text, start, duration}, ...]

Writes:
  data/chunks.jsonl         -> one JSON object per line, ready for ingest.py

Each chunk merges consecutive snippets into a ~MAX_CHUNK_TOKENS window with
OVERLAP_TOKENS of carry-over, and preserves the START TIMESTAMP of its first
snippet. That timestamp is what powers deep links back into the video
(youtube.com/watch?v=ID&t=272s) -- the citation/proof layer for every answer.

Run:
  python chunk.py                  # chunk all "ok" videos
  python chunk.py --max 5          # smoke test on 5 videos
"""

import argparse
import json
import re

import config

_WS = re.compile(r"\s+")

# ----------------------------- token counting -----------------------------

try:
    import tiktoken
    _ENC = tiktoken.get_encoding("cl100k_base")

    def count_tokens(text: str) -> int:
        return len(_ENC.encode(text))
except Exception:  # tiktoken not installed -> rough word-based estimate
    def count_tokens(text: str) -> int:
        return max(1, round(len(text.split()) / 0.75))


def normalize(text: str) -> str:
    return _WS.sub(" ", text).strip()


def fmt_ts(seconds: float) -> str:
    s = int(seconds)
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"


# ----------------------------- chunking -----------------------------


def chunk_snippets(snippets, meta, max_tokens, overlap_tokens):
    """Sliding window over snippets with token-budgeted overlap."""
    chunks = []
    cur, cur_tokens = [], 0

    def emit(window):
        text = normalize(" ".join(s["text"] for s in window))
        if not text:
            return
        start = window[0]["start"]
        last = window[-1]
        end = last["start"] + last.get("duration", 0.0)
        idx = len(chunks)
        vid = meta["video_id"]
        chunks.append({
            "id": f"{vid}_{idx:04d}",
            "video_id": vid,
            "title": meta.get("title", ""),
            "url": meta.get("url", f"https://www.youtube.com/watch?v={vid}"),
            "published_at": meta.get("published_at") or None,
            "start_seconds": round(start, 2),
            "end_seconds": round(end, 2),
            "timestamp": fmt_ts(start),
            "deep_link": f"{meta.get('url', f'https://www.youtube.com/watch?v={vid}')}&t={int(start)}s",
            "content": text,
            "token_count": count_tokens(text),
        })

    for s in snippets:
        if not s.get("text", "").strip():
            continue
        t = count_tokens(s["text"])
        if cur and cur_tokens + t > max_tokens:
            emit(cur)
            # carry over trailing snippets up to overlap_tokens for context continuity
            keep, kt = [], 0
            for s2 in reversed(cur):
                c = count_tokens(s2["text"])
                if keep and kt + c > overlap_tokens:
                    break
                keep.insert(0, s2)
                kt += c
            cur, cur_tokens = keep, kt
        cur.append(s)
        cur_tokens += t

    if cur:
        emit(cur)
    return chunks


# ----------------------------- main -----------------------------


def main():
    from pathlib import Path
    ap = argparse.ArgumentParser(description="Chunk transcripts into retrieval units.")
    ap.add_argument("--max", type=int, default=None, help="limit number of videos (testing)")
    ap.add_argument("--max-tokens", type=int, default=config.MAX_CHUNK_TOKENS)
    ap.add_argument("--overlap", type=int, default=config.OVERLAP_TOKENS)
    ap.add_argument("--data-dir", default=None,
                    help="folder holding manifest.json/videos.json/transcripts/ (default: data/)")
    ap.add_argument("--out", default=str(config.CHUNKS_JSONL))
    args = ap.parse_args()

    # Resolve input paths -- default to the main data/ dir, or a custom --data-dir
    # (e.g. data_moremozi) so a second channel can be chunked without clobbering.
    if args.data_dir:
        ddir = Path(args.data_dir)
        manifest_path, videos_path, tdir = ddir / "manifest.json", ddir / "videos.json", ddir / "transcripts"
    else:
        manifest_path, videos_path, tdir = config.MANIFEST_JSON, config.VIDEOS_JSON, config.TRANSCRIPTS_DIR

    manifest = json.loads(manifest_path.read_text())
    videos = {v["video_id"]: v for v in json.loads(videos_path.read_text())}

    ok_ids = [vid for vid, m in manifest.items() if m.get("status") == "ok"]
    if args.max:
        ok_ids = ok_ids[: args.max]
    print(f"Chunking {len(ok_ids)} videos "
          f"(target {args.max_tokens} tok, overlap {args.overlap})...")

    total_chunks = 0
    with open(args.out, "w", encoding="utf-8") as fh:
        for i, vid in enumerate(ok_ids, 1):
            tpath = tdir / f"{vid}.json"
            if not tpath.exists():
                print(f"  ! {vid}: transcript file missing, skipping")
                continue
            snippets = json.loads(tpath.read_text())
            meta = videos.get(vid, {"video_id": vid})
            meta.setdefault("video_id", vid)
            for ch in chunk_snippets(snippets, meta, args.max_tokens, args.overlap):
                fh.write(json.dumps(ch, ensure_ascii=False) + "\n")
                total_chunks += 1
            if i % 50 == 0 or i == len(ok_ids):
                print(f"  [{i}/{len(ok_ids)}] {total_chunks} chunks so far", flush=True)

    print(f"\nDone. {total_chunks} chunks -> {args.out}")


if __name__ == "__main__":
    main()
