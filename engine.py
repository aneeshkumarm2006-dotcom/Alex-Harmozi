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

from dataclasses import dataclass, field
from typing import List

import config

DIRECT, EXTRAPOLATE, OUT_OF_SCOPE = "direct", "extrapolate", "out_of_scope"

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
    """Return raw match rows from Supabase, best first."""
    top_k = top_k or config.TOP_K
    q_emb = config.embed_query(question)
    resp = config.supabase_client().rpc(
        "match_chunks", {"query_embedding": q_emb, "match_count": top_k}
    ).execute()
    return resp.data or []


def _build_context(rows):
    blocks = []
    for i, r in enumerate(rows, 1):
        blocks.append(
            f"[{i}] {r['title']} (at {r.get('ts','?')})\n{r['content']}"
        )
    return "\n\n".join(blocks)


def _log_claude(resp, tier):
    """Best-effort Claude usage logging (never breaks the answer)."""
    try:
        import usage
        u = getattr(resp, "usage", None)
        usage.log("anthropic", config.ANTHROPIC_MODEL,
                  input_tokens=getattr(u, "input_tokens", 0),
                  output_tokens=getattr(u, "output_tokens", 0),
                  note=tier)
    except Exception:
        pass


def _prepare(question, history, top_k, character):
    """Shared retrieve -> tier -> prompt build for both the sync and stream paths.
    Returns (system, messages, tier, sources, top_sim)."""
    char = CHARACTERS.get(character) or CHARACTERS[DEFAULT_CHARACTER]
    rows = retrieve(question, top_k)
    top_sim = rows[0]["similarity"] if rows else 0.0
    tier = classify(top_sim)

    # Out of scope: don't feed irrelevant context as if it were the persona's view.
    context_rows = rows if tier != OUT_OF_SCOPE else []
    context = _build_context(context_rows)
    system = f"{char['persona']}\n\n{TIER_RULES[tier].format(name=char['name'])}"

    user_block = question
    if context:
        user_block = f"{question}\n\n---\nCONTEXT (numbered sources):\n{context}"
    messages = list(history or [])
    messages.append({"role": "user", "content": user_block})

    sources = [
        Source(
            n=i, title=r["title"], deep_link=r["deep_link"], timestamp=r.get("ts", ""),
            similarity=round(r["similarity"], 4), video_id=r["video_id"],
            snippet=(r["content"][:160] + "...") if len(r["content"]) > 160 else r["content"],
        )
        for i, r in enumerate(context_rows, 1)
    ]
    return system, messages, tier, sources, round(top_sim, 4)


def answer(question: str, history=None, top_k: int = None,
           character: str = DEFAULT_CHARACTER) -> Answer:
    """Full pipeline (blocking): retrieve -> tier -> generate the whole answer."""
    system, messages, tier, sources, top_sim = _prepare(question, history, top_k, character)
    resp = config.anthropic_client().messages.create(
        model=config.ANTHROPIC_MODEL,
        max_tokens=config.GEN_MAX_TOKENS,
        system=system,
        messages=messages,
    )
    text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
    _log_claude(resp, tier)
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
    final = None
    with config.anthropic_client().messages.stream(
        model=config.ANTHROPIC_MODEL,
        max_tokens=config.GEN_MAX_TOKENS,
        system=system,
        messages=messages,
    ) as stream:
        for chunk in stream.text_stream:
            yield ("delta", chunk)
        final = stream.get_final_message()
    if final is not None:
        _log_claude(final, tier)
    yield ("done", {})
