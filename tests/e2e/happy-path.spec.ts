import { expect, test } from "@playwright/test";

test("signs in and creates a company, contact, and deal", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada.example@example.com");
  await page.getByLabel("Password").fill("Password1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const nav = page.locator(".nav");
  await nav.getByRole("link", { name: "Companies" }).click();
  await page.getByRole("link", { name: "New company" }).click();
  await page.getByLabel("Name").fill(`Playwright Co ${stamp}`);
  await page.getByLabel("Domain").fill(`playwright-${stamp}.test`);
  await page.getByRole("button", { name: "Save company" }).click();
  await expect(page.getByRole("heading", { name: `Playwright Co ${stamp}` })).toBeVisible();

  await nav.getByRole("link", { name: "Contacts" }).click();
  await page.getByRole("link", { name: "New contact" }).click();
  await page.getByRole("radio", { name: `Playwright Co ${stamp}` }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("First name").fill("Pat");
  await page.getByLabel("Last name").fill(`Playwright${stamp}`);
  await page.getByLabel("Email").fill(`pat-${stamp}@playwright.test`);
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByRole("heading", { name: `Pat Playwright${stamp}` })).toBeVisible();

  await nav.getByRole("link", { name: "Deals" }).click();
  await page.getByRole("link", { name: "New deal" }).click();
  await page.getByRole("radio", { name: `Playwright Co ${stamp}` }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio", { name: `Pat Playwright${stamp}` }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Name").fill(`Playwright Deal ${stamp}`);
  await page.getByLabel("Amount").fill("1200.50");
  await page.getByRole("button", { name: "Save deal" }).click();
  await expect(page.getByTestId("deal-detail")).toContainText(`Playwright Deal ${stamp}`);
  await expect(page.getByTestId("deal-detail")).toContainText("$1,200.50");

  await nav.getByRole("link", { name: "Pipeline" }).click();
  await expect(page.getByTestId("pipeline-board")).toContainText(`Playwright Deal ${stamp}`);
});
