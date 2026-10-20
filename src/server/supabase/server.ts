import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { cookies } from "next/headers";
import { publicEnv } from "@/server/env";

/**
 * Supabase client acting as the signed-in user. Every query runs under RLS.
 * Prefer this over the admin client whenever the user's own access suffices.
 */
export async function createUserClient() {
  // cookies() first: it marks the route dynamic, so pages are never prerendered at build time.
  const cookieStore = await cookies();
  const env = publicEnv();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot set cookies; the proxy refreshes the session instead.
        }
      },
    },
  });
}
