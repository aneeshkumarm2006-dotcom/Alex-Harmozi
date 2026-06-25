#!/usr/bin/env python3
"""
Best-effort token-usage logging to Supabase (usage_log table, schema_usage.sql).

Called after each Voyage embed and Claude generation. Logging must NEVER break a
chat, so every failure is swallowed (printed to stderr only).
"""

import sys


def log(provider, model, input_tokens=0, output_tokens=0, total_tokens=None, note=None):
    try:
        import config
        total = total_tokens if total_tokens is not None else (input_tokens or 0) + (output_tokens or 0)
        config.supabase_client().table("usage_log").insert({
            "provider": provider,
            "model": model,
            "input_tokens": int(input_tokens or 0),
            "output_tokens": int(output_tokens or 0),
            "total_tokens": int(total or 0),
            "note": note,
        }).execute()
    except Exception as e:  # never let usage logging break a request
        print(f"[usage] log failed: {e}", file=sys.stderr)
