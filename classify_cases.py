#!/usr/bin/env python3
"""
Tag each business_case as:
  owner_question -- an EXTERNAL business owner/person brought their own business or
                    situation and asked Alex for help (audience Q&A, coaching, guest).
  own_business   -- one of Alex's own companies (Gym Launch, Allen/useallen, Prestige
                    Labs, Acquisition.com, his gyms, School/Skool, etc.).
  example        -- a generic/hypothetical example or a company he just references.

Fills business_cases.case_type. Run schema line first:
  alter table business_cases add column if not exists case_type text;

  python classify_cases.py
"""

import json

import config

BATCH = 40
SYSTEM = (
    "You classify Alex Hormozi business cases. For each item decide if it's a real "
    "EXTERNAL business owner asking Alex about THEIR OWN business (owner_question), one "
    "of ALEX'S OWN companies (own_business), or a generic/hypothetical example he just "
    "references (example). Be strict: Gym Launch, Allen/useallen, Prestige Labs, "
    "Acquisition.com, Skool/School, 'my gyms', 'my software' = own_business."
)


def classify(batch):
    listing = "\n".join(
        f'{c["id"]}: business="{c.get("business","")}" niche="{c.get("niche","")}" '
        f'situation="{(c.get("situation","") or "")[:200]}"'
        for c in batch
    )
    prompt = (
        f"Classify each. Return ONLY a JSON array of "
        f'{{"id": <id>, "type": "owner_question|own_business|example"}}:\n\n{listing}')
    raw = config.generate(SYSTEM, [{"role": "user", "content": prompt}], max_tokens=1500, note="classify")
    a, b = raw.find("["), raw.rfind("]")
    try:
        return json.loads(raw[a:b + 1]) if a != -1 else []
    except Exception:
        return []


def main():
    sb = config.supabase_client()
    rows, start = [], 0
    while True:
        d = sb.table("business_cases").select("id,business,niche,situation").range(start, start + 999).execute().data or []
        rows += d
        if len(d) < 1000:
            break
        start += 1000
    print(f"{len(rows)} cases to classify")

    counts = {}
    done = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i + BATCH]
        for item in classify(batch):
            t = item.get("type")
            cid = item.get("id")
            if t not in ("owner_question", "own_business", "example") or cid is None:
                continue
            try:
                sb.table("business_cases").update({"case_type": t}).eq("id", cid).execute()
                counts[t] = counts.get(t, 0) + 1
            except Exception:
                pass
        done += len(batch)
        print(f"  {done}/{len(rows)}  {counts}", flush=True)

    print("Done.", counts)


if __name__ == "__main__":
    main()
