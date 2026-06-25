import { useEffect, useRef, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import Sidebar from '../components/Sidebar'
import Message from '../components/Message'
import { askStream } from '../lib/api'
import {
  listConversations, getMessages, createConversation,
  addMessage, touchConversation, deleteMessage, deleteMessagesFrom, setFeedback,
  renameConversation, deleteConversation,
} from '../lib/chats'

const SUGGESTIONS = [
  "How do I make an offer people can't refuse?",
  'How do I get leads without paying for ads?',
  'Should I raise my prices?',
  'What crypto should I buy?',
]

// Generic, useful follow-ups shown after a finished answer.
const FOLLOWUPS = [
  'Give me a concrete example',
  'How do I apply this to my business?',
  "What's the first step?",
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
  const abortRef = useRef(null) // AbortController for the Stop button
  const stickRef = useRef(true) // follow the stream only while near the bottom

  // Update the last message of a given role in a conversation.
  function updateLastByRole(convId, role, updater) {
    setConversations((cs) => cs.map((c) => {
      if (c.id !== convId) return c
      const msgs = c.messages.slice()
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === role) { msgs[i] = updater(msgs[i]); break }
      }
      return { ...c, messages: msgs }
    }))
  }
  const updateLastAssistant = (id, fn) => updateLastByRole(id, 'assistant', fn)
  const updateLastUser = (id, fn) => updateLastByRole(id, 'user', fn)

  function stop() {
    abortRef.current?.abort()
  }

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
    stickRef.current = true
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' })
    setShowJump(false)
  }, [])

  // Track whether the user is near the bottom; if they scroll up, stop following
  // the stream and reveal the "jump to latest" pill.
  function handleScroll() {
    const b = atBottom()
    stickRef.current = b
    setShowJump(!b)
  }

  // Follow the conversation only while pinned to the bottom (rAF waits for render).
  useEffect(() => {
    if (!stickRef.current) return
    const id = requestAnimationFrame(() => scrollToBottom('auto'))
    return () => cancelAnimationFrame(id)
  }, [messages, activeId, scrollToBottom])

  // Auto-grow the textarea up to ~120px.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [input])

  // Stream an assistant reply into a conversation. Shared by send + regenerate.
  async function streamAssistant(convId, question, history) {
    setBusy(true)
    patchConv(convId, (c) => ({ ...c, messages: [...c.messages, { role: 'assistant', pending: true }] }))

    const dbId = String(convId).startsWith('local-') ? null : convId
    const ac = new AbortController()
    abortRef.current = ac
    let acc = ''
    let meta = null

    const persist = async () => {
      if (!dbId || !acc) return
      try {
        const row = await addMessage(dbId, { role: 'assistant', content: acc, tier: meta?.tier, sources: meta?.sources })
        updateLastAssistant(convId, (m) => ({ ...m, mid: row.id }))
        await touchConversation(dbId)
      } catch (e) { console.error('Could not save the reply:', e.message) }
    }

    try {
      await askStream({
        question, history, character: character.id, signal: ac.signal,
        onMeta: (d) => {
          meta = d
          updateLastAssistant(convId, (m) => ({
            ...m, pending: false, streaming: true, tier: d.tier, sources: d.sources, content: '',
          }))
        },
        onDelta: (chunk) => {
          acc += chunk
          updateLastAssistant(convId, (m) => ({ ...m, content: acc }))
        },
      })
      updateLastAssistant(convId, (m) => ({ ...m, streaming: false }))
      await persist()
    } catch (err) {
      if (err.name === 'AbortError') {
        updateLastAssistant(convId, (m) => ({ ...m, pending: false, streaming: false }))
        await persist()
      } else {
        updateLastAssistant(convId, (m) => ({
          ...m, pending: false, streaming: false,
          tier: m.tier || 'out_of_scope',
          content: acc || `Sorry — ${err.message}`,
        }))
      }
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  async function send(text) {
    const question = (text ?? input).trim()
    if (!question || busy) return
    const targetId = activeId
    const conv = conversations.find((c) => c.id === targetId)
    setInput('')
    stickRef.current = true // sending always jumps to the bottom

    const history = (conv?.messages || [])
      .filter((m) => !m.pending)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }))

    const isFirst = (conv?.messages.length || 0) === 0
    const userMsg = { role: 'user', content: question }
    patchConv(targetId, (c) => ({
      ...c,
      title: isFirst ? titleFrom(question) : c.title,
      messages: [...c.messages, userMsg],
    }))

    // Ensure the conversation row exists, then persist the user turn.
    let convId = targetId
    let dbId = String(targetId).startsWith('local-') ? null : targetId
    try {
      if (!dbId) {
        dbId = await createConversation(user.id, character.id, titleFrom(question))
        setConversations((cs) => cs.map((c) => (c.id === targetId ? { ...c, id: dbId } : c)))
        setActiveId((a) => (a === targetId ? dbId : a))
        convId = dbId
      }
      const row = await addMessage(dbId, userMsg)
      updateLastUser(convId, (m) => ({ ...m, mid: row.id, createdAt: row.created_at }))
    } catch (e) {
      console.error('Could not save your message:', e.message)
    }

    await streamAssistant(convId, question, history)
  }

  // Regenerate the last assistant reply from the same question.
  async function regenerate() {
    if (busy) return
    const conv = conversations.find((c) => c.id === activeId)
    if (!conv) return
    const msgs = conv.messages
    let ai = -1
    for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].role === 'assistant') { ai = i; break } }
    if (ai < 1 || msgs[ai - 1].role !== 'user') return

    const old = msgs[ai]
    const question = msgs[ai - 1].content
    if (old.mid) { try { await deleteMessage(old.mid) } catch (e) { console.error(e) } }
    patchConv(activeId, (c) => ({ ...c, messages: c.messages.slice(0, ai) }))

    const history = msgs.slice(0, ai - 1)
      .filter((m) => !m.pending).slice(-8).map((m) => ({ role: m.role, content: m.content }))
    await streamAssistant(activeId, question, history)
  }

  // Edit a user message and re-run the conversation from that point.
  async function editAndResend(index, newText) {
    if (busy || !newText.trim()) return
    const conv = conversations.find((c) => c.id === activeId)
    const target = conv?.messages[index]
    if (!target || target.role !== 'user') return
    const dbId = String(activeId).startsWith('local-') ? null : activeId
    if (dbId && target.createdAt) {
      try { await deleteMessagesFrom(dbId, target.createdAt) } catch (e) { console.error(e) }
    }
    patchConv(activeId, (c) => ({ ...c, messages: c.messages.slice(0, index) }))
    await send(newText)
  }

  async function handleFeedback(index, vote) {
    const conv = conversations.find((c) => c.id === activeId)
    const msg = conv?.messages[index]
    if (!msg) return
    const next = msg.feedback === vote ? null : vote
    patchConv(activeId, (c) => ({
      ...c, messages: c.messages.map((m, i) => (i === index ? { ...m, feedback: next } : m)),
    }))
    if (msg.mid) { try { await setFeedback(msg.mid, next) } catch (e) { console.error(e) } }
  }

  async function renameChat(id, title) {
    patchConv(id, (c) => ({ ...c, title }))
    if (!String(id).startsWith('local-')) {
      try { await renameConversation(id, title) } catch (e) { console.error(e) }
    }
  }

  async function deleteChat(id) {
    if (!String(id).startsWith('local-')) {
      try { await deleteConversation(id) } catch (e) { console.error(e) }
    }
    setConversations((cs) => {
      const next = cs.filter((c) => c.id !== id)
      if (next.length === 0) {
        const fresh = { id: `local-${nextLocal.current++}`, title: 'New chat', messages: [], loaded: true }
        setActiveId(fresh.id)
        return [fresh]
      }
      if (id === activeId) setActiveId(next[0].id)
      return next
    })
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
        onRename={renameChat}
        onDelete={deleteChat}
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
        <div ref={threadRef} onScroll={handleScroll} className="relative flex-1 overflow-y-auto px-5 pb-7 pt-[34px]">
          <div className="mx-auto max-w-chat">
            {showEmpty ? (
              <EmptyState onPick={(q) => send(q)} />
            ) : (
              <div className="space-y-[26px]">
                {messages.map((m, i) => (
                  <Message
                    key={i}
                    msg={m}
                    character={character}
                    isLast={i === messages.length - 1}
                    busy={busy}
                    onRegenerate={regenerate}
                    onFeedback={(vote) => handleFeedback(i, vote)}
                    onEdit={(newText) => editAndResend(i, newText)}
                  />
                ))}
              </div>
            )}

            {/* follow-up suggestions after a finished answer */}
            {!showEmpty && !busy && messages.length > 0 &&
              messages[messages.length - 1].role === 'assistant' &&
              !messages[messages.length - 1].streaming && (
                <div className="mt-5 flex flex-wrap gap-2 pl-[49px]">
                  {FOLLOWUPS.map((f) => (
                    <button
                      key={f}
                      onClick={() => send(f)}
                      className="rounded-full border border-border bg-surface px-3.5 py-2 text-[13px] text-muted transition-[border-color,color,transform] hover:-translate-y-px hover:border-accent hover:text-text"
                    >
                      {f}
                    </button>
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
              {busy ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Stop generating"
                  className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-border bg-surface-2 text-text transition-transform duration-150 hover:-translate-y-px"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="5" y="5" width="14" height="14" rx="3" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => send()}
                  disabled={!input.trim()}
                  aria-label="Send"
                  className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] text-[#04130c] transition-transform duration-150 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: 'linear-gradient(150deg,#10B981,#0d9f6e)', boxShadow: '0 0 18px rgba(16,185,129,.3)' }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              )}
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
