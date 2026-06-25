import { supabase } from './supabase'

// Persistent chat history backed by Supabase (tables in schema_chat.sql).
// Every call is scoped to the logged-in user; RLS enforces it server-side and
// we also filter by user_id client-side so it's correct regardless of key.

export async function listConversations(userId, characterId) {
  const { data, error } = await supabase
    .from('conversations')
    .select('id,title,updated_at')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getMessages(conversationId) {
  const { data, error } = await supabase
    .from('messages')
    .select('id,role,content,tier,sources,feedback,created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  // expose the row id as `mid` and keep created_at for truncation on edit
  return (data || []).map((m) => ({
    mid: m.id, role: m.role, content: m.content, tier: m.tier,
    sources: m.sources, feedback: m.feedback, createdAt: m.created_at,
  }))
}

export async function createConversation(userId, characterId, title) {
  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, character_id: characterId, title })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function addMessage(conversationId, msg) {
  const { data, error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: msg.role,
    content: msg.content,
    tier: msg.tier ?? null,
    sources: msg.sources ?? null,
  }).select('id,created_at').single()
  if (error) throw error
  return data // { id, created_at }
}

export async function deleteMessage(id) {
  await supabase.from('messages').delete().eq('id', id)
}

// Delete every message in a conversation at/after a timestamp (for edit-resend).
export async function deleteMessagesFrom(conversationId, createdAt) {
  await supabase.from('messages').delete()
    .eq('conversation_id', conversationId)
    .gte('created_at', createdAt)
}

export async function setFeedback(id, vote) {
  await supabase.from('messages').update({ feedback: vote }).eq('id', id)
}

export async function renameConversation(id, title) {
  await supabase
    .from('conversations')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function touchConversation(id) {
  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function deleteConversation(id) {
  await supabase.from('conversations').delete().eq('id', id)
}
