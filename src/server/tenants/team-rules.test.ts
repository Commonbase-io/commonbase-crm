import { describe, expect, it } from "vitest";
import { checkMembershipChange } from "./team-rules";

const base = { actorId: "admin-1", targetId: "user-2", targetRole: "sales_rep" as const, newRole: "sales_manager" as const, adminCount: 1 };

describe("checkMembershipChange", () => {
  it("allows promoting, demoting, and removing other members", () => {
    expect(checkMembershipChange(base)).toBeNull();
    expect(checkMembershipChange({ ...base, newRole: null })).toBeNull();
    expect(checkMembershipChange({ ...base, targetRole: "tenant_admin", newRole: "sales_rep", adminCount: 2 })).toBeNull();
  });

  it("never lets anyone change or remove themselves", () => {
    expect(checkMembershipChange({ ...base, targetId: "admin-1" })).toBe("self");
    expect(checkMembershipChange({ ...base, targetId: "admin-1", newRole: null })).toBe("self");
  });

  it("protects the last admin from demotion and removal", () => {
    expect(checkMembershipChange({ ...base, targetRole: "tenant_admin", newRole: "sales_manager", adminCount: 1 })).toBe("last_admin");
    expect(checkMembershipChange({ ...base, targetRole: "tenant_admin", newRole: null, adminCount: 1 })).toBe("last_admin");
  });

  it("rejects no-ops and non-members", () => {
    expect(checkMembershipChange({ ...base, newRole: "sales_rep" })).toBe("no_change");
    expect(checkMembershipChange({ ...base, targetRole: null })).toBe("not_member");
  });
});
