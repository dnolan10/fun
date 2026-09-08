import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// SERVER ONLY. Uses the service role key which bypasses Row Level Security.
// Never import this file in a Client Component.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
