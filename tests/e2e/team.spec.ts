import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, signIn } from "./helpers";
import { latestConfirmLink, onBaseUrl } from "./mail";

// Writes data and sends (local) email, so runs once on desktop, in order.
test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "writes data; covered once on desktop");

const TEAM = "/app/brs/settings/team";
const row = (page: Page, name: string | RegExp) => page.getByRole("table", { name: "Team members" }).getByRole("row").filter({ hasText: name });
const invitee = `invitee-${Date.now()}@e2e.example`;

async function invite(page: Page, email: string, name: string, role: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Name (optional)").fill(name);
  await page.getByLabel("Role", { exact: true }).selectOption({ label: role });
  await page.getByRole("button", { name: "Send invite", exact: true }).click();
}

test("an admin invites a new person, who sets a password and gets in", async ({ page, baseURL }) => {
  await signIn(page, "admin@brs-demo.example");
  await page.goto(TEAM);
  await invite(page, invitee, "Ivy Invitee (demo)", "Sales rep");
  await expect(page.getByText("Invite sent.")).toBeVisible();
  await expect(row(page, "Ivy Invitee (demo)")).toContainText("Invited");
  await expect(row(page, "Ivy Invitee (demo)")).toContainText(invitee);

  // The invitee follows the emailed link in a fresh session.
  await page.context().clearCookies();
  await page.goto(onBaseUrl(await latestConfirmLink(invitee), baseURL!));
  await expect(page.getByRole("heading", { name: "Set your password" })).toBeVisible();
  // A mismatch is caught on the server (the browser already enforces 10+ characters).
  await page.getByLabel("New password").fill("invitee-password-1");
  await page.getByLabel("Confirm password").fill("invitee-password-2");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText("The passwords don't match.")).toBeVisible();
  // Password fields are cleared after a failed submit; enter both again.
  await page.getByLabel("New password").fill("invitee-password-1");
  await page.getByLabel("Confirm password").fill("invitee-password-1");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page).toHaveURL(/\/app\/brs\/overview$/);
  await expect(page.getByText("Sales rep", { exact: true })).toBeVisible();

  // And can sign in normally afterwards.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(invitee);
  await page.getByLabel("Password").fill("invitee-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app\/brs\/overview$/);
});

test("the accepted invitee is no longer marked invited", async ({ page }) => {
  await signIn(page, "admin@brs-demo.example");
  await page.goto(TEAM);
  await expect(row(page, "Ivy Invitee (demo)")).not.toContainText("Invited");
});

test("a used or bad link is rejected", async ({ page, baseURL }) => {
  await page.goto(onBaseUrl(await latestConfirmLink(invitee), baseURL!));
  await expect(page).toHaveURL(/\/login\?error=link/);
  await expect(page.getByText("That link is invalid or has expired.")).toBeVisible();
  await page.goto("/auth/confirm?token_hash=nope&type=invite&next=//evil.example");
  await expect(page).toHaveURL(/\/login\?error=link/);
});

test("adding someone with an existing account, then changing their role, then removing them", async ({ page }) => {
  await signIn(page, "admin@brs-demo.example");
  await page.goto(TEAM);
  await invite(page, "rep@harbor-demo.example", "", "Sales rep");
  await expect(page.getByText("Added. They already had an account")).toBeVisible();
  const casey = row(page, "Casey Rep (demo)");
  await expect(casey).toBeVisible();

  await casey.getByLabel("Role for Casey Rep (demo)", { exact: true }).selectOption("sales_manager");
  await casey.getByRole("button", { name: "Save role for Casey Rep (demo)" }).click();
  await expect(casey.getByText("Role updated.")).toBeVisible();

  // Casey now has two workspaces and manager rights in BRS.
  const other = await page.context().browser()!.newPage();
  await signIn(other, "rep@harbor-demo.example");
  await expect(other.getByRole("heading", { name: "Choose a workspace" })).toBeVisible();
  await other.goto("/app/brs/campaigns");
  await expect(other.getByRole("link", { name: "New campaign" })).toBeVisible();

  await casey.getByRole("button", { name: "Remove Casey Rep (demo)" }).click();
  await expect(row(page, "Casey Rep (demo)")).toHaveCount(0);

  // Access is gone immediately.
  await other.goto("/app/brs/overview");
  await expect(other.getByRole("heading", { name: "Not found" })).toBeVisible();
  await other.close();
});

test("re-inviting an existing member is refused", async ({ page }) => {
  await signIn(page, "admin@brs-demo.example");
  await page.goto(TEAM);
  await invite(page, "rep@brs-demo.example", "", "Sales rep");
  await expect(page.getByText("already a member")).toBeVisible();
});

test("resending an invite sends another email", async ({ page }) => {
  const second = `second-${Date.now()}@e2e.example`;
  await signIn(page, "admin@brs-demo.example");
  await page.goto(TEAM);
  await invite(page, second, "Sam Second (demo)", "Sales manager");
  await expect(page.getByText("Invite sent.")).toBeVisible();
  await row(page, "Sam Second (demo)").getByRole("button", { name: "Resend invite to Sam Second (demo)" }).click();
  await expect(page.getByText("Invite email sent again.")).toBeVisible();
  await latestConfirmLink(second, 2);
});

test("admins can't change or remove themselves; others don't get controls", async ({ page }) => {
  await signIn(page, "admin@brs-demo.example");
  await page.goto(TEAM);
  const self = row(page, "(you)");
  await expect(self).toContainText("Another admin can change this");
  await expect(self.getByRole("button")).toHaveCount(0);

  await page.context().clearCookies();
  await signIn(page, "manager@brs-demo.example");
  await page.goto(TEAM);
  await expect(page.getByText("Only workspace admins can manage the team.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send invite", exact: true })).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Team members" })).not.toContainText("@brs-demo.example");
});

test("seeded password still works for existing users", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("rep@brs-demo.example");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app\/brs\/overview$/);
});
