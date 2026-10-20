import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("signed-out users are sent to login", async ({ page }) => {
  await page.goto("/app/brs/overview");
  await expect(page).toHaveURL(/\/login$/);
});

test("wrong password shows a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("rep@brs-demo.example");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That email and password did not match.")).toBeVisible();
});

test("a single-tenant rep lands on their overview with demo data labelled", async ({ page }) => {
  await signIn(page, "rep@brs-demo.example");
  await expect(page).toHaveURL(/\/app\/brs\/overview$/);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Demo data")).toBeVisible();
  await expect(page.getByText("Qualified conversations")).toBeVisible();
  await expect(page.getByText("BRS (demo)")).toBeVisible();
});

test("a tenant A user gets a 404 for tenant B, not its data", async ({ page }) => {
  await signIn(page, "rep@brs-demo.example");
  await expect(page).toHaveURL(/\/app\/brs\/overview$/);
  const response = await page.goto("/app/harbor-demo/overview");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await expect(page.getByText("Harbor Facilities")).toHaveCount(0);
});

test("reps cannot see integration details", async ({ page }) => {
  await signIn(page, "rep@brs-demo.example");
  await page.goto("/app/brs/settings/integrations");
  await expect(page.getByText("Admins and sales managers only")).toBeVisible();
});

test("admins see their own Apollo connection, holder, and authorization state", async ({ page }) => {
  await signIn(page, "admin@harbor-demo.example");
  await page.goto("/app/harbor-demo/settings/integrations");
  await expect(page.getByText("connected", { exact: true })).toBeVisible();
  await expect(page.getByText("Not recorded")).toBeVisible();
  await expect(page.getByText("hello@harbor-demo.example")).toBeVisible();
  await expect(page.getByText("outreach@brs-demo.example")).toHaveCount(0);
});

test("Commonbase staff choose between their explicit memberships", async ({ page }) => {
  await signIn(page, "staff@commonbase.example");
  await expect(page.getByRole("heading", { name: "Choose a workspace" })).toBeVisible();
  await page.getByRole("link", { name: /Harbor Facilities/ }).click();
  await expect(page).toHaveURL(/\/app\/harbor-demo\/overview$/);
});

test("team page lists members of this tenant only", async ({ page }) => {
  await signIn(page, "admin@brs-demo.example");
  await page.goto("/app/brs/settings/team");
  const table = page.getByRole("table", { name: "Team members" });
  await expect(table.getByText("Riley Rep (demo)", { exact: true })).toBeVisible();
  await expect(table).not.toContainText("Casey Rep (demo)");
});
