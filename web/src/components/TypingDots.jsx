// Three staggered dots -- the "thinking" indicator. Pure CSS (see index.css)
// so it keeps animating even if the main thread is busy.

export default function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1" aria-label="Thinking">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  )
}
