import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Writes data, so runs once (desktop) and in order. Seed: supabase/seed.sql.
test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "writes data; covered once on desktop");

const ACTIVE = "/app/brs/campaigns/a3000000-0000-4000-8000-000000000001";
const NON_COMPLIANT_DRAFT = "/app/brs/campaigns/a3000000-0000-4000-8000-000000000002";

test("a draft missing an unsubscribe link cannot be approved", async ({ page }) => {
  await signIn(page, "manager@brs-demo.example");
  await page.goto(NON_COMPLIANT_DRAFT);
  await expect(page.getByText("Step 1 needs {{unsubscribe_url}}.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
});

test("create, write, approve, and enroll: suppressed contacts are skipped", async ({ page }) => {
  await signIn(page, "manager@brs-demo.example");
  await page.goto("/app/brs/campaigns/new");
  await page.getByLabel("Name").fill("E2E relocation follow-up");
  await page.getByRole("button", { name: "Create draft" }).click();

  await expect(page.getByRole("heading", { name: "E2E relocation follow-up" })).toBeVisible();
  await expect(page.getByText("Add at least one email step.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

  // The default body already contains both required tokens.
  await page.getByLabel("Subject").last().fill("Planning a move?");
  await page.getByRole("button", { name: "Add step" }).click();
  await expect(page.getByText("Ready: postal address and unsubscribe link")).toBeVisible();

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await expect(page.getByText("Approved by Morgan Manager (demo)")).toBeVisible();
  await expect(page.getByRole("button", { name: /Save step/ })).toHaveCount(0);
  await expect(page.getByText("Locked after approval")).toBeVisible();

  // Seed: Kai and Lee are fine; Taylor opted out; Pat's domain is a suppressed customer.
  await page.getByRole("checkbox", { name: "Select all contacts" }).check();
  await page.getByRole("button", { name: "Enroll selected" }).click();

  // Count depends on contacts saved by other specs; the suppressed skips do not.
  await expect(page.getByRole("status")).toContainText(/Enrolled \d+\. 2 skipped \(suppressed\)\./);
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  const enrollments = page.getByRole("table", { name: "Enrollments" });
  await expect(enrollments.getByRole("row").filter({ hasText: "Taylor Optout" })).toContainText("suppressed");
  await expect(enrollments.getByRole("row").filter({ hasText: "Kai Placeholder" })).toContainText("enrolled");
  // Enrolled and suppressed contacts don't appear again in the picker.
  await expect(page.getByText("No contacts with an email left to enroll.")).toBeVisible();
});

test("back to draft clears the approval and unlocks the steps", async ({ page }) => {
  await signIn(page, "manager@brs-demo.example");
  await page.goto("/app/brs/campaigns/new");
  await page.getByLabel("Name").fill("E2E draft round trip");
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.getByLabel("Subject").last().fill("Hello");
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved by Morgan Manager (demo)")).toBeVisible();
  await page.getByRole("button", { name: "Back to draft" }).click();
  await expect(page.getByText("Not approved")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save step 1" })).toBeVisible();
});

test("pause and resume an active campaign", async ({ page }) => {
  await signIn(page, "manager@brs-demo.example");
  await page.goto(ACTIVE);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
});

test("reps can view campaigns but not create, approve, or enroll", async ({ page }) => {
  await signIn(page, "rep@brs-demo.example");
  await page.goto("/app/brs/campaigns");
  await expect(page.getByRole("table", { name: "Campaigns" })).toContainText("Lease expirations: next 6 months");
  await expect(page.getByRole("link", { name: "New campaign" })).toHaveCount(0);
  await page.goto(ACTIVE);
  await expect(page.getByRole("heading", { name: "Lease expirations: next 6 months" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause" })).toHaveCount(0);
  await expect(page.getByText("Enroll contacts")).toHaveCount(0);
});

test("another tenant's campaign id shows not found", async ({ page }) => {
  await signIn(page, "admin@harbor-demo.example");
  await page.goto(ACTIVE.replace("/brs/", "/harbor-demo/"));
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await expect(page.getByText("Lease expirations")).toHaveCount(0);
});
