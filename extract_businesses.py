#!/usr/bin/env python3
"""
Extract real business case studies from the Hormozi transcripts.

For every video, Claude reads the transcript and pulls out each instance where a
SPECIFIC real business/person's situation is discussed and Alex gives advice --
{business, niche, situation, advice, timestamp}. Pure monologue/teaching -> none.

Output:
  data/business_cases.jsonl    one JSON record per case (video_id, title, url,
                               deep_link, timestamp, business, niche, situation, advice)
  data/extract_progress.json   processed video_ids (resumable)

Run:
  python extract_businesses.py --limit 8         # smoke test
  python extract_businesses.py                   # full run (Sonnet, ~$ real cost)
  python extract_businesses.py --workers 5       # concurrency
"""

import argparse
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import config

ROOT = Path(__file__).resolve().parent
SOURCES = [
    (ROOT / "data" / "videos.json", ROOT / "data" / "transcripts"),
    (ROOT / "data_moremozi" / "videos.json", ROOT / "data_moremozi" / "transcripts"),
]
OUT = ROOT / "data" / "business_cases.jsonl"
PROGRESS = ROOT / "data" / "extract_progress.json"

SYSTEM = (
    "You extract real business case studies from Alex Hormozi video transcripts. "
    "A 'case' is any moment where a SPECIFIC real business or person's situation is "
    "discussed and Alex gives them concrete advice (e.g. a guest, a coaching moment, "
    "an audience Q&A, a named company he analyzes). Ignore purely general teaching, "
    "monologue, or hypotheticals with no specific business. Be precise; do not invent."
)

INSTRUCTION = (
    "Extract every real business case from this transcript. The transcript has "
    "[t=SECONDS] time markers.\n\n"
    "Return ONLY a JSON array (no prose). [] if there are no specific business cases.\n"
    "Each item: {\n"
    '  "business": short name/descriptor of the person or company,\n'
    '  "niche": industry/type (e.g. "gym", "SaaS", "agency", "ecommerce"),\n'
    '  "situation": their problem/context in 1-2 sentences,\n'
    '  "advice": what Alex told them to do, in 1-3 sentences,\n'
    '  "start_seconds": integer of the nearest [t=] marker where this is discussed\n'
    "}"
)


def load_meta():
    meta = {}
    for vpath, _ in SOURCES:
        if vpath.exists():
            for v in json.loads(vpath.read_text()):
                meta[v["video_id"]] = v
    return meta


def list_transcripts():
    out = []
    for _, tdir in SOURCES:
        if tdir.exists():
            for p in tdir.glob("*.json"):
                out.append((p.stem, p))
    return out


def build_text(snippets, every=30, max_chars=120_000):
    parts, nextmark = [], 0.0
    for s in snippets:
        st = float(s.get("start", 0) or 0)
        if st >= nextmark:
            parts.append(f"[t={int(st)}]")
            nextmark = st + every
        t = (s.get("text") or "").strip()
        if t:
            parts.append(t)
    return " ".join(parts)[:max_chars]


def fmt_ts(sec):
    sec = int(sec or 0)
    h, r = divmod(sec, 3600)
    m, s = divmod(r, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def parse_json_array(text):
    a, b = text.find("["), text.rfind("]")
    if a == -1 or b == -1 or b < a:
        return []
    try:
        return json.loads(text[a:b + 1])
    except Exception:
        return []


def extract_one(vid, path, meta, attempts=4):
    snippets = json.loads(path.read_text())
    text = build_text(snippets)
    if not text.strip():
        return vid, []
    m = meta.get(vid, {})
    title = m.get("title", "")
    url = m.get("url", f"https://www.youtube.com/watch?v={vid}")

    user = f"Title: {title}\n\nTranscript:\n{text}\n\n{INSTRUCTION}"
    last = None
    for n in range(1, attempts + 1):
        try:
            raw = config.generate(SYSTEM, [{"role": "user", "content": user}],
                                  max_tokens=2000, note="extract")
            cases = parse_json_array(raw)
            out = []
            for c in cases:
                if not isinstance(c, dict) or not c.get("business"):
                    continue
                start = c.get("start_seconds") or 0
                try:
                    start = int(start)
                except Exception:
                    start = 0
                out.append({
                    "video_id": vid, "title": title, "url": url,
                    "deep_link": f"{url}&t={start}s", "timestamp": fmt_ts(start),
                    "business": c.get("business", ""), "niche": c.get("niche", ""),
                    "situation": c.get("situation", ""), "advice": c.get("advice", ""),
                })
            return vid, out
        except Exception as e:
            last = e
            # back off harder on rate limits (Gemini free tier is ~15 RPM)
            wait = min(8 * n, 45) if "429" in str(e) else min(3 * n, 15)
            time.sleep(wait)
    print(f"  ! {vid}: gave up ({last})", flush=True)
    return vid, None  # None = failed (don't mark processed)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    meta = load_meta()
    todo_all = list_transcripts()
    processed = set(json.loads(PROGRESS.read_text())) if PROGRESS.exists() else set()
    todo = [(v, p) for v, p in todo_all if v not in processed]
    if args.limit:
        todo = todo[: args.limit]

    print(f"{len(todo_all)} transcripts, {len(processed)} done, {len(todo)} to scan "
          f"(provider={config.GENERATION_PROVIDER}, model={config.ACTIVE_MODEL}, workers={args.workers}).")

    fout = open(OUT, "a", encoding="utf-8")
    cases_found = 0
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(extract_one, v, p, meta): v for v, p in todo}
        for fut in as_completed(futs):
            vid, cases = fut.result()
            done += 1
            if cases is None:
                continue  # failed; retry on next run
            for c in cases:
                fout.write(json.dumps(c, ensure_ascii=False) + "\n")
            cases_found += len(cases)
            processed.add(vid)
            if done % 20 == 0 or done == len(todo):
                fout.flush()
                PROGRESS.write_text(json.dumps(sorted(processed)))
                print(f"  [{done}/{len(todo)}] {cases_found} cases so far", flush=True)

    fout.flush(); fout.close()
    PROGRESS.write_text(json.dumps(sorted(processed)))
    print(f"\nDone. {cases_found} business cases -> {OUT}")


if __name__ == "__main__":
    main()
