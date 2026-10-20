// Supabase's Data API caps every read at `max_rows` (1000 in supabase/config.toml)
// WITHOUT an error, so a query that should return everything silently truncates.
// Use this whenever a read must be complete (KPIs, enrollment lists, sync lookups).

/** Must stay below max_rows; a short page is how we detect the end. */
export const PAGE_SIZE = 500;

export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: all, error };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return { data: all, error: null };
  }
}
