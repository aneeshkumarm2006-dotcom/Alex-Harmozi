// Pill showing which answer tier was used -- the product's core trust signal.
// A glowing dot + label, animated in with a subtle scale/glow pop.

const TIERS = {
  direct: {
    label: 'Verified from his videos',
    color: '#34D399',
    bg: 'rgba(52,211,153,.10)',
    border: 'rgba(52,211,153,.30)',
    tip: 'Alex actually said this — grounded in his real words.',
  },
  extrapolate: {
    label: 'Inferred from his frameworks',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,.10)',
    border: 'rgba(245,158,11,.30)',
    tip: 'Reasoned from his real frameworks — labeled as inference.',
  },
  out_of_scope: {
    label: "Outside Alex's world",
    color: '#A1A1A6',
    bg: 'rgba(142,142,147,.10)',
    border: 'rgba(142,142,147,.26)',
    tip: "Alex hasn't covered this — answering straight.",
  },
}

export default function TierBadge({ tier }) {
  const t = TIERS[tier] || TIERS.out_of_scope
  return (
    <span
      title={t.tip}
      style={{ color: t.color, backgroundColor: t.bg, borderColor: t.border }}
      className="anim-badge inline-flex cursor-default items-center gap-[7px] rounded-full border px-3 py-[5px] text-[12px] font-semibold tracking-[0.01em]"
    >
      <span
        style={{ background: t.color, boxShadow: `0 0 8px ${t.color}` }}
        className="h-[7px] w-[7px] rounded-full"
      />
      {t.label}
    </span>
  )
}
