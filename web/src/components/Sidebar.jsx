import Avatar from './Avatar'

// Chat-history rail: back-to-coaches, the active coach, a New-chat button, the
// conversation list, and a user/plan footer. Conversation state lives in Chat.
export default function Sidebar({
  character, user, conversations, onSelect, onNewChat, onBack, onSignOut,
}) {
  const email = user?.email || 'you@company.com'

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

      {/* conversation list */}
      <div className="flex-1 overflow-y-auto px-[9px] pb-3 pt-2.5">
        <div className="px-[9px] pb-2 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">
          Chats
        </div>
        <div className="flex flex-col gap-0.5">
          {conversations.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => onSelect(c.id)}
              title={c.title}
              className={[
                'group relative flex items-center gap-2.5 rounded-[10px] px-[11px] py-2.5 text-left text-[13.5px] leading-[1.3] transition-colors',
                c.isActive ? 'bg-surface-2 text-text' : 'text-muted hover:bg-[#16190f] hover:text-text',
              ].join(' ')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 opacity-65">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              {c.isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-direct shadow-[0_0_8px_#34D399]" />}
            </button>
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
            <circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
