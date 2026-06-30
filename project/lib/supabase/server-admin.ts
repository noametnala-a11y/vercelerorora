import "server-only"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

/**
 * Server-only Supabase client using the SERVICE ROLE key.
 * This bypasses Row Level Security entirely — it must NEVER be imported
 * from a client component, and must only be used inside "use server" files
 * that handle sensitive data the browser should never touch directly
 * (here: WebAuthn/U2F credentials for the operator console).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Set SUPABASE_SERVICE_ROLE_KEY in your server env (never expose it to the client).",
    )
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
