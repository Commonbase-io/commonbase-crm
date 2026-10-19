import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { moveDealOptimistic, reconcileDeal, type BoardDeal, type BoardStage } from "@/lib/crm/board";
import { neutralizeCsvCell, parseCsv, serializeCsv } from "@/lib/csv";
import { dollarsToCents } from "@/lib/money";
import { passwordRuleError } from "@/lib/auth/password-rule";
import { companySchema, dealSchema, fieldErrorsFromZod } from "@/lib/validation";

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
    expect(dollarsToCents("20000000")).toBe(2_000_000_000);
    expect(dollarsToCents("20000000.01")).toBeNull();
    expect(dollarsToCents("999999999999.99")).toBeNull();
  });
});

describe("csv", () => {
  it("neutralizes formula prefixes and parses quotes", () => {
    expect(neutralizeCsvCell("=1+1")).toBe("'=1+1");
    expect(neutralizeCsvCell("+1")).toBe("'+1");
    expect(neutralizeCsvCell("+15550101")).toBe("+15550101");
    expect(neutralizeCsvCell("-2")).toBe("'-2");
    expect(neutralizeCsvCell("@sum")).toBe("'@sum");
    expect(neutralizeCsvCell("\u200B=HYPERLINK(\"http://evil\")")).toBe("'=HYPERLINK(\"http://evil\")");
    expect(neutralizeCsvCell("\u0000=1+1")).toBe("'=1+1");
    expect(neutralizeCsvCell(" =1+1")).toBe("'=1+1");
    expect(neutralizeCsvCell(" +15550101")).toBe("+15550101");
    expect(neutralizeCsvCell("Bakery")).toBe("Bakery");
    expect(serializeCsv([["name", "phone"], ["=1+1", "+15550101"]])).toBe("name,phone\r\n'=1+1,+15550101");
    expect(serializeCsv([["notes"], ['say, "hi"']])).toBe('notes\r\n"say, ""hi"""');
    const parsed = parseCsv('name,notes\n"Example, Bakery","line\nbreak"');
    expect(parsed.headers).toEqual(["name", "notes"]);
    expect(parsed.rows[0]).toEqual(["Example, Bakery", "line\nbreak"]);
  });
});

describe("currency", () => {
  it("accepts ISO codes and rejects made-up ones", () => {
    const base = { name: "Retainer", amount: "10.00", stageId: "11111111-1111-4111-8111-111111111111" };
    expect(dealSchema.safeParse({ ...base, currency: "usd" }).success).toBe(true);
    expect(dealSchema.safeParse({ ...base, currency: "EUR" }).success).toBe(true);
    const rejected = dealSchema.safeParse({ ...base, currency: "ABC" });
    expect(rejected.success).toBe(false);
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
