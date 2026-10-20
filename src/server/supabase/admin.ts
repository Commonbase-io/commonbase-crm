import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { publicEnv, serviceEnv } from "@/server/env";

/**
 * Service-role client. BYPASSES RLS.
 *
 * Only call this after an explicit authorization check (requireTenantContext +
 * assertCan), and always filter by the authorized tenant id. Never pass it, or
 * anything read with it that the user may not see, to a client component.
 */
export function createAdminClient(): SupabaseClient<Database> {
  const { NEXT_PUBLIC_SUPABASE_URL } = publicEnv();
  const { SUPABASE_SERVICE_ROLE_KEY } = serviceEnv();
  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
