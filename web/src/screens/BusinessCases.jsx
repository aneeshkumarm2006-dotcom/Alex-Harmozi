import { useEffect, useState, useRef, useCallback } from 'react'
import { getBusinessCases, getBusinessFacets } from '../lib/api'

// Owner-only: browse every real business Alex advised, with his advice and a deep
// link to the exact clip. Search + filter by niche + infinite scroll.
const PAGE = 100

export default function BusinessCases({ onBack }) {
  const [q, setQ] = useState('')
  const [niche, setNiche] = useState('')
  const [facets, setFacets] = useState([])
  const [cases, setCases] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const loadingRef = useRef(false)

  useEffect(() => { getBusinessFacets().then((d) => setFacets(d.niches || [])).catch(() => {}) }, [])

  // Load a page. reset=true starts over (new search/filter).
  const loadPage = useCallback(async (reset) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true); setErr('')
    try {
      const off = reset ? 0 : cases.length
      const d = await getBusinessCases({ q, niche, limit: PAGE, offset: off })
      setTotal(d.total ?? 0)
      setCases(reset ? d.cases : (prev) => [...prev, ...d.cases])
    } catch (e) { setErr(e.message) } finally {
      setLoading(false); loadingRef.current = false
    }
  }, [q, niche, cases.length])

  // Reset + first page whenever the search/filter changes (debounced).
  useEffect(() => {
    const t = setTimeout(() => { setCases([]); loadPage(true) }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, niche])

  // Infinite scroll: load the next page as you near the bottom.
  useEffect(() => {
    function onScroll() {
      if (loadingRef.current || (total && cases.length >= total)) return
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 700) loadPage(false)
    }
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [loadPage, total, cases.length])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border-green bg-bg/80 px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button onClick={onBack} aria-label="Back"
            className="pressable flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted hover:text-text">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div>
            <div className="font-display text-[16px] font-semibold">Business cases</div>
            <div className="text-[12px] text-muted">
              showing {cases.length.toLocaleString()} of {total.toLocaleString()} businesses Alex advised
            </div>
          </div>
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-[11px] uppercase tracking-[0.08em] text-gold">Owner</span>
      </header>

      <main className="mx-auto max-w-[900px] px-6 py-7">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search business, situation, or advice…"
          className="mb-4 h-11 w-full rounded-[12px] border border-border bg-surface px-4 text-[15px] text-text outline-none focus:border-accent"
        />

        <div className="mb-6 flex flex-wrap gap-2">
          <Chip active={!niche} onClick={() => setNiche('')} label="All" />
          {facets.slice(0, 16).map((f) => (
            <Chip key={f.niche} active={niche === f.niche} onClick={() => setNiche(f.niche)}
              label={`${f.niche} (${f.n})`} />
          ))}
        </div>

        {err && <div className="mb-4 text-[13px] text-danger">Error: {err}</div>}

        <div className="flex flex-col gap-3">
          {cases.map((c) => (
            <div key={c.id} className="rounded-[14px] border border-border bg-surface p-4">
              <div className="mb-1.5 flex items-start justify-between gap-3">
                <div className="font-display text-[15.5px] font-semibold text-text">{c.business}</div>
                {c.niche && <span className="shrink-0 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11.5px] text-muted">{c.niche}</span>}
              </div>
              {c.situation && <p className="mb-2 text-[13.5px] leading-[1.5] text-muted"><span className="text-faint">Situation: </span>{c.situation}</p>}
              {c.advice && <p className="text-[13.5px] leading-[1.5] text-[#d6d6d2]"><span className="text-direct">Alex's advice: </span>{c.advice}</p>}
              <div className="mt-3 flex items-center justify-between border-t border-[#1f2319] pt-2.5">
                <span className="truncate text-[12px] text-faint">{c.title}</span>
                <a href={c.deep_link} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 font-display text-[12.5px] font-semibold text-accent hover:text-accent-hover">
                  Watch at {c.timestamp} →
                </a>
              </div>
            </div>
          ))}
        </div>

        {loading && <div className="py-6 text-center text-[13px] text-muted">Loading…</div>}
        {!loading && total > 0 && cases.length >= total && (
          <div className="py-6 text-center text-[13px] text-faint">That's all {total.toLocaleString()} — end of list.</div>
        )}
        {!loading && cases.length === 0 && <div className="py-10 text-center text-[14px] text-muted">No cases found.</div>}
      </main>
    </div>
  )
}

function Chip({ active, onClick, label }) {
  return (
    <button onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${active ? 'border-accent bg-[#16190f] text-text' : 'border-border bg-surface text-muted hover:text-text'}`}>
      {label}
    </button>
  )
}
