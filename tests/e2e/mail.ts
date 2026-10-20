import { expect } from "@playwright/test";

// Local Supabase sends auth emails to Mailpit (supabase/config.toml [local_smtp]).
const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

interface Summary {
  ID: string;
}

/** Waits for the newest email to `to` and returns the /auth/confirm link inside it. */
export async function latestConfirmLink(to: string, minCount = 1): Promise<string> {
  let messages: Summary[] = [];
  await expect
    .poll(
      async () => {
        const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
        messages = ((await res.json()) as { messages: Summary[] }).messages ?? [];
        return messages.length;
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(minCount);
  const res = await fetch(`${MAILPIT}/api/v1/message/${messages[0]!.ID}`);
  const html = ((await res.json()) as { HTML: string }).HTML;
  const href = /href="([^"]*\/auth\/confirm[^"]*)"/.exec(html)?.[1];
  if (!href) throw new Error("No confirm link in email");
  return href.replace(/&amp;/g, "&");
}

/** The email link uses the Auth site_url; point it at the app under test. */
export function onBaseUrl(link: string, baseURL: string): string {
  const url = new URL(link);
  return new URL(url.pathname + url.search, baseURL).toString();
}
