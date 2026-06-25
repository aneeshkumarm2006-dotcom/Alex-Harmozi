import { motion, useReducedMotion } from 'framer-motion'
import Avatar from './Avatar'
import TierBadge from './TierBadge'
import SourceList from './SourceList'
import TypingDots from './TypingDots'
import Markdown from './Markdown'

// One chat message. User bubbles right (deep indigo), Alex left with a monogram
// avatar, tier badge, and receipt cards staggered in just after the text.
export default function Message({ msg, character }) {
  const reduce = useReducedMotion()
  const isUser = msg.role === 'user'

  const enter = {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
  }

  if (isUser) {
    return (
      <motion.div {...enter} className="flex justify-end">
        <div
          className="max-w-[80%] whitespace-pre-wrap rounded-[16px_16px_4px_16px] border border-[#2a3a5e] px-[17px] py-[13px] text-[15px] leading-[1.5] text-[#eef1f7]"
          style={{ background: 'linear-gradient(150deg,#1E2A4A,#16203B)' }}
        >
          {msg.content}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div {...enter} className="flex items-start gap-[13px]">
      <div className="mt-0.5 shrink-0">
        <Avatar character={character} size={36} />
      </div>
      <div className="min-w-0 flex-1">
        {msg.pending ? (
          <div>
            <div className="inline-flex items-center gap-[9px] rounded-[16px_16px_16px_4px] border border-border bg-surface px-4 py-[13px]">
              <TypingDots />
            </div>
            <div className="ml-[3px] mt-[7px] text-[12px] tracking-[0.02em] text-[#6b6b72]">
              Pulling the receipts…
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
            </div>
            <SourceList sources={msg.sources} />
          </>
        )}
      </div>
    </motion.div>
  )
}
