import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as changePassword } from "@/app/api/auth/change-password/route";
import { GET as listCompanies } from "@/app/api/companies/route";
import { admin, call, makeOrg, resetDb, sessionCookie } from "../helpers/db";

beforeEach(async () => {
  await resetDb();
});

describe("auth", () => {
  it("logs in, rejects a bad password, and rate limits the email", async () => {
    await makeOrg({ name: "Auth Org", slug: "auth-org", email: "ada@example.com" });
    const ok = await call(login, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "ada@example.com", password: "Password1" }),
    });
    expect(ok.status).toBe(200);
    expect(ok.cookie).toContain("crm_session=");

    const bad = await call(login, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "ada@example.com", password: "wrongpass" }),
    });
    expect(bad.status).toBe(401);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await call(login, "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "ada@example.com", password: "wrongpass" }),
      });
    }
    const limited = await call(login, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "ada@example.com", password: "Password1" }),
    });
    expect(limited.status).toBe(429);
  });

  it("blocks the app until a temporary password is changed", async () => {
    await makeOrg({
      name: "Temp Org",
      slug: "temp-org",
      email: "temp@example.com",
      mustChangePassword: true,
    });
    const signedIn = await call(login, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "temp@example.com", password: "Password1" }),
    });
    const cookie = sessionCookie(signedIn.cookie);
    const blocked = await call(listCompanies, "/api/companies", { cookie });
    expect(blocked.status).toBe(428);

    const weak = await call(changePassword, "/api/auth/change-password", {
      method: "POST",
      cookie,
      body: JSON.stringify({ currentPassword: "Password1", newPassword: "longpassword" }),
    });
    expect(weak.status).toBe(400);
    expect(weak.body.fieldErrors.newPassword).toMatch(/digit/);

    const changed = await call(changePassword, "/api/auth/change-password", {
      method: "POST",
      cookie,
      body: JSON.stringify({ currentPassword: "Password1", newPassword: "Password2" }),
    });
    expect(changed.status).toBe(200);
    const open = await call(listCompanies, "/api/companies", { cookie });
    expect(open.status).toBe(200);
  });

  it("rejects a deactivated user", async () => {
    const { user } = await makeOrg({ name: "Gone Org", slug: "gone-org", email: "gone@example.com" });
    await admin.user.update({ where: { id: user.id }, data: { deactivatedAt: new Date() } });
    const response = await call(login, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "gone@example.com", password: "Password1" }),
    });
    expect(response.status).toBe(401);
  });
});
