// A coach tile on the select screen. The featured/available coach is a rich card
// (banner, monogram, topic tags, corpus stats) that lifts + glows on hover.
// Unavailable entries render as inert dashed "coming soon" tiles.

export default function CharacterCard({ character, onSelect }) {
  if (!character.available) return <ComingSoon character={character} />

  return (
    <div
      onClick={() => onSelect(character)}
      className="group relative cursor-pointer overflow-hidden rounded-[18px] border border-[#2a2f24] bg-surface transition-[transform,border-color,box-shadow] duration-200 [@media(hover:hover)and(pointer:fine)]:hover:-translate-y-[3px] [@media(hover:hover)and(pointer:fine)]:hover:border-accent [@media(hover:hover)and(pointer:fine)]:hover:shadow-[0_18px_50px_rgba(0,0,0,.5),0_0_40px_rgba(16,185,129,.14)]"
    >
      {/* banner */}
      <div
        className="relative h-[248px] overflow-hidden"
        style={{ background: 'linear-gradient(160deg,#163a2c 0%,#0c1711 60%,#0a0d09 100%)' }}
      >
        <div className="absolute -bottom-[90px] -right-[30px] font-display text-[340px] font-bold leading-[0.8] tracking-[-0.04em] text-[rgba(16,185,129,.07)]">
          AH
        </div>
        {character.featured && (
          <div
            className="absolute left-6 top-6 flex items-center gap-[7px] rounded-full border px-3 py-1.5 text-[11.5px] font-semibold tracking-[0.04em] text-gold backdrop-blur-md"
            style={{ background: 'rgba(10,10,11,.55)', borderColor: 'rgba(212,175,55,.35)' }}
          >
            <span className="h-[5px] w-[5px] rounded-full bg-gold shadow-[0_0_8px_#D4AF37]" />
            FEATURED
          </div>
        )}
        <div className="absolute bottom-[22px] left-6">
          <div
            className="flex h-[78px] w-[78px] items-center justify-center rounded-full font-display text-[28px] font-bold text-direct"
            style={{ background: 'linear-gradient(150deg,#1f5240,#0d2018)', border: '2px solid rgba(16,185,129,.55)', boxShadow: '0 0 30px rgba(16,185,129,.3)' }}
          >
            AH
          </div>
        </div>
      </div>

      {/* body */}
      <div className="px-[22px] pb-6 pt-5">
        <div className="font-display text-[22px] font-semibold tracking-[-0.01em]">{character.name}</div>
        <div className="mb-4 mt-[3px] text-[13.5px] font-medium tracking-[0.01em] text-accent">
          {character.tagline}
        </div>

        <div className="mb-[18px] flex flex-wrap gap-[7px]">
          {(character.topics || []).map((t) => (
            <span key={t} className="rounded-full border border-border bg-surface-2 px-[11px] py-[5px] text-[12px] text-muted">
              {t}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-[#1f2319] pt-[15px]">
          <div className="text-[12.5px] text-[#8b938a]">
            <span className="font-semibold text-text">{character.videos}</span> videos ·{' '}
            <span className="font-semibold text-text">{character.words}</span> words indexed
          </div>
          <div className="font-display text-[13px] font-semibold text-accent">Chat →</div>
        </div>
      </div>
    </div>
  )
}

function ComingSoon({ character }) {
  return (
    <div className="relative overflow-hidden rounded-[18px] border border-dashed border-border bg-[#0e0e10] opacity-75">
      <div
        className="flex h-[248px] items-center justify-center"
        style={{ background: 'linear-gradient(160deg,#1a1a1e,#0c0c0e)' }}
      >
        <div className="flex h-[74px] w-[74px] items-center justify-center rounded-full border border-[#2a2a30]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#5d5d63" strokeWidth="1.6">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
      </div>
      <div className="px-[22px] pb-6 pt-5">
        <div className="font-display text-[22px] font-semibold text-[#6b6b72]">{character.name}</div>
        <div className="mb-4 mt-[3px] text-[13.5px] text-faint">{character.tagline}</div>
        <div className="inline-block rounded-full border border-border px-[13px] py-1.5 text-[12px] text-[#8b938a]">
          Coming soon
        </div>
      </div>
    </div>
  )
}
