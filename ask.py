#!/usr/bin/env python3
"""
CLI tester -- chat with Alex from the terminal (no frontend needed).

  python ask.py "How do I price my first offer?"     # one-shot
  python ask.py                                       # interactive REPL

Shows the tier and the cited sources (with timestamped YouTube links) so you can
sanity-check retrieval and tune the thresholds in config.py.
"""

import sys

import engine

TIER_LABEL = {
    "direct": "DIRECT  (Alex addressed this)",
    "extrapolate": "EXTRAPOLATE  (inferred from his frameworks)",
    "out_of_scope": "OUT OF SCOPE  (answered normally)",
}


def show(ans):
    print(f"\n[tier: {TIER_LABEL.get(ans.tier, ans.tier)} | top sim {ans.top_similarity}]\n")
    print(ans.answer)
    if ans.sources:
        print("\nSources:")
        for s in ans.sources:
            print(f"  [{s.n}] {s.title} @ {s.timestamp}  (sim {s.similarity})")
            print(f"       {s.deep_link}")
    print()


def main():
    if len(sys.argv) > 1:
        show(engine.answer(" ".join(sys.argv[1:])))
        return

    print("Ask Alex -- type a question (Ctrl-C or 'quit' to exit).\n")
    history = []
    while True:
        try:
            q = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if not q or q.lower() in {"quit", "exit"}:
            return
        ans = engine.answer(q, history=history)
        show(ans)
        # keep a light multi-turn memory (answers only, no context bloat)
        history.append({"role": "user", "content": q})
        history.append({"role": "assistant", "content": ans.answer})
        history = history[-8:]  # cap


if __name__ == "__main__":
    main()
