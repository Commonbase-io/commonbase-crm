import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as platformOrgs, POST as createOrg } from "@/app/api/platform/orgs/route";
import { POST as createStage } from "@/app/api/stages/route";
import { POST as createUser } from "@/app/api/users/route";
import { admin, call, makeOrg, resetDb, sessionCookie } from "../helpers/db";

async function signIn(email: string) {
  const response = await call(login, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "Password1" }),
  });
  expect(response.status).toBe(200);
  return sessionCookie(response.cookie);
}

beforeEach(async () => {
  await resetDb();
});

describe("authorization", () => {
  it("hides user and stage management from members", async () => {
    await makeOrg({ name: "Client", slug: "client-org", email: "admin@example.com" });
    await makeOrg({ name: "Client", slug: "client-org-member", email: "member@example.com", role: "MEMBER" });
    const cookie = await signIn("member@example.com");

    const users = await call(createUser, "/api/users", {
      method: "POST",
      cookie,
      body: JSON.stringify({ name: "New", email: "new@example.com", role: "MEMBER", password: "Password1" }),
    });
    expect(users.status).toBe(404);

    const stages = await call(createStage, "/api/stages", {
      method: "POST",
      cookie,
      body: JSON.stringify({ name: "Nurture", outcome: "OPEN" }),
    });
    expect(stages.status).toBe(404);

    const platform = await call(platformOrgs, "/api/platform/orgs", { cookie });
    expect(platform.status).toBe(404);
  });

  it("hides the platform console from client admins and lets a platform admin create an org", async () => {
    await makeOrg({
      name: "Commonbase Platform",
      slug: "platform",
      email: "platform.admin@example.com",
      isPlatform: true,
      isPlatformAdmin: true,
    });
    await makeOrg({ name: "Client", slug: "client-org", email: "admin@example.com" });
    const client = await signIn("admin@example.com");
    const hidden = await call(platformOrgs, "/api/platform/orgs", { cookie: client });
    expect(hidden.status).toBe(404);

    const platform = await signIn("platform.admin@example.com");
    const listed = await call(platformOrgs, "/api/platform/orgs", { cookie: platform });
    expect(listed.status).toBe(200);
    expect(listed.body.some((org: { slug: string }) => org.slug === "client-org")).toBe(true);

    const created = await call(createOrg, "/api/platform/orgs", {
      method: "POST",
      cookie: platform,
      body: JSON.stringify({
        name: "River Demo",
        slug: "river-demo",
        adminName: "Riley Example",
        adminEmail: "riley@example.com",
        password: "Password1",
      }),
    });
    expect(created.status).toBe(201);
    const stages = await admin.stage.findMany({
      where: { org: { slug: "river-demo" }, archivedAt: null },
      orderBy: { position: "asc" },
    });
    expect(stages.map((stage) => stage.name)).toEqual(["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]);
    const adminUser = await admin.user.findUniqueOrThrow({ where: { email: "riley@example.com" } });
    expect(adminUser.mustChangePassword).toBe(true);
    expect(adminUser.role).toBe("ADMIN");
  });
});
