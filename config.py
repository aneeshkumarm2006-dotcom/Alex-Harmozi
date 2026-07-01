#!/usr/bin/env python3
"""
Shared configuration + lazy client factories for the "Chat with Alex Hormozi" build.

Everything reads from environment variables (load a .env first -- see .env.example).
Nothing here makes a network call at import time; clients are built on first use so
that chunk.py (which needs no keys) can import this module freely.
"""

import os
from functools import lru_cache
from pathlib import Path

# ----------------------------- paths -----------------------------

ROOT = Path(__file__).resolve().parent

# Load .env (if present) so every entrypoint inherits the keys. `export ` prefix ok.
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass
DATA_DIR = ROOT / "data"
TRANSCRIPTS_DIR = DATA_DIR / "transcripts"
VIDEOS_JSON = DATA_DIR / "videos.json"
MANIFEST_JSON = DATA_DIR / "manifest.json"
CHUNKS_JSONL = DATA_DIR / "chunks.jsonl"

# ----------------------------- chunking -----------------------------

MAX_CHUNK_TOKENS = int(os.environ.get("MAX_CHUNK_TOKENS", "400"))
OVERLAP_TOKENS = int(os.environ.get("OVERLAP_TOKENS", "60"))

# ----------------------------- embeddings (Voyage AI) -----------------------------

VOYAGE_MODEL = os.environ.get("VOYAGE_MODEL", "voyage-3")
# voyage-3 / voyage-3-large default to 1024 dims. Keep this in sync with schema.sql.
EMBED_DIM = int(os.environ.get("EMBED_DIM", "1024"))
VOYAGE_BATCH = int(os.environ.get("VOYAGE_BATCH", "128"))  # Voyage caps at 128 texts/request

# ----------------------------- generation (Claude / Gemini) -----------------------------

ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
GEN_MAX_TOKENS = int(os.environ.get("GEN_MAX_TOKENS", "2048"))
# Which LLM writes answers/extracts. Defaults to gemini if a Gemini key is set.
GENERATION_PROVIDER = (os.environ.get("GENERATION_PROVIDER")
                       or ("gemini" if os.environ.get("GEMINI_API_KEY") else "anthropic")).lower()
ACTIVE_MODEL = GEMINI_MODEL if GENERATION_PROVIDER == "gemini" else ANTHROPIC_MODEL

# ----------------------------- retrieval + tiering -----------------------------

# Require a valid Supabase JWT on /chat. Set REQUIRE_AUTH=false to disable (e.g. CLI/dev).
REQUIRE_AUTH = os.environ.get("REQUIRE_AUTH", "true").lower() in ("1", "true", "yes")

TOP_K = int(os.environ.get("TOP_K", "8"))
# Cosine similarity cutoffs. Tune these after the first load (see README "Tuning").
#   >= DIRECT_THRESHOLD      -> Tier 1: Alex addressed it; answer grounded + cited.
#   >= EXTRAPOLATE_THRESHOLD -> Tier 2: extrapolate from his frameworks (labeled inferred).
#   below                    -> Tier 3: out of scope; say so, then answer normally.
# Tuned against voyage-3 on the Hormozi corpus (2026-06): core topics score
# ~0.58-0.64, novel-but-related ~0.51-0.55, off-topic ~0.34-0.40.
DIRECT_THRESHOLD = float(os.environ.get("DIRECT_THRESHOLD", "0.56"))
EXTRAPOLATE_THRESHOLD = float(os.environ.get("EXTRAPOLATE_THRESHOLD", "0.45"))

# ----------------------------- clients (lazy, cached) -----------------------------


def _require(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(f"Missing environment variable {name!r}. See .env.example.")
    return val


@lru_cache(maxsize=1)
def voyage_client():
    import voyageai
    return voyageai.Client(api_key=_require("VOYAGE_API_KEY"))


@lru_cache(maxsize=1)
def supabase_client():
    from supabase import create_client
    return create_client(_require("SUPABASE_URL"), _require("SUPABASE_SERVICE_KEY"))


@lru_cache(maxsize=1)
def anthropic_client():
    from anthropic import Anthropic
    return Anthropic(api_key=_require("ANTHROPIC_API_KEY"))


# ----------------------------- embedding helpers -----------------------------


def embed_documents(texts):
    """Embed a batch of corpus chunks. Returns a list of float vectors."""
    res = voyage_client().embed(texts, model=VOYAGE_MODEL, input_type="document")
    _log_voyage(res, note="ingest")
    return res.embeddings


def embed_query(text):
    """Embed a single user question (asymmetric: input_type='query')."""
    res = voyage_client().embed([text], model=VOYAGE_MODEL, input_type="query")
    _log_voyage(res, note="query")
    return res.embeddings[0]


def _log_voyage(res, note):
    try:
        import usage
        usage.log("voyage", VOYAGE_MODEL, total_tokens=getattr(res, "total_tokens", 0), note=note)
    except Exception:
        pass


# ----------------------------- generation (provider-agnostic) -----------------------------


def _log_gen(input_tokens, output_tokens, note=None):
    try:
        import usage
        prov = "gemini" if GENERATION_PROVIDER == "gemini" else "anthropic"
        usage.log(prov, ACTIVE_MODEL, input_tokens=input_tokens, output_tokens=output_tokens, note=note)
    except Exception:
        pass


def _gemini_contents(messages):
    # Gemini uses roles "user"/"model" and a separate system_instruction.
    return [{"role": "model" if m["role"] == "assistant" else "user",
             "parts": [{"text": m["content"]}]} for m in messages]


def _gemini_url(stream):
    verb = "streamGenerateContent?alt=sse&" if stream else "generateContent?"
    return (f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{GEMINI_MODEL}:{verb}key={_require('GEMINI_API_KEY')}")


def generate(system, messages, max_tokens=None, note=None):
    """Blocking generation. Returns the answer text. Dispatches by provider."""
    max_tokens = max_tokens or GEN_MAX_TOKENS
    if GENERATION_PROVIDER == "gemini":
        import requests
        body = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": _gemini_contents(messages),
            "generationConfig": {"maxOutputTokens": max_tokens,
                                 "thinkingConfig": {"thinkingBudget": 0}},
        }
        r = requests.post(_gemini_url(False), json=body, timeout=180)
        r.raise_for_status()
        d = r.json()
        parts = d.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts)
        um = d.get("usageMetadata", {})
        _log_gen(um.get("promptTokenCount", 0), um.get("candidatesTokenCount", 0), note)
        return text
    resp = anthropic_client().messages.create(
        model=ANTHROPIC_MODEL, max_tokens=max_tokens, system=system, messages=messages)
    text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
    u = getattr(resp, "usage", None)
    _log_gen(getattr(u, "input_tokens", 0), getattr(u, "output_tokens", 0), note)
    return text


def generate_stream(system, messages, max_tokens=None, note=None):
    """Streaming generation. Yields text chunks. Dispatches by provider."""
    max_tokens = max_tokens or GEN_MAX_TOKENS
    if GENERATION_PROVIDER == "gemini":
        import json as _json
        import requests
        body = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": _gemini_contents(messages),
            "generationConfig": {"maxOutputTokens": max_tokens,
                                 "thinkingConfig": {"thinkingBudget": 0}},
        }
        pin = pout = 0
        with requests.post(_gemini_url(True), json=body, stream=True, timeout=180) as r:
            r.raise_for_status()
            for raw in r.iter_lines():
                if not raw:
                    continue
                line = raw.decode("utf-8")
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if not payload:
                    continue
                try:
                    d = _json.loads(payload)
                except Exception:
                    continue
                for cand in d.get("candidates", []):
                    for p in cand.get("content", {}).get("parts", []):
                        if p.get("text"):
                            yield p["text"]
                um = d.get("usageMetadata")
                if um:
                    pin = um.get("promptTokenCount", pin)
                    pout = um.get("candidatesTokenCount", pout)
        _log_gen(pin, pout, note)
        return
    with anthropic_client().messages.stream(
        model=ANTHROPIC_MODEL, max_tokens=max_tokens, system=system, messages=messages) as stream:
        for chunk in stream.text_stream:
            yield chunk
        final = stream.get_final_message()
    u = getattr(final, "usage", None)
    _log_gen(getattr(u, "input_tokens", 0), getattr(u, "output_tokens", 0), note)
