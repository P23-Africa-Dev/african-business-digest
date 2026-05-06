import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Server-side client with service role — for cron jobs and server actions
export function createServerClient() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}

// Read-only anon client — for public page rendering
export function createAnonClient() {
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
  })
}
