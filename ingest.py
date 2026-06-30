#!/usr/bin/env python3
"""
Stage 4b -- embed chunks (Voyage) and load them into Supabase (pgvector).

Reads:
  data/chunks.jsonl   (produced by chunk.py)

Writes:
  rows into the `chunks` table in your Supabase project.

Resumable: on start it pulls the set of ids already present in Supabase and
skips them, so you can re-run after an interruption without re-embedding or
duplicating. Embeddings go out in batches of VOYAGE_BATCH; DB writes upsert in
batches so a partial run never leaves orphans.

Setup (see .env.example):
  VOYAGE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
  (run schema.sql in Supabase first)

Run:
  python ingest.py                 # embed + load everything new
  python ingest.py --limit 200     # smoke test
  python ingest.py --reembed       # ignore what's loaded; re-do all
"""

import argparse
import json
import sys

import config


def load_chunks(limit=None, path=None):
    from pathlib import Path
    p = Path(path) if path else config.CHUNKS_JSONL
    if not p.exists():
        sys.exit(f"{p} not found -- run `python chunk.py` first.")
    rows = []
    with open(p, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
            if limit and len(rows) >= limit:
                break
    return rows


def existing_ids(sb):
    """Page through ids already in Supabase so we can skip them."""
    ids, start, page = set(), 0, 1000
    while True:
        resp = sb.table("chunks").select("id").range(start, start + page - 1).execute()
        batch = resp.data or []
        ids.update(r["id"] for r in batch)
        if len(batch) < page:
            return ids
        start += page


def batched(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def upsert_resilient(sb, rows, sub=25, retries=5):
    """Upsert in small sub-batches with retry. Inserting into the HNSW vector
    index is slow, so big statements can trip Supabase's statement timeout (57014);
    small batches stay under it, and we back off + retry any that still time out."""
    import time
    for i in range(0, len(rows), sub):
        part = rows[i:i + sub]
        for attempt in range(1, retries + 1):
            try:
                sb.table("chunks").upsert(part).execute()
                break
            except Exception as e:
                msg = str(e)
                transient = "57014" in msg or "timeout" in msg.lower()
                if not transient or attempt == retries:
                    raise
                time.sleep(min(2 * attempt, 10))


def main():
    ap = argparse.ArgumentParser(description="Embed chunks and load into Supabase.")
    ap.add_argument("--limit", type=int, default=None, help="only process first N chunks")
    ap.add_argument("--reembed", action="store_true", help="re-embed even if already loaded")
    ap.add_argument("--batch", type=int, default=config.VOYAGE_BATCH)
    ap.add_argument("--chunks", default=None, help="path to a chunks.jsonl (default: data/chunks.jsonl)")
    args = ap.parse_args()

    chunks = load_chunks(args.limit, path=args.chunks)
    print(f"Loaded {len(chunks)} chunks from {args.chunks or config.CHUNKS_JSONL.name}.")

    sb = config.supabase_client()
    if not args.reembed:
        have = existing_ids(sb)
        before = len(chunks)
        chunks = [c for c in chunks if c["id"] not in have]
        print(f"{len(have)} already in Supabase; {before - len(chunks)} skipped, "
              f"{len(chunks)} to embed.")

    if not chunks:
        print("Nothing to do.")
        return

    done = 0
    for batch in batched(chunks, args.batch):
        texts = [c["content"] for c in batch]
        embeddings = config.embed_documents(texts)
        rows = []
        for c, emb in zip(batch, embeddings):
            rows.append({
                "id": c["id"],
                "video_id": c["video_id"],
                "title": c["title"],
                "url": c["url"],
                "published_at": c.get("published_at"),
                "start_seconds": c["start_seconds"],
                "end_seconds": c["end_seconds"],
                "ts": c["timestamp"],
                "deep_link": c["deep_link"],
                "content": c["content"],
                "token_count": c["token_count"],
                "embedding": emb,
            })
        upsert_resilient(sb, rows)
        done += len(rows)
        print(f"  embedded + upserted {done}/{len(chunks)}", flush=True)

    print(f"\nDone. {done} chunks live in Supabase.")


if __name__ == "__main__":
    main()
