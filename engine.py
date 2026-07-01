#!/usr/bin/env python3
"""
The answer engine -- shared by api.py (web) and ask.py (CLI).

Flow for one question:
  1. embed the question (Voyage, input_type="query")
  2. retrieve TOP_K nearest chunks from Supabase (match_chunks RPC)
  3. score-gate the top similarity into one of three tiers
  4. build a tier-specific system prompt + numbered context
  5. ask Claude, return {answer, tier, sources}

Tiers (cutoffs in config.py, tune after first load):
  DIRECT       -- Alex addressed it: answer grounded in his words + cite sources.
  EXTRAPOLATE  -- partial: reason from his real frameworks, labeled as inferred.
  OUT_OF_SCOPE -- not his world: say so, then answer normally (outside the persona).
"""

import os
from dataclasses import dataclass, field
from typing import List

import config

DIRECT, EXTRAPOLATE, OUT_OF_SCOPE = "direct", "extrapolate", "out_of_scope"

# Business cases surface at a lower similarity than transcripts (listing/meta
# phrasings score lower); tuned against voyage-3 on the case corpus.
CASE_FLOOR = float(os.environ.get("CASE_FLOOR", "0.38"))

ALEX_PERSONA = """You are "Ask Alex" -- a coach that answers in the voice and thinking of \
Alex Hormozi (founder of Acquisition.com; author of $100M Offers and $100M Leads). \
His style: blunt, high-signal, no fluff, first-principles, obsessed with offers, \
leverage, volume, sales, and the math of business and self-improvement. Short \
punchy sentences. Concrete over abstract. He often reframes the question before \
answering it."""

# Character registry. Adding a future persona = one entry here (+ their transcripts
# loaded into the same `chunks` table tagged with this id, once we go multi-corpus).
# `name` is used in tier prompts so the model refers to the right person.
CHARACTERS = {
    "alex": {"name": "Alex Hormozi", "persona": ALEX_PERSONA},
}
DEFAULT_CHARACTER = "alex"

# Per-tier instruction appended to the persona. {name} is filled per character.
TIER_RULES = {
    DIRECT: """The retrieved CONTEXT below comes directly from {name}'s videos and is \
highly relevant. Answer grounded in what they actually say. Cite the specific \
sources you use with bracketed numbers like [1], [2] that match the numbered \
context blocks. Do NOT invent quotes or claims they didn't make.""",

    EXTRAPOLATE: """{name} has not addressed this exact situation, but the CONTEXT below \
contains relevant principles and frameworks of theirs. Open with one short line making \
this explicit, e.g. "{name} hasn't covered this directly, but from their frameworks:" \
then apply their real, cited principles to the user's situation. Cite the framework \
sources with [1], [2]. Make clear which parts are their stated principles vs. your \
inference from them. Never fabricate a direct quote.""",

    OUT_OF_SCOPE: """This question is outside {name}'s subject matter -- the \
retrieved context is not relevant. Say so in one honest sentence (e.g. "This isn't \
something {name} covers."), then step OUT of the persona and answer the question \
directly and helpfully as a normal assistant. Do not pretend {name} said anything.""",
}


@dataclass
class Source:
    n: int
    title: str
    deep_link: str
    timestamp: str
    similarity: float
    video_id: str
    snippet: str


@dataclass
class Answer:
    question: str
    tier: str
    answer: str
    top_similarity: float
    sources: List[Source] = field(default_factory=list)

    def to_dict(self):
        return {
            "question": self.question,
            "tier": self.tier,
            "answer": self.answer,
            "top_similarity": self.top_similarity,
            "sources": [s.__dict__ for s in self.sources],
        }


def classify(top_similarity: float) -> str:
    if top_similarity >= config.DIRECT_THRESHOLD:
        return DIRECT
    if top_similarity >= config.EXTRAPOLATE_THRESHOLD:
        return EXTRAPOLATE
    return OUT_OF_SCOPE


def retrieve(question: str, top_k: int = None):
    """Nearest transcript chunks (kept for CLI/threshold tools)."""
    top_k = top_k or config.TOP_K
    return _match("match_chunks", config.embed_query(question), top_k)


def _match(rpc, q_emb, k):
    try:
        return config.supabase_client().rpc(
            rpc, {"query_embedding": q_emb, "match_count": k}).execute().data or []
    except Exception:
        return []  # RPC/table may not exist yet


def _snip(text):
    return (text[:160] + "...") if text and len(text) > 160 else (text or "")


def _prepare(question, history, top_k, character):
    """Retrieve transcript chunks AND business cases -> tier -> prompt.
    Returns (system, messages, tier, sources, top_sim)."""
    char = CHARACTERS.get(character) or CHARACTERS[DEFAULT_CHARACTER]
    top_k = top_k or config.TOP_K
    q_emb = config.embed_query(question)

    chunk_rows = _match("match_chunks", q_emb, top_k)
    # Cases use a lower floor than chunks (listing/meta phrasings score lower).
    case_rows = [c for c in _match("match_business_cases", q_emb, 12)
                 if c.get("similarity", 0) >= CASE_FLOOR]

    chunk_top = chunk_rows[0]["similarity"] if chunk_rows else 0.0
    case_top = case_rows[0]["similarity"] if case_rows else 0.0
    top_sim = max(chunk_top, case_top)
    tier = classify(top_sim)
    # Relevant cases make it answerable even if the transcripts didn't match.
    if tier == OUT_OF_SCOPE and case_rows:
        tier = EXTRAPOLATE
    include_chunks = chunk_top >= config.EXTRAPOLATE_THRESHOLD

    blocks, sources = [], []
    if tier != OUT_OF_SCOPE:
        n = 0
        for r in (chunk_rows if include_chunks else []):
            n += 1
            blocks.append(f"[{n}] {r['title']} (at {r.get('ts','?')})\n{r['content']}")
            sources.append(Source(n=n, title=r["title"], deep_link=r["deep_link"],
                                  timestamp=r.get("ts", ""), similarity=round(r["similarity"], 4),
                                  video_id=r["video_id"], snippet=_snip(r["content"])))
        for r in case_rows:
            n += 1
            blocks.append(
                f"[{n}] Business case — {r.get('business','')} ({r.get('niche','')}), "
                f"at {r.get('timestamp','?')} in \"{r.get('title','')}\". "
                f"Situation: {r.get('situation','')} {char['name']}'s advice: {r.get('advice','')}")
            sources.append(Source(n=n, title=f"{r.get('business','')} — {r.get('title','')}",
                                  deep_link=r["deep_link"], timestamp=r.get("timestamp", ""),
                                  similarity=round(r["similarity"], 4), video_id=r.get("video_id", ""),
                                  snippet=_snip(f"{r.get('situation','')} {r.get('advice','')}")))

    context = "\n\n".join(blocks)
    system = f"{char['persona']}\n\n{TIER_RULES[tier].format(name=char['name'])}"
    user_block = question
    if context:
        user_block = (
            f"{question}\n\n---\nCONTEXT (numbered sources). Items marked 'Business case' "
            f"are real businesses {char['name']} advised — if the user asks about businesses, "
            f"examples, or case studies, list the relevant ones with their clip:\n{context}")
    messages = list(history or [])
    messages.append({"role": "user", "content": user_block})
    return system, messages, tier, sources, round(top_sim, 4)


def answer(question: str, history=None, top_k: int = None,
           character: str = DEFAULT_CHARACTER) -> Answer:
    """Full pipeline (blocking): retrieve -> tier -> generate the whole answer."""
    system, messages, tier, sources, top_sim = _prepare(question, history, top_k, character)
    text = config.generate(system, messages, config.GEN_MAX_TOKENS, note=tier)
    return Answer(question, tier, text.strip(), top_sim, sources)


def answer_stream(question: str, history=None, top_k: int = None,
                  character: str = DEFAULT_CHARACTER):
    """Streaming pipeline. Yields (kind, payload) tuples:
      ("meta",  {tier, top_similarity, sources})  -- once, before any text
      ("delta", "<text chunk>")                    -- many, as Claude writes
      ("done",  {})                                -- once, at the end
    """
    system, messages, tier, sources, top_sim = _prepare(question, history, top_k, character)
    yield ("meta", {
        "tier": tier,
        "top_similarity": top_sim,
        "sources": [s.__dict__ for s in sources],
    })
    for chunk in config.generate_stream(system, messages, config.GEN_MAX_TOKENS, note=tier):
        yield ("delta", chunk)
    yield ("done", {})
