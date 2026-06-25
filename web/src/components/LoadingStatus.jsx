import { useEffect, useState } from 'react'

// Rotating status lines shown while the answer is still being retrieved (before
// the first streamed token). Makes the wait feel intentional, like ChatGPT.
const PHRASES = [
  'Searching 527 videos…',
  'Reading the transcripts…',
  'Matching his frameworks…',
  'Pulling the receipts…',
  'Finding the exact clip…',
  'Writing it in his voice…',
]

export default function LoadingStatus() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % PHRASES.length), 1500)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="text-[12px] tracking-[0.02em] text-[#6b6b72] transition-opacity">
      {PHRASES[i]}
    </span>
  )
}
