import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const clerkSupabaseTemplate = import.meta.env.VITE_CLERK_SUPABASE_TEMPLATE || 'supabase'

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null

export function createSupabaseClientWithToken(token?: string | null) {
  if (!supabaseUrl || !supabaseAnonKey || !token) {
    return null
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => token
  })
}

export async function getClerkSupabaseToken(
  getToken?: ((options?: { template?: string }) => Promise<string | null>) | null
): Promise<string | null> {
  if (!getToken) {
    return null
  }

  const templateCandidates = Array.from(new Set([clerkSupabaseTemplate, 'supabase']))

  for (const template of templateCandidates) {
    const templateToken = await getToken({ template }).catch(() => null)
    if (templateToken) {
      return templateToken
    }
  }

  const sessionToken = await getToken().catch(() => null)
  if (sessionToken) {
    return sessionToken
  }

  return null
}
