import { useEffect, useState } from 'react'
import { getUsage } from '../lib/api'

// Owner dashboard: how much Voyage (embeddings) and Claude (answers) we've used,
// what's left on the free tier, and estimated cost. Reads the backend /usage.
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n))

export default function UsagePanel() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    getUsage().then(setData).catch((e) => setErr(e.message))
  }, [])

  if (err) {
    return (
      <div className="rounded-[16px] border border-border bg-surface px-5 py-4 text-[13px] text-faint">
        Usage unavailable: {err}
      </div>
    )
  }
  if (!data) {
    return (
      <div className="rounded-[16px] border border-border bg-surface px-5 py-4 text-[13px] text-faint">
        Loading usage…
      </div>
    )
  }

  const v = data.voyage
  const c = data.claude

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* Voyage */}
      <div className="rounded-[16px] border border-border bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-semibold tracking-[0.02em] text-text">Voyage · embeddings</span>
          <span className="text-[12px] text-direct">${v.est_cost_usd.toFixed(2)} billed</span>
        </div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="font-display text-[24px] font-bold">{fmt(v.tokens_used)}</span>
          <span className="text-[12px] text-muted">of {fmt(v.free_tokens)} free</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-direct"
            style={{ width: `${Math.min(100, Math.max(1.5, v.pct_of_free))}%` }}
          />
        </div>
        <div className="mt-2 text-[11.5px] text-faint">
          {fmt(v.free_remaining)} tokens left on the free tier · {v.calls} calls
        </div>
      </div>

      {/* Claude */}
      <div className="rounded-[16px] border border-border bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-semibold tracking-[0.02em] text-text">Claude · answers</span>
          <span className="text-[12px] text-gold">${c.est_cost_usd.toFixed(2)} est.</span>
        </div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="font-display text-[24px] font-bold">{fmt(c.total_tokens)}</span>
          <span className="text-[12px] text-muted">{c.calls} answers</span>
        </div>
        <div className="flex gap-2 text-[11.5px] text-faint">
          <span>in {fmt(c.input_tokens)}</span>
          <span>·</span>
          <span>out {fmt(c.output_tokens)}</span>
          <span>·</span>
          <span>{c.model}</span>
        </div>
        <div className="mt-2 text-[11.5px] text-faint">Cost is an estimate at list prices.</div>
      </div>
    </div>
  )
}
