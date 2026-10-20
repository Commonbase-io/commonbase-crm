import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "writes data; covered once on desktop");

// Matches .env.local for local runs; CI sets its own.
const CRON_SECRET = process.env.CRON_SECRET ?? "local-dev-cron-secret-0123456789abcdef";

test("the job endpoint rejects requests without the cron secret", async ({ request }) => {
  expect((await request.get("/api/jobs/run")).status()).toBe(401);
  expect((await request.get("/api/jobs/run", { headers: { authorization: "Bearer wrong-secret-wrong-secret" } })).status()).toBe(401);
});

test("the scheduled run syncs every connected tenant", async ({ request }) => {
  const response = await request.post("/api/jobs/run", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect(response.status()).toBe(200);
  const summary = await response.json();
  // Two tenants × three recurring job types, all succeeding against the mock provider.
  expect(summary).toMatchObject({ queued: 6, claimed: 6, succeeded: 6, retried: 0, dead: 0 });
});

test("an admin runs this tenant's sync from Integrations and sees the jobs", async ({ page }) => {
  await signIn(page, "admin@brs-demo.example");
  await page.goto("/app/brs/settings/integrations");
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText(/Ran 3 jobs: 3 succeeded\./)).toBeVisible();
  const jobs = page.getByRole("list", { name: "Recent background jobs" });
  await expect(jobs).toContainText("Opt-out sync");
  await expect(jobs).toContainText("Email activity sync");
  await expect(jobs).toContainText("Enrollment reconciliation");
});

test("reps don't get the sync button", async ({ page }) => {
  await signIn(page, "rep@brs-demo.example");
  await page.goto("/app/brs/settings/integrations");
  await expect(page.getByRole("button", { name: "Sync now" })).toHaveCount(0);
});

test("synced email activity reaches saved prospects and the overview", async ({ page }) => {
  await signIn(page, "manager@brs-demo.example");
  const emailsSent = async () => {
    await page.goto("/app/brs/overview?range=all");
    const card = page.locator("div").filter({ has: page.getByText("Emails sent", { exact: true }) }).last();
    return Number((await card.locator("p").nth(1).textContent())?.replace(/,/g, ""));
  };
  const before = await emailsSent();

  // Save one new prospect (the mock provider has activity for every person it returns).
  await page.goto("/app/brs/prospects?search=1&title=Director");
  const row = page.getByRole("table", { name: "Prospect results" }).locator("tbody tr").filter({ hasText: "New" }).first();
  await row.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save selected" }).click();
  await expect(page.getByRole("status")).toContainText("Saved 1 contact");

  await page.goto("/app/brs/settings/integrations");
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText(/Ran 3 jobs/)).toBeVisible();

  expect(await emailsSent()).toBeGreaterThan(before);
});
