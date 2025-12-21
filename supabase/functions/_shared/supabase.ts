/**
 * Supabase client utilities for edge functions
 * Provides admin and anon client factories
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js-257';

let adminClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

/**
 * Get required environment variable or throw
 */
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Get Supabase URL from environment
 */
export function getSupabaseUrl(): string {
  return requireEnv('SUPABASE_URL');
}

/**
 * Get admin (service role) Supabase client
 * Uses service role key - has full access to all data
 * Use for operations that bypass RLS
 */
export function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    const url = getSupabaseUrl();
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    
    adminClient = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return adminClient;
}

/**
 * Get anon Supabase client
 * Uses anon key - respects RLS policies
 * Use for authenticated user operations
 */
export function getAnonClient(): SupabaseClient {
  if (!anonClient) {
    const url = getSupabaseUrl();
    const anonKey = requireEnv('SUPABASE_ANON_KEY');
    
    anonClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return anonClient;
}

/**
 * Create a client with user's JWT for authenticated operations
 */
export function getUserClient(jwt: string): SupabaseClient {
  const url = getSupabaseUrl();
  const anonKey = requireEnv('SUPABASE_ANON_KEY');
  
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });
}
