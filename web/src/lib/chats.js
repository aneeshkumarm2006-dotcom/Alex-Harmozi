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
    .select('role,content,tier,sources')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
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
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: msg.role,
    content: msg.content,
    tier: msg.tier ?? null,
    sources: msg.sources ?? null,
  })
  if (error) throw error
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
