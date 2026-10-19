import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { moveDealOptimistic, reconcileDeal, type BoardDeal, type BoardStage } from "@/lib/crm/board";
import { neutralizeCsvCell, parseCsv } from "@/lib/csv";
import { dollarsToCents } from "@/lib/money";
import { passwordRuleError } from "@/lib/auth/password-rule";
import { companySchema, fieldErrorsFromZod } from "@/lib/validation";

describe("password rule", () => {
  it("requires 8 characters, a letter, and a digit", () => {
    expect(passwordRuleError("short1")).toMatch(/8 characters/);
    expect(passwordRuleError("longpassword")).toMatch(/digit/);
    expect(passwordRuleError("12345678")).toMatch(/letter/);
    expect(passwordRuleError("Password1")).toBeNull();
  });
});

describe("money", () => {
  it("stores dollars as integer cents", () => {
    expect(dollarsToCents("1200.50")).toBe(120050);
    expect(dollarsToCents("10")).toBe(1000);
    expect(dollarsToCents("1.2")).toBe(120);
    expect(dollarsToCents("1.234")).toBeNull();
    expect(dollarsToCents("-5")).toBeNull();
  });
});

describe("csv", () => {
  it("neutralizes formula prefixes and parses quotes", () => {
    expect(neutralizeCsvCell("=1+1")).toBe("'=1+1");
    expect(neutralizeCsvCell("+1")).toBe("'+1");
    expect(neutralizeCsvCell("-2")).toBe("'-2");
    expect(neutralizeCsvCell("@sum")).toBe("'@sum");
    expect(neutralizeCsvCell("Bakery")).toBe("Bakery");
    const parsed = parseCsv('name,notes\n"Example, Bakery","line\nbreak"');
    expect(parsed.headers).toEqual(["name", "notes"]);
    expect(parsed.rows[0]).toEqual(["Example, Bakery", "line\nbreak"]);
  });
});

describe("validation messages", () => {
  it("keeps the first message for each field", () => {
    const parsed = companySchema.safeParse({ name: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(fieldErrorsFromZod(parsed.error).name).toBe("Name is required");
    }
  });
});

describe("board moves", () => {
  const stage = (id: string, outcome: BoardStage["outcome"]): BoardStage => ({ id, name: id, position: 0, outcome });
  const deal: BoardDeal = {
    id: "deal",
    name: "Site",
    stageId: "lead",
    amountCents: 100,
    currency: "USD",
    status: "OPEN",
    companyName: null,
    ownerName: "Ada",
    expectedCloseDate: null,
  };

  it("moves optimistically and reconciles to the server stage", () => {
    const optimistic = moveDealOptimistic([deal], "deal", stage("won", "WON"));
    expect(optimistic[0]?.stageId).toBe("won");
    expect(optimistic[0]?.status).toBe("WON");
    const server = { ...deal, stageId: "qualified", status: "OPEN" as const };
    expect(reconcileDeal(optimistic, server)[0]?.stageId).toBe("qualified");
  });
});

describe("security sql", () => {
  it("keeps the role and RLS scripts inside the migration", () => {
    const migration = fs.readFileSync("prisma/migrations/20261019120000_init/migration.sql", "utf8");
    expect(migration).toContain(fs.readFileSync("prisma/app-role.sql", "utf8").trim());
    expect(migration).toContain(fs.readFileSync("prisma/rls-bootstrap.sql", "utf8").trim());
  });
});
