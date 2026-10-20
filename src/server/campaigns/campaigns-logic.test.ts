import { describe, expect, it } from "vitest";
import { suppressionHash } from "@/server/compliance/suppression";
import { planEnrollment, providerContactId } from "./enrollment-plan";
import { IdempotencyConflictError, runIdempotent, type IdempotencyRecord, type IdempotencyStore } from "./idempotency";
import { canTransition, CAMPAIGN_STATUSES } from "./state";

describe("campaign state machine", () => {
  it("never allows activation without passing through approval", () => {
    expect(canTransition("draft", "active")).toBe(false);
    expect(canTransition("draft", "enrolling")).toBe(false);
    expect(canTransition("draft", "approved")).toBe(true);
    expect(canTransition("approved", "enrolling")).toBe(true);
    expect(canTransition("enrolling", "active")).toBe(true);
  });

  it("treats completed as terminal", () => {
    for (const to of CAMPAIGN_STATUSES) expect(canTransition("completed", to)).toBe(false);
  });
});

describe("planEnrollment", () => {
  const suppressions = {
    emails: new Set([suppressionHash("opted@out.example")]),
    domains: new Set([suppressionHash("blocked.example")]),
  };
  const c = (contactId: string, email: string | null, externalRef: string | null = null) => ({ contactId, email, externalRef });

  it("splits contacts by what may be sent", () => {
    const plan = planEnrollment(
      [c("1", "ok@fine.example"), c("2", "Opted@Out.example"), c("3", "x@blocked.example"), c("4", null), c("5", "a@fine.example"), c("6", "b@fine.example"), c("1", "ok@fine.example")],
      suppressions,
      new Map([["5", "enrolled"], ["6", "failed"]] as const),
    );
    expect(plan.toEnroll.map((x) => x.contactId)).toEqual(["1", "6"]);
    expect(plan.suppressed.map((x) => x.contactId)).toEqual(["2", "3"]);
    expect(plan.noEmail.map((x) => x.contactId)).toEqual(["4"]);
    expect(plan.alreadyEnrolled.map((x) => x.contactId)).toEqual(["5"]);
  });

  it("re-checks suppression even for previously failed contacts", () => {
    const plan = planEnrollment([c("1", "opted@out.example")], suppressions, new Map([["1", "failed"]] as const));
    expect(plan.suppressed).toHaveLength(1);
    expect(plan.toEnroll).toHaveLength(0);
  });

  it("uses a stable provider id", () => {
    expect(providerContactId(c("abc", "x@y.example", "mock-person-1"))).toBe("mock-person-1");
    expect(providerContactId(c("abc", "x@y.example"))).toBe("local:abc");
  });
});

function memoryStore(): IdempotencyStore & { rows: Map<string, IdempotencyRecord> } {
  const rows = new Map<string, IdempotencyRecord>();
  return {
    rows,
    async claim(key, _op, requestHash) {
      const existing = rows.get(key);
      if (existing) return { ...existing };
      rows.set(key, { status: "in_progress", requestHash, response: null });
      return "claimed";
    },
    async reclaim(key, requestHash) {
      const row = rows.get(key);
      if (!row || row.status !== "failed") return false;
      rows.set(key, { status: "in_progress", requestHash, response: null });
      return true;
    },
    async complete(key, response) {
      rows.set(key, { ...rows.get(key)!, status: "completed", response });
    },
    async fail(key, response) {
      rows.set(key, { ...rows.get(key)!, status: "failed", response });
    },
  };
}

describe("runIdempotent", () => {
  const input = { key: "key-12345678", operation: "campaign.enroll", request: { contacts: ["1", "2"] } };

  it("does the work once and replays the result on retry", async () => {
    const store = memoryStore();
    let calls = 0;
    const work = async () => ({ enrolled: ++calls });
    expect(await runIdempotent(store, input, work)).toEqual({ result: { enrolled: 1 }, replayed: false });
    expect(await runIdempotent(store, input, work)).toEqual({ result: { enrolled: 1 }, replayed: true });
    expect(calls).toBe(1);
  });

  it("refuses a concurrent duplicate", async () => {
    const store = memoryStore();
    let release!: () => void;
    const first = runIdempotent(store, input, () => new Promise<string>((resolve) => (release = () => resolve("done"))));
    await expect(runIdempotent(store, input, async () => "second")).rejects.toBeInstanceOf(IdempotencyConflictError);
    release();
    expect((await first).result).toBe("done");
  });

  it("refuses the same key for a different request", async () => {
    const store = memoryStore();
    await runIdempotent(store, input, async () => "ok");
    await expect(runIdempotent(store, { ...input, request: { contacts: ["3"] } }, async () => "x")).rejects.toMatchObject({ reason: "different_request" });
  });

  it("allows a retry after a failure", async () => {
    const store = memoryStore();
    await expect(runIdempotent(store, input, async () => { throw new Error("timeout"); })).rejects.toThrow("timeout");
    expect(store.rows.get(input.key)?.status).toBe("failed");
    expect(await runIdempotent(store, input, async () => "second try")).toEqual({ result: "second try", replayed: false });
  });
});
