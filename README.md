# Chat with Alex Hormozi

RAG over 527 long-form Hormozi transcripts. Ask a question → get what Alex
actually said (with the timestamped clip), and when he hasn't covered it, an
answer reasoned from his frameworks — clearly labeled.

## Stack
- **Supabase / pgvector** — vector store (Postgres)
- **Voyage AI** (`voyage-3`) — embeddings
- **Claude** (`claude-sonnet-4-6` by default) — generation
- **FastAPI** + a tiny static frontend — the app

## The 3-tier answer policy
Every question is embedded and matched against the corpus; the top cosine
similarity decides the mode (cutoffs in `config.py`, tune after first load):

| Tier | When | Behavior |
|------|------|----------|
| **DIRECT** | top sim ≥ `DIRECT_THRESHOLD` (0.62) | Alex addressed it — answer grounded in his words, cite the clips |
| **EXTRAPOLATE** | ≥ `EXTRAPOLATE_THRESHOLD` (0.45) | Reason from his real, cited frameworks; labeled as inferred |
| **OUT_OF_SCOPE** | below | Say "Alex hasn't covered this," then answer normally outside the persona |

It never fabricates a quote: real answers carry the timestamp + deep link; inferred ones are marked inferred.

## Files
| File | Role |
|------|------|
| `pull_videos.py` | stages 1–3: list videos, durations, fetch transcripts *(done)* |
| `chunk.py` | stage 4a: snippets → ~400-tok overlapping chunks w/ timestamps |
| `schema.sql` | Supabase table + HNSW/FTS indexes + `match_chunks` RPC |
| `ingest.py` | stage 4b: embed (Voyage) + load into Supabase (resumable) |
| `engine.py` | retrieve → tier → generate (shared core); multi-character registry |
| `api.py` | FastAPI server (`/chat`, `/health`); Supabase-JWT auth; serves `web/dist` |
| `ask.py` | terminal tester / REPL (set `REQUIRE_AUTH=false`) |
| `web/` | React + Vite + Tailwind app: Login → Character select → Chat |
| `config.py` | all config + lazy clients |

## Setup
```bash
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill in VOYAGE / SUPABASE / ANTHROPIC keys
```
Then run `schema.sql` once in the Supabase SQL editor.

## Run
```bash
# 1. Chunk (no keys needed)
python chunk.py                      # or: python chunk.py --max 5  (smoke test)

# 2. Embed + load into Supabase
python ingest.py                     # or: python ingest.py --limit 200

# 3a. Ask from the terminal (no auth)
REQUIRE_AUTH=false python ask.py "How do I price my first offer?"

# 3b. Or run the full web app (two terminals in dev)
uvicorn api:app --reload --port 8000          # backend API on :8000
cd web && cp .env.example .env.local          # add VITE_SUPABASE_URL + anon key
npm install && npm run dev                     # frontend on :5173 (proxies /chat -> :8000)
# open http://localhost:5173

# Production: `cd web && npm run build` then just run uvicorn -- it serves web/dist at /
```

### Auth setup (Supabase)
In the Supabase dashboard: **Authentication → Providers → Email** (enable). For
self-serve signup during dev, turn **email confirmation OFF** so accounts work
instantly. The browser uses the **anon** key (`web/.env.local`); the backend
verifies each request's JWT with the **service** key it already has.

## Tuning the thresholds
After the first load, run a handful of real questions through `ask.py` — it
prints the top similarity per answer. Pick `DIRECT_THRESHOLD` just below the
scores of questions Alex clearly covers, and `EXTRAPOLATE_THRESHOLD` above
random/off-topic scores. Override via env without touching code.

## Notes
- 7 videos have no captions (`no_transcript` in `manifest.json`) — skipped. We can
  Whisper-transcribe them later if you want full coverage.
- `videos.json` holds the full channel (incl. Shorts); only `status: ok` long-form
  transcripts are chunked.
- CORS is wide open for dev — lock `allow_origins` in `api.py` before deploying.
