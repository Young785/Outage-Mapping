import { createClient } from "@supabase/supabase-js";
import { getAppEnv, getSupabaseConfig } from "./env";

const { url: supabaseUrl, serviceRoleKey: supabaseServiceKey, anonKey: supabaseAnonKey } = getSupabaseConfig();

if (supabaseUrl) {
  console.info(`[supabase] APP_ENV=${getAppEnv()} → ${supabaseUrl}`);
}

if (!supabaseUrl) {
  console.warn("[supabase] SUPABASE_URL not set — DB features will be unavailable");
}

// Server-side admin client (bypasses RLS, used in API routes)
export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

// Public anon client (for potential client-side use)
export const supabaseClient = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export function getAdmin() {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase not configured. Set SUPABASE_URL_DEV + SUPABASE_SERVICE_ROLE_KEY_DEV (development) or SUPABASE_URL_PROD + SUPABASE_SERVICE_ROLE_KEY_PROD (production) in .env"
    );
  }
  return supabaseAdmin;
}

export const isSupabaseConfigured = !!(supabaseUrl && supabaseServiceKey);
