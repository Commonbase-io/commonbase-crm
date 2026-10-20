import { describe, expect, it } from "vitest";
import { redact } from "./redact";
import { emailDomain, isSuppressed, normalizeDomain, suppressionHash } from "./suppression";
import { checkCampaignCompliance } from "./template-check";

describe("suppression", () => {
  const set = {
    emails: new Set([suppressionHash("opted.out@acme.example")]),
    domains: new Set([suppressionHash("blocked.example")]),
  };

  it("matches emails case- and whitespace-insensitively", () => {
    expect(isSuppressed("  Opted.Out@ACME.example ", set)).toBe(true);
    expect(isSuppressed("someone.else@acme.example", set)).toBe(false);
  });

  it("matches suppressed domains", () => {
    expect(isSuppressed("anyone@Blocked.example", set)).toBe(true);
  });

  it("treats missing or malformed emails as suppressed", () => {
    expect(isSuppressed(null, set)).toBe(true);
    expect(isSuppressed("not-an-email", set)).toBe(true);
    expect(emailDomain("a@")).toBeNull();
  });

  it("normalizes domains for company dedupe", () => {
    expect(normalizeDomain(" https://www.Acme.example/about ")).toBe("acme.example");
  });
});

describe("template compliance", () => {
  const good = "Hi {{first_name}}\n{{sender_postal_address}}\n{{unsubscribe_url}}";

  it("passes compliant campaigns", () => {
    expect(checkCampaignCompliance({ postalAddress: "1 Main St", steps: [{ position: 1, stepType: "email", body: good }] })).toEqual([]);
  });

  it("requires a postal address, an email step, and both tokens in every email step", () => {
    const problems = checkCampaignCompliance({
      postalAddress: " ",
      steps: [
        { position: 1, stepType: "email", body: good },
        { position: 2, stepType: "email", body: "no footer" },
        { position: 3, stepType: "task", body: "call them" },
      ],
    });
    expect(problems).toEqual([
      { code: "missing_postal_address" },
      { code: "missing_unsubscribe", position: 2 },
      { code: "missing_postal_address_token", position: 2 },
    ]);
    expect(checkCampaignCompliance({ postalAddress: "x", steps: [] })).toEqual([{ code: "no_email_steps" }]);
  });
});

describe("redact", () => {
  it("removes emails, names, and tokens", () => {
    const out = JSON.stringify(
      redact({
        email: "dana@acme.example",
        name: "Dana Example",
        nested: { note: "reply from dana@acme.example", authorization: "Bearer abc.def.ghi" },
        message: "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijk",
        count: 3,
      }),
    );
    expect(out).not.toContain("dana@acme.example");
    expect(out).not.toContain("Dana Example");
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(out).not.toContain("abc.def.ghi");
    expect(out).toContain('"count":3');
  });
});
