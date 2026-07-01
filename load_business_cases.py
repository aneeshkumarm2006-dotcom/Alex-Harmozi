#!/usr/bin/env python3
"""
Load data/business_cases.jsonl into the Supabase `business_cases` table.
Run schema_business.sql first. Idempotent: clears the table, then re-inserts.

  python load_business_cases.py
"""

import json
from pathlib import Path

import config

SRC = Path(__file__).resolve().parent / "data" / "business_cases.jsonl"
FIELDS = ("video_id", "title", "url", "deep_link", "timestamp",
          "business", "niche", "situation", "advice")


def main():
    rows = [json.loads(l) for l in open(SRC, encoding="utf-8") if l.strip()]
    print(f"{len(rows)} cases from {SRC.name}")
    sb = config.supabase_client()

    # clear existing (idempotent re-load)
    sb.table("business_cases").delete().neq("id", 0).execute()

    clean = [{k: r.get(k) for k in FIELDS} for r in rows]
    for i in range(0, len(clean), 500):
        sb.table("business_cases").insert(clean[i:i + 500]).execute()
        print(f"  inserted {min(i + 500, len(clean))}/{len(clean)}", flush=True)

    print("Done.")


if __name__ == "__main__":
    main()
