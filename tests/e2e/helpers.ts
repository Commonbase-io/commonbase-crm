import type { Page } from "@playwright/test";

// Seeded synthetic users (supabase/seed.sql).
export const PASSWORD = "demo-password-1";

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait for the sign-in redirect so the session cookie is set before navigating.
  await page.waitForURL((url) => url.pathname.startsWith("/app"));
}
