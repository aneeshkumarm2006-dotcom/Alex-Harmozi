// "Receipts" -- the signature component. Each source becomes a clip card with a
// thumbnail, match %, snippet, timestamp pill, and a deep link to the exact
// YouTube moment. Maps the real API source shape onto the design's card.

const THUMBS = [
  'linear-gradient(140deg,#123026,#0a1711)',
  'linear-gradient(140deg,#1c2a14,#0d1409)',
  'linear-gradient(140deg,#2a2410,#15110a)',
]

const pct = (sim) => (sim != null ? `${Math.round(sim * 100)}% match` : null)

export default function SourceList({ sources }) {
  if (!sources?.length) return null
  return (
    <div className="anim-src mt-4">
      <div className="mb-[11px] flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#6b6b72]">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2">
          <path d="M20 6L9 17l-5-5" />
        </svg>
        Receipts · {sources.length} {sources.length === 1 ? 'clip' : 'clips'}
      </div>

      <div className="flex flex-col gap-[10px]">
        {sources.map((s, i) => (
          <a
            key={s.n ?? i}
            href={s.deep_link}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex gap-3.5 rounded-[14px] border border-border bg-surface p-[11px] transition-[transform,border-color,box-shadow] duration-200 [@media(hover:hover)and(pointer:fine)]:hover:-translate-y-0.5 [@media(hover:hover)and(pointer:fine)]:hover:border-gold [@media(hover:hover)and(pointer:fine)]:hover:shadow-gold"
          >
            {/* thumbnail */}
            <div
              style={{ background: THUMBS[i % THUMBS.length] }}
              className="relative h-[84px] w-[148px] shrink-0 overflow-hidden rounded-[9px]"
            >
              {pct(s.similarity) && (
                <div className="absolute left-2 top-2 rounded-md bg-bg/60 px-2 py-[3px] text-[10.5px] font-bold tracking-[0.02em] text-direct backdrop-blur-sm">
                  {pct(s.similarity)}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  style={{ background: 'rgba(16,185,129,.92)', boxShadow: '0 0 22px rgba(16,185,129,.5)' }}
                  className="flex h-[38px] w-[38px] items-center justify-center rounded-full"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#04130c">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* meta */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="mb-[5px] font-display text-[14px] font-semibold leading-[1.3] text-text line-clamp-2">
                {s.title}
              </div>
              <div className="mb-auto line-clamp-2 text-[12.5px] leading-[1.45] text-[#8b938a]">
                {s.snippet}
              </div>
              <div className="mt-[9px] flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-[9px] py-[3px] text-[11.5px] tabular-nums text-muted">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8b938a" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                  {s.timestamp}
                </span>
                <span className="shrink-0 font-display text-[12.5px] font-semibold text-accent transition-colors group-hover:text-accent-hover">
                  Watch at {s.timestamp} →
                </span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
