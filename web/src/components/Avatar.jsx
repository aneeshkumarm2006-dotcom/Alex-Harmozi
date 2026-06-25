// Circular avatar. Renders the photo if present, else a styled initials
// placeholder built from the character's accent color (mirrors the design's
// dark-green disc with a glowing bright-green monogram).

function initials(name) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

export default function Avatar({ character, size = 64, className = '', glow = false }) {
  const dim = { width: size, height: size }
  const accent = character?.accent || '#10B981'

  if (character?.photo) {
    return (
      <img
        src={character.photo}
        alt={character.name}
        style={dim}
        className={`rounded-full object-cover ${className}`}
      />
    )
  }

  return (
    <div
      style={{
        ...dim,
        background: 'linear-gradient(150deg, #1f5240, #0d2018)',
        border: `1.5px solid ${accent}80`,
        color: '#34D399',
        fontSize: size * 0.37,
        boxShadow: glow ? `0 0 30px ${accent}4d` : undefined,
      }}
      className={`flex items-center justify-center rounded-full font-display font-bold tracking-tight ${className}`}
    >
      {initials(character?.name || '?')}
    </div>
  )
}
