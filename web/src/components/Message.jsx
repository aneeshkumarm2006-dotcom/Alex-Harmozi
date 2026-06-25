import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import Avatar from './Avatar'
import TierBadge from './TierBadge'
import SourceList from './SourceList'
import TypingDots from './TypingDots'
import Markdown from './Markdown'
import LoadingStatus from './LoadingStatus'

// One chat message. User bubbles right (editable), Alex left with monogram avatar,
// tier badge, receipts, and an action bar (copy / regenerate / feedback).
export default function Message({ msg, character, isLast, busy, onRegenerate, onFeedback, onEdit }) {
  const reduce = useReducedMotion()
  const isUser = msg.role === 'user'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(msg.content)
  const [copied, setCopied] = useState(false)

  const enter = {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
  }

  function copy() {
    navigator.clipboard?.writeText(msg.content || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // ---------------- user message ----------------
  if (isUser) {
    if (editing) {
      return (
        <div className="flex justify-end">
          <div className="w-full max-w-[80%] rounded-[16px] border border-[#2a3a5e] bg-surface p-3">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(6, draft.split('\n').length + 1)}
              className="w-full resize-none bg-transparent text-[15px] leading-[1.5] text-text outline-none"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={() => { setEditing(false); setDraft(msg.content) }}
                className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                onClick={() => { setEditing(false); onEdit?.(draft) }}
                className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-[#04130c]"
                style={{ background: 'linear-gradient(150deg,#10B981,#0d9f6e)' }}
              >
                Save &amp; resend
              </button>
            </div>
          </div>
        </div>
      )
    }
    return (
      <motion.div {...enter} className="group flex items-center justify-end gap-2">
        {!busy && (
          <button
            onClick={() => { setDraft(msg.content); setEditing(true) }}
            aria-label="Edit message"
            className="opacity-0 transition-opacity group-hover:opacity-100 text-faint hover:text-text"
          >
            <Icon name="edit" />
          </button>
        )}
        <div
          className="max-w-[80%] whitespace-pre-wrap rounded-[16px_16px_4px_16px] border border-[#2a3a5e] px-[17px] py-[13px] text-[15px] leading-[1.5] text-[#eef1f7]"
          style={{ background: 'linear-gradient(150deg,#1E2A4A,#16203B)' }}
        >
          {msg.content}
        </div>
      </motion.div>
    )
  }

  // ---------------- assistant message ----------------
  const showActions = !msg.pending && !msg.streaming && msg.content
  return (
    <motion.div {...enter} className="group flex items-start gap-[13px]">
      <div className="mt-0.5 shrink-0">
        <Avatar character={character} size={36} />
      </div>
      <div className="min-w-0 flex-1">
        {msg.pending ? (
          <div>
            <div className="inline-flex items-center gap-[9px] rounded-[16px_16px_16px_4px] border border-border bg-surface px-4 py-[13px]">
              <TypingDots />
            </div>
            <div className="ml-[3px] mt-[7px]">
              <LoadingStatus />
            </div>
          </div>
        ) : (
          <>
            {msg.tier && (
              <div className="mb-[11px]">
                <TierBadge tier={msg.tier} />
              </div>
            )}
            <div className="text-[15.5px] text-[#ececea]">
              <Markdown>{msg.content}</Markdown>
              {msg.streaming && (
                <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-pulse bg-direct align-middle" />
              )}
            </div>
            {!msg.streaming && <SourceList sources={msg.sources} />}

            {showActions && (
              <div className="mt-2.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <ActionBtn label={copied ? 'Copied' : 'Copy'} onClick={copy}>
                  <Icon name={copied ? 'check' : 'copy'} />
                </ActionBtn>
                {isLast && !busy && (
                  <ActionBtn label="Regenerate" onClick={onRegenerate}>
                    <Icon name="refresh" />
                  </ActionBtn>
                )}
                <ActionBtn label="Good answer" active={msg.feedback === 1} onClick={() => onFeedback?.(1)}>
                  <Icon name="up" />
                </ActionBtn>
                <ActionBtn label="Bad answer" active={msg.feedback === -1} onClick={() => onFeedback?.(-1)}>
                  <Icon name="down" />
                </ActionBtn>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}

function ActionBtn({ children, label, onClick, active }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-surface ${active ? 'text-accent' : 'text-faint hover:text-text'}`}
    >
      {children}
    </button>
  )
}

function Icon({ name }) {
  const p = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (name === 'copy') return (<svg {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>)
  if (name === 'check') return (<svg {...p}><path d="M20 6L9 17l-5-5" /></svg>)
  if (name === 'refresh') return (<svg {...p}><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>)
  if (name === 'up') return (<svg {...p}><path d="M7 10v12M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7" /></svg>)
  if (name === 'down') return (<svg {...p}><path d="M17 14V2M9 18.12L10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17" /></svg>)
  if (name === 'edit') return (<svg {...p} width="14" height="14"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>)
  return null
}
