import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { supabase } from './lib/supabase'
import Login from './screens/Login'
import Characters from './screens/Characters'
import Chat from './screens/Chat'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = still loading
  const [character, setCharacter] = useState(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) setCharacter(null) // logged out -> back to login
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Which screen + a stable key for AnimatePresence.
  let key, screen
  if (session === undefined) {
    key = 'splash'
    screen = <Splash />
  } else if (!session) {
    key = 'login'
    screen = <Login />
  } else if (!character) {
    key = 'characters'
    screen = <Characters user={session.user} onSelect={setCharacter} />
  } else {
    key = `chat:${character.id}`
    screen = <Chat character={character} user={session.user} onBack={() => setCharacter(null)} />
  }

  return (
    <div className="relative min-h-screen bg-bg text-text">
      <div className="grain" />
      <AnimatePresence mode="wait">
        <motion.div
          key={key}
          className="relative z-[1]"
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : -8, transition: { duration: 0.18 } }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        >
          {screen}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-1.5">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  )
}
