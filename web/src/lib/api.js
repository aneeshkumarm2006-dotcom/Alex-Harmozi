import { supabase } from './supabase'

// Empty in dev -> Vite proxies /chat to the FastAPI backend. Set in prod.
const BASE = import.meta.env.VITE_API_URL || ''

/**
 * Ask a character a question.
 * @param {{question:string, history?:Array<{role,content}>, character?:string}} opts
 * @returns {Promise<{answer,tier,sources,top_similarity}>}
 */
export async function ask({ question, history = [], character = 'alex' }) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ question, history, character }),
  })

  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail || detail } catch { /* ignore */ }
    throw new Error(detail)
  }
  return res.json()
}

/** Token usage + estimated cost for Voyage and Claude. */
export async function getUsage() {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const res = await fetch(`${BASE}/usage`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail || detail } catch { /* ignore */ }
    throw new Error(detail)
  }
  return res.json()
}
