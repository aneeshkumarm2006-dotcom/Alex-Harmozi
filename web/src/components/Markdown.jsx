import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Code block with a hover Copy button (reads its own rendered text).
function CodeBlock({ children }) {
  const ref = useRef(null)
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(ref.current?.innerText || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="group relative my-3">
      <button
        onClick={copy}
        className="absolute right-2 top-2 rounded-md border border-border bg-bg/70 px-2 py-1 text-[11px] text-faint opacity-0 backdrop-blur transition-opacity hover:text-text group-hover:opacity-100"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre ref={ref} className="overflow-x-auto rounded-md border border-border bg-surface p-3 text-[13px] leading-[1.5]">
        {children}
      </pre>
    </div>
  )
}

// Renders an assistant message as proper markdown (bold, lists, headings, code,
// links, tables) styled for the dark theme -- like ChatGPT/Claude/Gemini do,
// instead of showing raw **stars** and ---.
const components = {
  p: ({ children }) => <p className="mb-3 last:mb-0 leading-[1.62]">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <h1 className="mb-2 mt-4 font-display text-[19px] font-semibold tracking-[-0.01em] first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 font-display text-[17px] font-semibold tracking-[-0.01em] first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-[15.5px] font-semibold first:mt-0">{children}</h3>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 marker:text-faint last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 marker:text-faint last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-[1.55] pl-0.5">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2 hover:text-accent-hover">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-border-strong pl-3.5 text-muted">{children}</blockquote>
  ),
  code: ({ inline, children }) =>
    inline ? (
      <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[13px] text-[#e3e3df]">{children}</code>
    ) : (
      <code className="font-mono text-[13px]">{children}</code>
    ),
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  hr: () => <hr className="my-4 border-border" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-[14px]">{children}</table></div>
  ),
  th: ({ children }) => <th className="border border-border bg-surface px-2.5 py-1.5 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2.5 py-1.5">{children}</td>,
}

export default function Markdown({ children }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children || ''}
    </ReactMarkdown>
  )
}
