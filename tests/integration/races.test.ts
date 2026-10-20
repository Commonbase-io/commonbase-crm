import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createCompany } from "@/app/api/companies/route";
import { POST as importCompanies } from "@/app/api/import/companies/route";
import { POST as createStage } from "@/app/api/stages/route";
import { POST as reorderStages } from "@/app/api/stages/reorder/route";
import { POST as createUser } from "@/app/api/users/route";
import { getBoard } from "@/lib/crm/deals";
import { updateUser } from "@/lib/crm/users";
import type { SessionUser } from "@/lib/auth/session";
import { admin, call, makeOrg, resetDb, sessionCookie } from "../helpers/db";

async function signIn(email: string, password = "Password1") {
  const response = await call(login, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  expect(response.status).toBe(200);
  return sessionCookie(response.cookie);
}

beforeEach(async () => {
  await resetDb();
});

describe("concurrent writes", () => {
  it("keeps one admin when two demotions run together", async () => {
    const { org, user } = await makeOrg({ name: "Admins", slug: "admins", email: "a@example.com" });
    const cookie = await signIn("a@example.com");
    const created = await call(createUser, "/api/users", {
      method: "POST",
      cookie,
      body: JSON.stringify({ name: "Two", email: "two@example.com", role: "ADMIN", password: "Password2" }),
    });
    expect(created.status).toBe(201);
    await admin.user.update({ where: { email: "two@example.com" }, data: { mustChangePassword: false } });
    const two = await admin.user.findUniqueOrThrow({ where: { email: "two@example.com" } });
    const sessionFor = (id: string, email: string, name: string): SessionUser => ({
      id,
      orgId: org.id,
      orgName: org.name,
      orgIsPlatform: false,
      email,
      name,
      role: "ADMIN",
      isPlatformAdmin: false,
      mustChangePassword: false,
    });
    const results = await Promise.allSettled([
      updateUser(sessionFor(user.id, user.email, user.name), user.id, { role: "MEMBER" }),
      updateUser(sessionFor(two.id, two.email, two.name), two.id, { role: "MEMBER" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const admins = await admin.user.count({ where: { orgId: org.id, role: "ADMIN", deactivatedAt: null } });
    expect(admins).toBe(1);
  });

  it("does not give two new stages the same position", async () => {
    const { org } = await makeOrg({ name: "Stages", slug: "stages", email: "a@example.com" });
    const cookie = await signIn("a@example.com");
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        call(createStage, "/api/stages", {
          method: "POST",
          cookie,
          body: JSON.stringify({ name: `Extra ${n}`, outcome: "OPEN" }),
        }),
      ),
    );
    expect(results.every((result) => result.status === 201)).toBe(true);
    const positions = (
      await admin.stage.findMany({ where: { orgId: org.id, archivedAt: null }, select: { position: true } })
    ).map((stage) => stage.position);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("serializes stage reorders instead of deadlocking", async () => {
    const { org } = await makeOrg({ name: "Reorder", slug: "reorder", email: "a@example.com" });
    const cookie = await signIn("a@example.com");
    const stages = await admin.stage.findMany({ where: { orgId: org.id, archivedAt: null }, orderBy: { position: "asc" } });
    const forward = stages.map((stage) => stage.id);
    const backward = [...forward].reverse();
    const results = await Promise.all([
      call(reorderStages, "/api/stages/reorder", { method: "POST", cookie, body: JSON.stringify({ stageIds: backward }) }),
      call(reorderStages, "/api/stages/reorder", { method: "POST", cookie, body: JSON.stringify({ stageIds: forward }) }),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    const positions = (
      await admin.stage.findMany({ where: { orgId: org.id, archivedAt: null }, select: { position: true } })
    )
      .map((stage) => stage.position)
      .sort((a, b) => a - b);
    expect(positions).toEqual(stages.map((_, index) => index));
  });

  it("reports a duplicate import instead of failing the request", async () => {
    await makeOrg({ name: "Import", slug: "import", email: "a@example.com" });
    const cookie = await signIn("a@example.com");
    const csv = "name,domain\nRace Co,race.example";
    const body = JSON.stringify({ csv, mapping: { name: "name", domain: "domain" } });
    const results = await Promise.all(
      [0, 1].map(() => call(importCompanies, "/api/import/companies", { method: "POST", cookie, body })),
    );
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(results.reduce((sum, result) => sum + result.body.created, 0)).toBe(1);
    const statuses = results.map((result) => result.body.rows[0].status).sort();
    expect(statuses).toEqual(["duplicate", "valid"]);
  });

  it("returns a field error when two creates use the same domain", async () => {
    const { org } = await makeOrg({ name: "Create", slug: "create", email: "a@example.com" });
    const cookie = await signIn("a@example.com");
    const body = JSON.stringify({ name: "Dup", domain: "dup.example" });
    const results = await Promise.all(
      [0, 1].map(() => call(createCompany, "/api/companies", { method: "POST", cookie, body })),
    );
    expect(results.map((result) => result.status).sort()).toEqual([201, 400]);
    expect(results.find((result) => result.status === 400)?.body.fieldErrors.domain).toMatch(/domain/i);
    expect(await admin.company.count({ where: { orgId: org.id, domain: "dup.example" } })).toBe(1);
  });

  it("tells the board when deals were left off", async () => {
    const { org, user } = await makeOrg({ name: "Board", slug: "board", email: "a@example.com" });
    const stage = await admin.stage.findFirstOrThrow({ where: { orgId: org.id, name: "Lead" } });
    await admin.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { orgId: org.id, name: "Board Co", ownerId: user.id },
      });
      const contact = await tx.contact.create({
        data: { orgId: org.id, firstName: "Pat", lastName: "Board", companyId: company.id, ownerId: user.id },
      });
      await tx.deal.createMany({
        data: Array.from({ length: 501 }, (_, index) => ({
          orgId: org.id,
          name: `Deal ${index}`,
          amountCents: 100,
          stageId: stage.id,
          companyId: company.id,
          ownerId: user.id,
        })),
      });
      const deals = await tx.deal.findMany({ where: { orgId: org.id }, select: { id: true } });
      await tx.dealContact.createMany({
        data: deals.map((deal) => ({
          orgId: org.id,
          dealId: deal.id,
          contactId: contact.id,
          companyId: company.id,
        })),
      });
    });
    const board = await getBoard({
      id: user.id,
      orgId: org.id,
      orgName: org.name,
      orgIsPlatform: false,
      email: user.email,
      name: user.name,
      role: "ADMIN",
      isPlatformAdmin: false,
      mustChangePassword: false,
    });
    expect(board.deals).toHaveLength(500);
    expect(board.truncated).toBe(true);
  });
});
