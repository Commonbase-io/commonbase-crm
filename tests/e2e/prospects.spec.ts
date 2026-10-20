import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// These tests write to the database, so they run once (desktop) and in order.
test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "writes data; covered once on desktop");

const SEARCH = "/app/brs/prospects?search=1&title=Manager";
const results = (page: import("@playwright/test").Page) => page.getByRole("table", { name: "Prospect results" }).locator("tbody tr");

test("search shows mock results labelled as demo data, without emails", async ({ page }) => {
  await signIn(page, "manager@brs-demo.example");
  await page.goto(SEARCH);
  await expect(page.getByText("Demo data")).toBeVisible();
  const rows = results(page);
  await expect(rows.first()).toBeVisible();
  await expect(page.getByRole("table", { name: "Prospect results" })).not.toContainText("@");
});

test("saving nothing shows an error", async ({ page }) => {
  await signIn(page, "manager@brs-demo.example");
  await page.goto(SEARCH);
  await page.getByRole("button", { name: "Save selected" }).click();
  await expect(page.getByText("Select at least one prospect to save.")).toBeVisible();
});

test("a manager saves and enriches prospects, and they can't be saved twice", async ({ page }) => {
  await signIn(page, "manager@brs-demo.example");
  await page.goto(SEARCH);
  const newRows = results(page).filter({ hasText: "New" });
  const names = [
    (await newRows.nth(0).locator("td").nth(1).locator("div").first().textContent())!,
    (await newRows.nth(1).locator("td").nth(1).locator("div").first().textContent())!,
  ];
  await newRows.nth(0).getByRole("checkbox").check();
  await newRows.nth(1).getByRole("checkbox").check();
  await page.getByLabel("Enrich emails").check();
  await page.getByRole("button", { name: "Save selected" }).click();

  await expect(page.getByRole("status")).toContainText("Saved 2 contacts");
  for (const name of names) {
    const row = results(page).filter({ hasText: name });
    await expect(row.getByText("Saved", { exact: true })).toBeVisible();
    await expect(row.getByRole("checkbox")).toBeDisabled();
  }
});

test("reps can save but not enrich", async ({ page }) => {
  await signIn(page, "rep@brs-demo.example");
  await page.goto(SEARCH);
  await expect(page.getByRole("button", { name: "Save selected" })).toBeVisible();
  await expect(page.getByLabel("Enrich emails")).toHaveCount(0);
});

test("filters by trigger event", async ({ page }) => {
  await signIn(page, "manager@brs-demo.example");
  await page.goto("/app/brs/prospects");
  await page.getByLabel("Lease expiration").check();
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/trigger=lease_expiration/);
  const rows = results(page);
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  for (let i = 0; i < count; i++) await expect(rows.nth(i)).toContainText("Lease expiration");
});
