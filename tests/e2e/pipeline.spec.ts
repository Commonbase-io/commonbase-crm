import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

// Writes data, so runs once (desktop) and in order. Seed ids: supabase/seed.sql.
test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "writes data; covered once on desktop");

const PINECREST = "a4000000-0000-4000-8000-000000000003"; // owned by the manager
const column = (page: Page, stage: string) => page.getByRole("region", { name: stage, exact: true });
const card = (page: Page, title: string) => page.getByRole("listitem").filter({ has: page.getByRole("link", { name: title }) });

test("the board groups seeded opportunities by stage", async ({ page }) => {
  await signIn(page, "manager@brs-demo.example");
  await page.goto("/app/brs/pipeline");
  await expect(column(page, "Won")).toContainText("Quarry Lane lab and office relocation");
  await expect(column(page, "Lost")).toContainText("Chose incumbent mover");
  await expect(column(page, "Quote requested")).toContainText("Lumen Ledger office move");
});

test("moving to lost requires a reason", async ({ page }) => {
  await signIn(page, "manager@brs-demo.example");
  await page.goto("/app/brs/pipeline");
  const northgate = card(page, "Northgate floor consolidation");
  await northgate.getByLabel("Stage").selectOption("lost");
  const reason = northgate.getByLabel("Lost reason");
  await expect(reason).toBeVisible();
  await expect(reason).toHaveAttribute("required", "");
  await reason.fill("Budget frozen");
  await northgate.getByRole("button", { name: "Move" }).click();
  await expect(column(page, "Lost")).toContainText("Lost: Budget frozen");
});

test("moving between open stages updates the board", async ({ page }) => {
  await signIn(page, "manager@brs-demo.example");
  await page.goto("/app/brs/pipeline");
  const pinecrest = card(page, "Pinecrest campus move");
  await pinecrest.getByLabel("Stage").selectOption("proposal_sent");
  await pinecrest.getByRole("button", { name: "Move" }).click();
  await expect(column(page, "Proposal sent")).toContainText("Pinecrest campus move");
});

test("reps can move their own deals but not other people's", async ({ page }) => {
  await signIn(page, "rep@brs-demo.example");
  await page.goto("/app/brs/pipeline");
  await expect(card(page, "Lumen Ledger office move").getByLabel("Stage")).toBeVisible();
  await expect(card(page, "Pinecrest campus move").getByLabel("Stage")).toHaveCount(0);
  await page.goto(`/app/brs/pipeline/${PINECREST}`);
  await expect(page.getByLabel("Stage")).toHaveCount(0);
  await expect(page.getByLabel("Reassign")).toHaveCount(0);
});

test("table view and the Mine filter", async ({ page }) => {
  await signIn(page, "rep@brs-demo.example");
  await page.goto("/app/brs/pipeline?view=table&owner=me");
  const table = page.getByRole("table", { name: "Opportunities" });
  await expect(table).toContainText("Lumen Ledger office move");
  await expect(table).not.toContainText("Pinecrest campus move");
  await expect(table).toContainText("Lease expirations: next 6 months"); // source campaign attribution
});

test("create an opportunity, then add a task and a note", async ({ page }) => {
  await signIn(page, "manager@brs-demo.example");
  await page.goto("/app/brs/pipeline/new");
  await page.getByLabel("Title").fill("Northgate second floor");
  await page.getByLabel("Company").selectOption({ label: "Northgate Legal Group" });
  await page.getByLabel("Estimated value (USD)").fill("$18,500");
  await page.getByRole("button", { name: "Create opportunity" }).click();

  await expect(page.getByRole("heading", { name: "Northgate second floor" })).toBeVisible();
  await expect(page.getByText("Northgate Legal Group · $18,500")).toBeVisible();

  await page.getByLabel("New task").fill("Measure the space");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Measure the space")).toBeVisible();
  await page.getByRole("button", { name: "Complete" }).click();
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();

  await page.getByLabel("Note").fill("Synthetic note from the E2E test");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Synthetic note from the E2E test")).toBeVisible();
});

test("refuses a contact from a different company", async ({ page }) => {
  await signIn(page, "manager@brs-demo.example");
  await page.goto("/app/brs/pipeline/new");
  await page.getByLabel("Title").fill("Mismatch");
  await page.getByLabel("Company").selectOption({ label: "Lumen Ledger Partners" });
  await page.getByLabel("Contact (optional)").selectOption({ label: "Jordan Sample · Quarry Lane Biotech" });
  await page.getByRole("button", { name: "Create opportunity" }).click();
  await expect(page.getByText("That contact doesn't work at the selected company.")).toBeVisible();
});

test("another tenant's opportunity id shows not found and no data", async ({ page }) => {
  await signIn(page, "admin@harbor-demo.example");
  // Status is 200, not 404: the tenant loading.tsx has already started streaming
  // when the page calls notFound(). What matters is that nothing leaks.
  await page.goto(`/app/harbor-demo/pipeline/${PINECREST}`);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await expect(page.getByText("Pinecrest")).toHaveCount(0);
});
