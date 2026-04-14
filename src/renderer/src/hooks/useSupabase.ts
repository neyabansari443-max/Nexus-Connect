import { useAuth } from '@clerk/clerk-react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { useMemo } from 'react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const clerkSupabaseTemplate = import.meta.env.VITE_CLERK_SUPABASE_TEMPLATE || 'supabase';

export function useSupabase(): SupabaseClient | null {
  const { getToken } = useAuth();
  
  return useMemo(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Supabase URL or Anon Key is missing in environment variables.');
      return null;
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      global: {
        fetch: async (url, options = {}) => {
          let clerkToken = null;
          try {
            console.log("[Supabase Fetch] Requesting Clerk Token with template: 'supabase'");
            clerkToken = await getToken({ template: 'supabase' });
          } catch (err) {
            console.error('[Supabase Fetch] Failed to generate Clerk JWT template token:', err);
          }

          // Requested debug flag
          console.log("Clerk Token Status:", !!clerkToken);

          if (!clerkToken) {
            console.warn('[Supabase Fetch] Token is missing/null. RLS policies will likely block this request.');
          }

          const headers = new Headers(options?.headers);
          if (clerkToken) {
            headers.set('Authorization', `Bearer ${clerkToken}`);
          }
          
          return fetch(url, { ...options, headers });
        }
      }
    });
  }, [getToken]);
}
