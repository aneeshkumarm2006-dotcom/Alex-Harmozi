import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'

// Split-screen login: brand hero on the left, auth card on the right.
// Self-serve: a Sign in <-> Sign up toggle. Wired to real Supabase auth.
export default function Login() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const isSignup = mode === 'signup'

  async function submit(e) {
    e.preventDefault()
    setError(''); setNotice(''); setLoading(true)
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (!data.session) {
          setNotice('Check your email to confirm your account, then sign in.')
          setMode('signin')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
      // On success, App's auth listener swaps the screen automatically.
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="anim-screen relative z-[1] flex min-h-screen flex-wrap">
      {/* ---------- brand hero ---------- */}
      <div className="relative flex min-h-screen flex-[1.15_1_460px] flex-col justify-between overflow-hidden border-r border-border-green px-8 py-14 md:px-16">
        <div
          className="pointer-events-none absolute -left-[8%] -top-[12%] h-[560px] w-[560px] rounded-full blur-[20px]"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,.16), transparent 62%)' }}
        />
        <div className="pointer-events-none absolute -bottom-[14%] -right-[6%] select-none font-display text-[440px] font-bold leading-[0.8] tracking-[-0.04em] text-[#10130d]">
          AH
        </div>

        <Wordmark />

        <div className="relative max-w-[520px]">
          <h1 className="font-display text-[42px] font-bold leading-[1.02] tracking-[-0.025em] sm:text-[54px]">
            Get Alex Hormozi's<br />playbook. With{' '}
            <span className="text-accent">receipts.</span>
          </h1>
          <p className="mb-9 mt-5 max-w-[440px] text-[17px] leading-[1.6] text-muted">
            Real answers from 500+ of his videos. Every claim ships with the exact clip and
            timestamp — so you can check the receipts yourself.
          </p>

          <div className="flex max-w-[430px] flex-col gap-4">
            <Promise color="#34D399" glow title="Direct" body="He actually said it — cited to the second." />
            <Promise color="#F59E0B" glow title="Extrapolated" body="Reasoned from his real frameworks — and labeled." />
            <Promise color="#8E8E93" title="Out of scope" body="Honest when it's not his lane. No bluffing." />
          </div>
        </div>

        <div className="relative text-[13px] tracking-[0.02em] text-faint">
          No fluff. No hallucinated quotes. Just answers — with the source.
        </div>
      </div>

      {/* ---------- auth card ---------- */}
      <div className="flex min-h-screen flex-[1_1_380px] items-center justify-center px-8 py-12">
        <form onSubmit={submit} className="w-full max-w-login">
          <div className="font-display text-[26px] font-semibold tracking-[-0.01em]">
            {isSignup ? 'Create your account' : 'Welcome back'}
          </div>
          <div className="mb-[30px] mt-1.5 text-[14.5px] text-muted">
            {isSignup ? 'Sign up to start asking.' : 'Sign in to start asking.'}
          </div>

          <Field label="Email" type="email" value={email} onChange={setEmail}
            placeholder="you@company.com" autoComplete="email" />
          <Field label="Password" type="password" value={password} onChange={setPassword}
            placeholder="••••••••" autoComplete={isSignup ? 'new-password' : 'current-password'} />

          <AnimatePresence>
            {error && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="-mt-2 mb-4 text-[13px] text-danger">{error}</motion.p>
            )}
            {notice && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="-mt-2 mb-4 text-[13px] text-direct">{notice}</motion.p>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="pressable h-[50px] w-full rounded-[12px] font-display text-[15.5px] font-semibold tracking-[0.01em] text-[#04130c] transition-[transform,box-shadow,opacity] duration-200 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: 'linear-gradient(150deg,#10B981,#0d9f6e)', boxShadow: '0 0 30px rgba(16,185,129,.32)' }}
          >
            {loading ? (isSignup ? 'Creating…' : 'Signing in…') : (isSignup ? 'Create account →' : 'Continue →')}
          </button>

          <p className="mt-[26px] text-center text-[13px] text-faint">
            {isSignup ? 'Already have an account? ' : 'New here? '}
            <button
              type="button"
              onClick={() => { setMode(isSignup ? 'signin' : 'signup'); setError(''); setNotice('') }}
              className="font-medium text-accent hover:text-accent-hover"
            >
              {isSignup ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}

function Wordmark() {
  return (
    <div className="relative flex items-center gap-[11px]">
      <div
        className="flex h-[30px] w-[30px] items-center justify-center rounded-lg"
        style={{ background: 'linear-gradient(150deg,#10B981,#0a8f63)', boxShadow: '0 0 22px rgba(16,185,129,.4)' }}
      >
        <div className="h-[11px] w-[11px] rounded-[3px] bg-[#06120c]" />
      </div>
      <span className="font-display text-[14px] font-semibold tracking-[0.32em] text-text">ASK&nbsp;ALEX</span>
    </div>
  )
}

function Promise({ color, title, body, glow }) {
  return (
    <div className="flex items-start gap-[13px]">
      <div
        className="mt-[5px] h-[9px] w-[9px] shrink-0 rounded-full"
        style={{ background: color, boxShadow: glow ? `0 0 10px ${color}b3` : undefined }}
      />
      <div>
        <div className="text-[14.5px] font-semibold tracking-[0.01em]">{title}</div>
        <div className="mt-px text-[13.5px] text-[#8b938a]">{body}</div>
      </div>
    </div>
  )
}

function Field({ label, type, value, onChange, placeholder, autoComplete }) {
  return (
    <label className="mb-[18px] block">
      <span className="mb-2 block text-[12.5px] font-semibold uppercase tracking-[0.04em] text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="h-12 w-full rounded-[12px] border border-border bg-surface px-[15px] text-[15px] text-text outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_3px_rgba(16,185,129,.14)]"
      />
    </label>
  )
}
