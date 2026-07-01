#!/usr/bin/env python3
"""
Load data/business_cases.jsonl into Supabase `business_cases`, WITH embeddings so
the normal chat can retrieve relevant cases. Run schema_business.sql first.
Idempotent: clears the table, embeds, re-inserts.

  python load_business_cases.py
"""

import json
from pathlib import Path

import config

SRC = Path(__file__).resolve().parent / "data" / "business_cases.jsonl"
FIELDS = ("video_id", "title", "url", "deep_link", "timestamp",
          "business", "niche", "situation", "advice")


def case_text(r):
    return f"{r.get('business','')}. {r.get('niche','')}. {r.get('situation','')} {r.get('advice','')}".strip()


def main():
    rows = [json.loads(l) for l in open(SRC, encoding="utf-8") if l.strip()]
    print(f"{len(rows)} cases from {SRC.name}")
    sb = config.supabase_client()

    # embed in Voyage batches
    embeddings = []
    B = config.VOYAGE_BATCH
    for i in range(0, len(rows), B):
        batch = rows[i:i + B]
        embeddings.extend(config.embed_documents([case_text(r) for r in batch]))
        print(f"  embedded {min(i + B, len(rows))}/{len(rows)}", flush=True)

    # clear + insert with embeddings
    sb.table("business_cases").delete().neq("id", 0).execute()
    clean = [{**{k: r.get(k) for k in FIELDS}, "embedding": emb}
             for r, emb in zip(rows, embeddings)]
    for i in range(0, len(clean), 300):
        sb.table("business_cases").insert(clean[i:i + 300]).execute()
        print(f"  inserted {min(i + 300, len(clean))}/{len(clean)}", flush=True)

    print("Done.")


if __name__ == "__main__":
    main()
