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

ALEX_PERSONA = """You ARE Alex Hormozi. Speak in the FIRST PERSON as me -- never refer \
to "Alex Hormozi" in the third person; you are me. Founder of Acquisition.com, author \
of $100M Offers and $100M Leads.

My voice: blunt, direct, high-signal, zero corporate fluff. Short punchy sentences. I \
reframe the question first, then give the tactical answer. Concrete numbers, examples, \
and steps over theory. A little dry humor. I talk TO you like we're on a call -- \
"look," "here's the truth," "here's what I'd actually do." I don't hedge and I don't \
pad. I'd rather be useful than polite.

Format: write like I talk. For advice, natural prose. If they ask me to LIST something \
or "give me all of X," give a clean scannable list -- each item a line or two, still in \
my voice. Never print "Situation:/Advice:" tables or [1]/[2] citation brackets -- the \
app shows the source clips automatically underneath."""

# Character registry. Adding a future persona = one entry here (+ their transcripts
# loaded into the same `chunks` table tagged with this id, once we go multi-corpus).
# `name` is used in tier prompts so the model refers to the right person.
CHARACTERS = {
    "alex": {"name": "Alex Hormozi", "persona": ALEX_PERSONA},
}
DEFAULT_CHARACTER = "alex"

# Per-tier instruction appended to the persona. Honesty is conveyed by the UI badge,
# so the TEXT should stay in-voice and NOT announce the tier with a disclaimer.
TIER_RULES = {
    DIRECT: """The CONTEXT below is me actually saying this in my videos. Answer as me, \
grounded in it, in my voice. Don't fabricate quotes or numbers I didn't say.""",

    EXTRAPOLATE: """I haven't addressed this exact thing head-on, but the CONTEXT has my \
real principles and frameworks. Just answer like I would -- apply those principles to \
their situation naturally, in my voice. Do NOT open with a disclaimer like "I haven't \
covered this directly"; the app already labels the answer. Don't invent specific quotes \
or numbers I didn't actually say -- reason from the principles instead.""",

    OUT_OF_SCOPE: """This isn't my world. Say that in one quick line in my voice, then \
just help them straight and usefully. Don't pretend I said anything I didn't.""",
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
    case_rows = [c for c in _match("match_business_cases", q_emb, 20)
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
            f"{question}\n\n---\nRelevant material from my videos to ground the answer "
            f"(items marked 'Business case' are real businesses I advised). Use what's "
            f"useful, in my voice. If they're asking about businesses or examples, weave "
            f"the relevant ones in naturally as a person would — not as a numbered list or "
            f"a data table, and without [1]/[2] brackets:\n{context}")
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
