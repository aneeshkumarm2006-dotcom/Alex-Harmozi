import { useEffect, useState, useRef, useCallback } from 'react'
import { getBusinessCases, getBusinessFacets } from '../lib/api'

// Owner-only. Landing = ranked list of the NICHES of businesses whose owners came
// to Alex with a question. Click a niche (or search) to drill into those cases.
// "Owner questions only" is on by default (hides Alex's own businesses + examples).
const PAGE = 100

export default function BusinessCases({ onBack }) {
  const [ownerOnly, setOwnerOnly] = useState(true)
  const [q, setQ] = useState('')
  const [niche, setNiche] = useState('')
  const [facets, setFacets] = useState([])
  const [cases, setCases] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const loadingRef = useRef(false)

  const drilled = !!niche || !!q.trim()
  const totalBusinesses = facets.reduce((s, f) => s + f.n, 0)

  // Facets reload when the owner toggle flips.
  useEffect(() => {
    getBusinessFacets(ownerOnly).then((d) => setFacets(d.niches || [])).catch(() => {})
    setNiche(''); setQ(''); setCases([])
  }, [ownerOnly])

  const loadPage = useCallback(async (reset) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true); setErr('')
    try {
      const off = reset ? 0 : cases.length
      const d = await getBusinessCases({ q, niche, ownerOnly, limit: PAGE, offset: off })
      setTotal(d.total ?? 0)
      setCases(reset ? d.cases : (prev) => [...prev, ...d.cases])
    } catch (e) { setErr(e.message) } finally {
      setLoading(false); loadingRef.current = false
    }
  }, [q, niche, ownerOnly, cases.length])

  // Load cases when drilling in (niche or search); debounce search.
  useEffect(() => {
    if (!drilled) return
    const t = setTimeout(() => { setCases([]); loadPage(true) }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, niche, ownerOnly])

  useEffect(() => {
    function onScroll() {
      if (!drilled || loadingRef.current || (total && cases.length >= total)) return
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 700) loadPage(false)
    }
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [drilled, loadPage, total, cases.length])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border-green bg-bg/80 px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button onClick={onBack} aria-label="Back"
            className="pressable flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted hover:text-text">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div>
            <div className="font-display text-[16px] font-semibold">Businesses that ask Alex</div>
            <div className="text-[12px] text-muted">
              {ownerOnly ? 'owners who came with a question' : 'all cases'} · {totalBusinesses.toLocaleString()} across {facets.length} niches
            </div>
          </div>
        </div>
        <button
          onClick={() => setOwnerOnly((v) => !v)}
          className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${ownerOnly ? 'border-accent text-accent' : 'border-border text-muted hover:text-text'}`}
        >
          {ownerOnly ? '✓ Owner questions only' : 'Owner questions only'}
        </button>
      </header>

      <main className="mx-auto max-w-[900px] px-6 py-7">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a business, niche, situation, or advice…"
          className="mb-5 h-11 w-full rounded-[12px] border border-border bg-surface px-4 text-[15px] text-text outline-none focus:border-accent"
        />

        {err && <div className="mb-4 text-[13px] text-danger">Error: {err}</div>}

        {/* Landing: ranked niche list */}
        {!drilled && (
          <>
            <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">
              Niches, by how often they come to Alex
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {facets.map((f) => (
                <button
                  key={f.niche}
                  onClick={() => setNiche(f.niche)}
                  className="pressable flex items-center justify-between rounded-[12px] border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent hover:bg-[#16190f]"
                >
                  <span className="text-[14.5px] text-text">{f.niche}</span>
                  <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] font-semibold text-accent">{f.n}</span>
                </button>
              ))}
              {facets.length === 0 && <div className="text-[14px] text-muted">No data yet.</div>}
            </div>
          </>
        )}

        {/* Drill-in: cases for the selected niche / search */}
        {drilled && (
          <>
            <button onClick={() => { setNiche(''); setQ('') }}
              className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-text">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
              All niches
            </button>
            <div className="mb-3 text-[13px] text-muted">
              {niche && <span className="font-semibold text-text">{niche}</span>} — showing {cases.length} of {total.toLocaleString()}
            </div>
            <div className="flex flex-col gap-3">
              {cases.map((c) => (
                <div key={c.id} className="rounded-[14px] border border-border bg-surface p-4">
                  <div className="mb-1.5 flex items-start justify-between gap-3">
                    <div className="font-display text-[15.5px] font-semibold text-text">{c.business}</div>
                    {c.niche && <span className="shrink-0 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11.5px] text-muted">{c.niche}</span>}
                  </div>
                  {c.situation && <p className="mb-2 text-[13.5px] leading-[1.5] text-muted"><span className="text-faint">Their question: </span>{c.situation}</p>}
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
            {!loading && cases.length === 0 && <div className="py-10 text-center text-[14px] text-muted">No cases found.</div>}
          </>
        )}
      </main>
    </div>
  )
}
