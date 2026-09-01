import { createClient, type SupabaseClient, type User, type Session } from '@supabase/supabase-js'

export const SUPABASE_PROJECT_URL =
  (import.meta.env.VITE_SUPABASE_URL as string) || 'https://xcarqzopfaozxugfhslo.supabase.co'

export const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjYXJxem9wZmFvenh1Z2Zoc2xvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNTUyMjUsImV4cCI6MjEwMzgzMTIyNX0.-P30LrQ_-sE0rFtomrRGxdHXX9QJ2JPsoqc6oklTOUU'

let supabaseInstance: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(SUPABASE_PROJECT_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'pocketflow_auth_session',
      },
    })
  }
  return supabaseInstance
}

export async function getCurrentUser(): Promise<User | null> {
  const client = getSupabase()
  const { data: { user } } = await client.auth.getUser()
  return user
}

export async function getCurrentSession(): Promise<Session | null> {
  const client = getSupabase()
  const { data: { session } } = await client.auth.getSession()
  return session
}

export async function signOut(): Promise<void> {
  const client = getSupabase()
  await client.auth.signOut()
}
