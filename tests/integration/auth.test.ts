import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as changePassword } from "@/app/api/auth/change-password/route";
import { GET as getCompany } from "@/app/api/companies/[id]/route";
import { GET as listCompanies } from "@/app/api/companies/route";
import { proxy } from "@/proxy";
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
    expect(ok.cookie).toMatch(/HttpOnly/i);
    expect(ok.cookie).toMatch(/SameSite=Lax/i);

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
    const open = await call(listCompanies, "/api/companies", { cookie: sessionCookie(changed.cookie) });
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

  it("does not treat a client-supplied X-Forwarded-For as the client address", async () => {
    await makeOrg({ name: "Auth Org", slug: "auth-org", email: "ada@example.com" });
    const response = await call(login, "/api/auth/login", {
      method: "POST",
      headers: { "x-forwarded-for": "1.2.3.4, 9.9.9.9" },
      body: JSON.stringify({ email: "ada@example.com", password: "wrongpass" }),
    });
    expect(response.status).toBe(401);
    const attempt = await admin.loginAttempt.findFirstOrThrow();
    expect(attempt.ip).toBe("unknown");
  });

  it("rate limits a trusted proxy hop even when the leftmost address rotates", async () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    await makeOrg({ name: "Auth Org", slug: "auth-org", email: "ada@example.com" });
    let last = 0;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      const response = await call(login, "/api/auth/login", {
        method: "POST",
        headers: { "x-forwarded-for": `198.51.100.${attempt}, 203.0.113.9` },
        body: JSON.stringify({ email: `spray-${attempt}@example.com`, password: "wrongpass" }),
      });
      last = response.status;
    }
    expect(last).toBe(429);
    const attempts = await admin.loginAttempt.findMany({ where: { ip: "203.0.113.9" } });
    expect(attempts.length).toBeGreaterThan(0);
    expect(await admin.loginAttempt.count({ where: { ip: { startsWith: "198.51.100." } } })).toBe(0);
  });

  it("does not let a burst of failures past the email cap", async () => {
    await makeOrg({ name: "Auth Org", slug: "auth-org", email: "ada@example.com" });
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        call(login, "/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: "ada@example.com", password: "wrongpass" }),
        }),
      ),
    );
    const failures = results.filter((result) => result.status === 401);
    expect(failures).toHaveLength(5);
    expect(results.filter((result) => result.status === 429)).toHaveLength(3);
  });

  it("revokes every session when the password changes", async () => {
    await makeOrg({ name: "Auth Org", slug: "auth-org", email: "ada@example.com" });
    const first = await call(login, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "ada@example.com", password: "Password1" }),
    });
    const second = await call(login, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "ada@example.com", password: "Password1" }),
    });
    const changed = await call(changePassword, "/api/auth/change-password", {
      method: "POST",
      cookie: sessionCookie(first.cookie),
      body: JSON.stringify({ currentPassword: "Password1", newPassword: "Password2" }),
    });
    expect(changed.status).toBe(200);
    expect(changed.cookie).toContain("crm_session=");
    const oldBrowser = await call(listCompanies, "/api/companies", { cookie: sessionCookie(first.cookie) });
    const otherDevice = await call(listCompanies, "/api/companies", { cookie: sessionCookie(second.cookie) });
    const current = await call(listCompanies, "/api/companies", { cookie: sessionCookie(changed.cookie) });
    expect(oldBrowser.status).toBe(401);
    expect(otherDevice.status).toBe(401);
    expect(current.status).toBe(200);
  });

  it("rejects an oversized password before hashing it", async () => {
    await makeOrg({ name: "Auth Org", slug: "auth-org", email: "ada@example.com" });
    const response = await call(login, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "ada@example.com", password: `${"a".repeat(200)}1` }),
    });
    expect(response.status).toBe(400);
  });

  it("hides a malformed record id", async () => {
    await makeOrg({ name: "Auth Org", slug: "auth-org", email: "ada@example.com" });
    const signedIn = await call(login, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "ada@example.com", password: "Password1" }),
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call(getCompany, "/api/companies/not-a-uuid", {
      cookie: sessionCookie(signedIn.cookie),
      params: { id: "not-a-uuid" },
    });
    expect(response.status).toBe(404);
    const logged = spy.mock.calls.flat().map((part) => String(part)).join(" ");
    expect(logged).not.toContain("not-a-uuid");
    expect(logged).not.toContain("password");
    spy.mockRestore();
  });

  it("sends a forced password change away from the app before the page renders", async () => {
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
    const response = await proxy(
      new NextRequest("http://localhost/companies", { headers: { cookie: sessionCookie(signedIn.cookie) } }),
    );
    expect(response.headers.get("location")).toContain("/change-password");
    const allowed = await proxy(
      new NextRequest("http://localhost/change-password", { headers: { cookie: sessionCookie(signedIn.cookie) } }),
    );
    expect(allowed.headers.get("location")).toBeNull();
  });
});

afterEach(() => {
  delete process.env.TRUSTED_PROXY_HOPS;
});
