#!/usr/bin/env python3
"""
FastAPI server -- the deployed "Chat with characters" backend.

Endpoints:
  GET  /            -> serves the built React app (web/dist) if present
  GET  /health      -> liveness + config snapshot
  POST /chat        -> {question, history?, character?} -> {answer, tier, sources, ...}
                       Protected: requires a valid Supabase JWT unless REQUIRE_AUTH=false.

Run (dev):
  uvicorn api:app --reload --port 8000      # API only; run the Vite app separately
  # the Vite dev server (web/) proxies /chat here, so just open http://localhost:5173
"""

from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import config
import engine

app = FastAPI(title="Ask -- characters API")

# Wide-open CORS for prototyping. Lock to your domain before real deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ROOT = Path(__file__).resolve().parent
WEB_DIST = ROOT / "web" / "dist"
if (WEB_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")


# ----------------------------- auth -----------------------------

def require_user(authorization: str = Header(default="")):
    """Validate the Supabase access token from the Authorization header.
    Returns the user (or None when REQUIRE_AUTH is off)."""
    if not config.REQUIRE_AUTH:
        return None
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    try:
        res = config.supabase_client().auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    if not res or not getattr(res, "user", None):
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return res.user


# ----------------------------- models -----------------------------

class Turn(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    history: Optional[List[Turn]] = None
    top_k: Optional[int] = None
    character: str = "alex"


# ----------------------------- routes -----------------------------

@app.get("/")
def root():
    idx = WEB_DIST / "index.html"
    if idx.exists():
        return FileResponse(str(idx))
    return {"ok": True, "msg": "API up. Run the Vite app in web/ (npm run dev), or build it."}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": config.ANTHROPIC_MODEL,
        "embed_model": config.VOYAGE_MODEL,
        "top_k": config.TOP_K,
        "require_auth": config.REQUIRE_AUTH,
        "characters": list(engine.CHARACTERS),
        "thresholds": {
            "direct": config.DIRECT_THRESHOLD,
            "extrapolate": config.EXTRAPOLATE_THRESHOLD,
        },
    }


# Pricing + limits for the usage dashboard (estimates; update if plans change).
VOYAGE_FREE_TOKENS = 200_000_000
VOYAGE_PER_M = 0.06          # $ per 1M tokens after the free tier
CLAUDE_IN_PER_M = 3.00       # claude-sonnet-4-6 input  $ / 1M  (estimate)
CLAUDE_OUT_PER_M = 15.00     # claude-sonnet-4-6 output $ / 1M  (estimate)


@app.get("/usage")
def usage(user=Depends(require_user)):
    """Aggregate token usage + estimated cost for Voyage and Claude."""
    try:
        rows = config.supabase_client().rpc("usage_totals").execute().data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"usage query failed: {e}")
    by = {r["provider"]: r for r in rows}

    v = by.get("voyage", {})
    v_total = int(v.get("total_tokens", 0))
    v_billable = max(0, v_total - VOYAGE_FREE_TOKENS)
    voyage = {
        "tokens_used": v_total,
        "free_tokens": VOYAGE_FREE_TOKENS,
        "free_remaining": max(0, VOYAGE_FREE_TOKENS - v_total),
        "pct_of_free": round(100 * v_total / VOYAGE_FREE_TOKENS, 4),
        "est_cost_usd": round(v_billable / 1_000_000 * VOYAGE_PER_M, 4),
        "calls": int(v.get("calls", 0)),
    }

    c = by.get("anthropic", {})
    c_in = int(c.get("input_tokens", 0))
    c_out = int(c.get("output_tokens", 0))
    claude = {
        "input_tokens": c_in,
        "output_tokens": c_out,
        "total_tokens": c_in + c_out,
        "est_cost_usd": round(c_in / 1_000_000 * CLAUDE_IN_PER_M + c_out / 1_000_000 * CLAUDE_OUT_PER_M, 4),
        "calls": int(c.get("calls", 0)),
        "model": config.ANTHROPIC_MODEL,
    }
    return {"voyage": voyage, "claude": claude}


@app.post("/chat")
def chat(req: ChatRequest, user=Depends(require_user)):
    if req.character not in engine.CHARACTERS:
        raise HTTPException(status_code=400, detail=f"Unknown character: {req.character}")
    try:
        history = [t.model_dump() for t in req.history] if req.history else None
        ans = engine.answer(req.question, history=history, top_k=req.top_k,
                            character=req.character)
        return ans.to_dict()
    except RuntimeError as e:  # missing env var, etc.
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"upstream error: {e}")
