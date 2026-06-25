import { useEffect, useRef, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import Sidebar from '../components/Sidebar'
import Message from '../components/Message'
import { ask } from '../lib/api'
import {
  listConversations, getMessages, createConversation,
  addMessage, touchConversation,
} from '../lib/chats'

const SUGGESTIONS = [
  "How do I make an offer people can't refuse?",
  'How do I get leads without paying for ads?',
  'Should I raise my prices?',
  'What crypto should I buy?',
]

const titleFrom = (q) => {
  const t = (q || '').trim().replace(/\s+/g, ' ')
  return t.length > 30 ? t.slice(0, 30) + '…' : t || 'New chat'
}

export default function Chat({ character, user, onBack }) {
  // Conversations are persisted in Supabase (schema_chat.sql). A saved chat uses
  // its uuid as `id`; a brand-new unsent chat uses a temporary `local-*` id until
  // its first message creates the DB row. `loaded` = messages fetched yet.
  const [conversations, setConversations] = useState([
    { id: 'local-1', title: 'New chat', messages: [], loaded: true },
  ])
  const [activeId, setActiveId] = useState('local-1')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [showJump, setShowJump] = useState(false)

  const nextLocal = useRef(2)
  const threadRef = useRef(null)
  const bottomRef = useRef(null)
  const taRef = useRef(null)

  const activeConv = conversations.find((c) => c.id === activeId) || conversations[0]
  const messages = activeConv?.messages || []
  const showEmpty = messages.length === 0 && !busy

  function patchConv(id, fn) {
    setConversations((cs) => cs.map((c) => (c.id === id ? fn(c) : c)))
  }

  // Load this user's saved conversations for the active coach on mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await listConversations(user.id, character.id)
        if (cancelled || !list.length) return // else keep the empty local chat
        const convs = list.map((c) => ({ id: c.id, title: c.title, messages: [], loaded: false }))
        setConversations(convs)
        setActiveId(convs[0].id)
        const msgs = await getMessages(convs[0].id)
        if (cancelled) return
        setConversations((cs) => cs.map((c) => (c.id === convs[0].id ? { ...c, messages: msgs, loaded: true } : c)))
      } catch (e) {
        console.error('Could not load chat history:', e.message)
      }
    })()
    return () => { cancelled = true }
  }, [user?.id, character.id])

  async function selectConv(id) {
    setActiveId(id)
    setShowJump(false)
    const conv = conversations.find((c) => c.id === id)
    if (conv && !conv.loaded) {
      try {
        const msgs = await getMessages(id)
        patchConv(id, (c) => ({ ...c, messages: msgs, loaded: true }))
      } catch (e) {
        console.error('Could not load messages:', e.message)
      }
    }
  }

  function newChat() {
    // Reuse the current chat if it's already empty.
    if (activeConv && activeConv.messages.length === 0) { setInput(''); return }
    const id = `local-${nextLocal.current++}`
    setConversations((cs) => [{ id, title: 'New chat', messages: [], loaded: true }, ...cs])
    setActiveId(id)
    setInput('')
  }

  const atBottom = () => {
    const el = threadRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' })
    setShowJump(false)
  }, [])

  // On new message / chat switch: auto-scroll if near the bottom.
  useEffect(() => {
    if (atBottom()) scrollToBottom()
    else setShowJump(true)
  }, [messages, activeId, scrollToBottom])

  // Auto-grow the textarea up to ~120px.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [input])

  async function send(text) {
    const question = (text ?? input).trim()
    if (!question || busy) return
    const targetId = activeId
    const conv = conversations.find((c) => c.id === targetId)
    setInput('')
    setBusy(true)

    // History sent to the API: prior real turns in this conversation.
    const history = (conv?.messages || [])
      .filter((m) => !m.pending)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }))

    const isFirst = (conv?.messages.length || 0) === 0
    const userMsg = { role: 'user', content: question }
    patchConv(targetId, (c) => ({
      ...c,
      title: isFirst ? titleFrom(question) : c.title,
      messages: [...c.messages, userMsg, { role: 'assistant', pending: true }],
    }))

    // Ensure the conversation row exists, then persist the user turn.
    let dbId = String(targetId).startsWith('local-') ? null : targetId
    try {
      if (!dbId) {
        dbId = await createConversation(user.id, character.id, titleFrom(question))
        setConversations((cs) => cs.map((c) => (c.id === targetId ? { ...c, id: dbId } : c)))
        setActiveId((a) => (a === targetId ? dbId : a))
      }
      await addMessage(dbId, userMsg)
    } catch (e) {
      console.error('Could not save your message:', e.message)
    }

    const liveId = dbId || targetId
    try {
      const data = await ask({ question, history, character: character.id })
      const asst = { role: 'assistant', content: data.answer, tier: data.tier, sources: data.sources }
      patchConv(liveId, (c) => ({ ...c, messages: [...c.messages.slice(0, -1), asst] }))
      if (dbId) {
        try { await addMessage(dbId, asst); await touchConversation(dbId) }
        catch (e) { console.error('Could not save the reply:', e.message) }
      }
    } catch (err) {
      const asst = { role: 'assistant', content: `Sorry — ${err.message}`, tier: 'out_of_scope' }
      patchConv(liveId, (c) => ({ ...c, messages: [...c.messages.slice(0, -1), asst] }))
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const convList = conversations.map((c) => ({ id: c.id, title: c.title, isActive: c.id === activeId }))

  return (
    <div className="flex h-screen">
      <Sidebar
        character={character}
        user={user}
        conversations={convList}
        onSelect={selectConv}
        onNewChat={newChat}
        onBack={onBack}
        onSignOut={() => supabase.auth.signOut()}
      />

      {/* main column */}
      <div className="flex h-screen min-w-0 flex-1 flex-col">
        {/* top nav */}
        <header className="relative z-[5] flex h-16 shrink-0 items-center justify-center border-b border-border-green bg-bg/70 px-5 backdrop-blur-md">
          <div className="flex w-full max-w-[880px] items-center justify-between">
            <div className="flex items-center gap-[13px]">
              {/* mobile-only back (sidebar is hidden < md) */}
              <button
                type="button"
                onClick={onBack}
                aria-label="Back to coaches"
                className="pressable flex h-8 w-8 items-center justify-center rounded-[9px] border border-border text-muted transition-colors hover:border-border-strong hover:text-text md:hidden"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <div className="relative h-[38px] w-[38px]">
                <Avatar character={character} size={38} />
                <span className="absolute -bottom-px -right-px h-[11px] w-[11px] rounded-full border-2 border-bg bg-direct shadow-[0_0_8px_#34D399]" />
              </div>
              <div>
                <div className="font-display text-[15px] font-semibold leading-[1.1]">{character.name}</div>
                <div className="text-[12px] text-direct">Online · grounded in {character.videos} videos</div>
              </div>
            </div>
            <div className="flex items-center gap-[7px] rounded-full border border-border bg-surface px-[13px] py-[7px]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2">
                <path d="M12 2l2.4 7.4H22l-6 4.5 2.3 7.1-6.3-4.6L5.7 21l2.3-7.1-6-4.5h7.6z" />
              </svg>
              <span className="text-[12.5px] font-semibold tracking-[0.02em] text-gold">{character.words} words indexed</span>
            </div>
          </div>
        </header>

        {/* thread */}
        <div ref={threadRef} className="relative flex-1 overflow-y-auto px-5 pb-7 pt-[34px]">
          <div className="mx-auto max-w-chat">
            {showEmpty ? (
              <EmptyState onPick={(q) => send(q)} />
            ) : (
              <div className="space-y-[26px]">
                {messages.map((m, i) => (
                  <Message key={i} msg={m} character={character} />
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <AnimatePresence>
            {showJump && (
              <motion.button
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                onClick={() => scrollToBottom()}
                className="pressable fixed bottom-28 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[13px] text-muted shadow-pop hover:text-text"
              >
                ↓ New message
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* composer */}
        <div className="shrink-0 border-t border-border-green bg-bg/70 px-5 pb-[22px] pt-3.5 backdrop-blur-md">
          <div className="mx-auto max-w-chat">
            <div className="flex items-end gap-2.5 rounded-[16px] border border-border bg-surface py-2 pl-[18px] pr-2 transition-colors focus-within:border-[#2f5a3f]">
              <textarea
                ref={taRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask about offers, leads, sales, scaling…"
                className="max-h-[120px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-[22px] text-text outline-none"
              />
              <button
                type="button"
                onClick={() => send()}
                disabled={!input.trim() || busy}
                aria-label="Send"
                className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] text-[#04130c] transition-transform duration-150 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: 'linear-gradient(150deg,#10B981,#0d9f6e)', boxShadow: '0 0 18px rgba(16,185,129,.3)' }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
            <div className="mt-[9px] text-center text-[11.5px] text-[#4f544e]">
              Answers are grounded in real clips. Green means he said it · amber means inferred.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ onPick }) {
  return (
    <div className="px-3 pb-2 pt-12 text-center">
      <div className="glow-pulse mx-auto mb-[22px] flex h-[66px] w-[66px] items-center justify-center rounded-full font-display text-[24px] font-bold text-direct"
        style={{ background: 'linear-gradient(150deg,#1f5240,#0d2018)', border: '1.5px solid rgba(16,185,129,.5)' }}
      >
        AH
      </div>
      <h2 className="mb-3 font-display text-[27px] font-semibold tracking-[-0.02em]">Ask me anything.</h2>
      <p className="mx-auto mb-[34px] max-w-[430px] text-[16px] leading-[1.55] text-muted">
        Offers, leads, sales, or scaling. I'll show you exactly where I said it — clip and timestamp.
      </p>
      <div className="mx-auto flex max-w-[560px] flex-wrap justify-center gap-2.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-full border border-border bg-surface px-4 py-[11px] text-[13.5px] text-[#d6d6d2] transition-[border-color,background,transform] duration-200 hover:-translate-y-px hover:border-accent hover:bg-[#16190f]"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
