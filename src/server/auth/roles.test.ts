import { describe, expect, it } from "vitest";
import { assertCan, can, ForbiddenError, isRole } from "./roles";

describe("roles", () => {
  it("restricts team management and suppression removal to admins", () => {
    expect(can("tenant_admin", "team.manage")).toBe(true);
    expect(can("sales_manager", "team.manage")).toBe(false);
    expect(can("sales_rep", "suppression.remove")).toBe(false);
    expect(can("sales_rep", "suppression.add")).toBe(true);
  });

  it("does not let reps approve or enroll campaigns", () => {
    expect(can("sales_rep", "campaign.approve")).toBe(false);
    expect(can("sales_rep", "campaign.enroll")).toBe(false);
    expect(can("sales_manager", "campaign.approve")).toBe(true);
    expect(() => assertCan("sales_rep", "campaign.approve")).toThrow(ForbiddenError);
  });

  it("validates role strings from the database", () => {
    expect(isRole("sales_rep")).toBe(true);
    expect(isRole("owner")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
