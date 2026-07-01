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

/**
 * Stream an answer token-by-token (SSE over fetch).
 * Calls onMeta({tier, sources, top_similarity}) once, then onDelta(textChunk) many times.
 * Pass an AbortSignal to support a Stop button. Resolves when the stream ends.
 */
export async function askStream({ question, history = [], character = 'alex', signal, onMeta, onDelta }) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const res = await fetch(`${BASE}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ question, history, character }),
    signal,
  })

  if (!res.ok || !res.body) {
    let detail = res.statusText
    try { detail = (await res.json()).detail || detail } catch { /* ignore */ }
    throw new Error(detail)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const line = frame.split('\n').find((l) => l.startsWith('data:'))
      if (!line) continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      let evt
      try { evt = JSON.parse(payload) } catch { continue }
      if (evt.type === 'meta') onMeta?.(evt.data)
      else if (evt.type === 'delta') onDelta?.(evt.data)
      else if (evt.type === 'error') throw new Error(evt.data?.detail || 'stream error')
      // 'done' just ends the loop
    }
  }
}

async function authedGet(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail || detail } catch { /* ignore */ }
    throw new Error(detail)
  }
  return res.json()
}

/** Owner-only: browse extracted business cases. */
export function getBusinessCases({ q = '', niche = '', limit = 50, offset = 0 } = {}) {
  const p = new URLSearchParams({ q, niche, limit: String(limit), offset: String(offset) })
  return authedGet(`/business-cases?${p.toString()}`)
}

export function getBusinessFacets() {
  return authedGet('/business-cases/facets')
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
