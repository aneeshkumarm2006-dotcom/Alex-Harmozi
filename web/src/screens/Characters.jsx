import { supabase } from '../lib/supabase'
import { characters } from '../data/characters'
import CharacterCard from '../components/CharacterCard'
import UsagePanel from '../components/UsagePanel'

// Coach select. Grid is data-driven from data/characters.js. The featured coach
// (Alex) is a rich card; unavailable entries render as dashed "coming soon" tiles.
export default function Characters({ user, onSelect }) {
  return (
    <div className="relative min-h-screen px-6 pb-20 pt-10">
      <div
        className="pointer-events-none absolute left-1/2 top-[-10%] h-[520px] w-[760px] -translate-x-1/2 rounded-full blur-[30px]"
        style={{ background: 'radial-gradient(circle, rgba(16,185,129,.10), transparent 60%)' }}
      />

      <div className="relative mx-auto max-w-[1080px]">
        {/* header row */}
        <div className="mb-14 flex items-center justify-between">
          <div className="flex items-center gap-[11px]">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ background: 'linear-gradient(150deg,#10B981,#0a8f63)', boxShadow: '0 0 18px rgba(16,185,129,.4)' }}
            >
              <div className="h-2.5 w-2.5 rounded-[3px] bg-[#06120c]" />
            </div>
            <span className="font-display text-[13px] font-semibold tracking-[0.32em]">ASK&nbsp;ALEX</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-[13px] text-muted sm:inline">{user?.email}</span>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="pressable rounded-full border border-border px-3.5 py-1.5 text-[13.5px] font-medium text-muted transition-colors hover:border-border-strong hover:text-text"
            >
              Log out
            </button>
          </div>
        </div>

        {/* title */}
        <div className="mb-12 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[12px] tracking-[0.04em] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-direct shadow-[0_0_8px_#34D399]" />
            1 coach live · more on the way
          </div>
          <h1 className="mb-3 font-display text-[34px] font-bold tracking-[-0.025em] sm:text-[42px]">
            Choose your coach
          </h1>
          <p className="text-[16px] text-muted">
            Pick a mind to think with. Every answer is grounded in their real words.
          </p>
        </div>

        {/* grid */}
        <div className="mx-auto grid max-w-[960px] grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-[22px]">
          {characters.map((c) => (
            <CharacterCard key={c.id} character={c} onSelect={onSelect} />
          ))}
        </div>

        {/* usage dashboard */}
        <div className="mx-auto mt-14 max-w-[960px]">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="font-display text-[15px] font-semibold tracking-[0.02em] text-muted">USAGE</h2>
            <span className="h-px flex-1 bg-border" />
          </div>
          <UsagePanel />
        </div>
      </div>
    </div>
  )
}
