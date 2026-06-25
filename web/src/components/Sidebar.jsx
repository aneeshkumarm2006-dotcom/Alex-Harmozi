import { useState } from 'react'
import Avatar from './Avatar'

// Chat-history rail: back-to-coaches, the active coach, New-chat, a searchable
// conversation list (rename + delete on hover), and a user/plan footer.
export default function Sidebar({
  character, user, conversations, onSelect, onNewChat, onBack, onSignOut, onRename, onDelete,
}) {
  const email = user?.email || 'you@company.com'
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')

  const filtered = query.trim()
    ? conversations.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
    : conversations

  function startRename(c) { setEditingId(c.id); setDraft(c.title) }
  function commitRename() {
    if (editingId && draft.trim()) onRename?.(editingId, draft.trim())
    setEditingId(null)
  }

  return (
    <aside className="hidden h-screen w-[272px] shrink-0 flex-col border-r border-border-green bg-[#0c0d0c] md:flex">
      {/* header: back + coach */}
      <div className="border-b border-[#14180f] px-4 pb-[15px] pt-[18px]">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-[5px] text-[12.5px] text-[#8b938a] transition-colors hover:text-text"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Coaches
        </button>
        <div className="flex items-center gap-[11px]">
          <div className="relative shrink-0">
            <Avatar character={character} size={36} />
            <span className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-[#0c0d0c] bg-direct" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-[14.5px] font-semibold leading-[1.1]">{character.name}</div>
            <div className="text-[11.5px] text-direct">Online</div>
          </div>
        </div>
      </div>

      {/* new chat */}
      <div className="px-[13px] pb-1.5 pt-[13px]">
        <button
          type="button"
          onClick={onNewChat}
          className="flex h-11 w-full items-center justify-center gap-[9px] rounded-[12px] border border-[#2a2f24] bg-surface font-display text-[14px] font-semibold transition-[border-color,background,box-shadow] hover:border-accent hover:bg-[#16190f] hover:shadow-[0_0_22px_rgba(16,185,129,.18)]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New chat
        </button>
      </div>

      {/* search */}
      <div className="px-[13px] pb-1 pt-2">
        <div className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-2.5 focus-within:border-border-strong">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="h-9 flex-1 bg-transparent text-[13px] text-text outline-none"
          />
        </div>
      </div>

      {/* conversation list */}
      <div className="flex-1 overflow-y-auto px-[9px] pb-3 pt-2">
        <div className="px-[9px] pb-2 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">
          Chats
        </div>
        <div className="flex flex-col gap-0.5">
          {filtered.length === 0 && (
            <div className="px-[11px] py-3 text-[13px] text-faint">No chats found.</div>
          )}
          {filtered.map((c) => (
            <div
              key={c.id}
              onClick={() => editingId !== c.id && onSelect(c.id)}
              title={c.title}
              className={[
                'group relative flex cursor-pointer items-center gap-2.5 rounded-[10px] px-[11px] py-2.5 text-left text-[13.5px] leading-[1.3] transition-colors',
                c.isActive ? 'bg-surface-2 text-text' : 'text-muted hover:bg-[#16190f] hover:text-text',
              ].join(' ')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 opacity-65">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>

              {editingId === c.id ? (
                <input
                  autoFocus
                  value={draft}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="min-w-0 flex-1 border-b border-accent bg-transparent text-text outline-none"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
              )}

              {/* hover actions */}
              {editingId !== c.id && (
                <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                  <button
                    onClick={(e) => { e.stopPropagation(); startRename(c) }}
                    title="Rename" aria-label="Rename"
                    className="flex h-6 w-6 items-center justify-center rounded text-faint hover:text-text"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete?.(c.id) }}
                    title="Delete" aria-label="Delete"
                    className="flex h-6 w-6 items-center justify-center rounded text-faint hover:text-danger"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                </div>
              )}
              {c.isActive && editingId !== c.id && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-direct shadow-[0_0_8px_#34D399] group-hover:hidden" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* user footer */}
      <div className="flex items-center gap-[11px] border-t border-[#14180f] p-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-[#cdd6ec]"
          style={{ background: 'linear-gradient(150deg,#1E2A4A,#16203B)', border: '1px solid #2a3a5e' }}
        >
          {email[0]?.toUpperCase() || 'Y'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-[#e6e6e2]">{email}</div>
          <div className="text-[11px] text-faint">Free plan · <span className="text-gold">Upgrade</span></div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          title="Log out"
          aria-label="Log out"
          className="shrink-0 text-faint transition-colors hover:text-text"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
