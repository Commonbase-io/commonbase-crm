// Application-level permission matrix. RLS enforces the same boundaries in the
// database; this exists so server code (which may use the service role) checks
// explicitly and so the UI can hide actions a user cannot take.

export const ROLES = ["tenant_admin", "sales_manager", "sales_rep"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  tenant_admin: "Admin",
  sales_manager: "Sales manager",
  sales_rep: "Sales rep",
};

const PERMISSIONS = {
  "crm.read": ["tenant_admin", "sales_manager", "sales_rep"],
  "crm.write": ["tenant_admin", "sales_manager", "sales_rep"],
  "crm.delete": ["tenant_admin", "sales_manager"],
  "opportunity.reassign": ["tenant_admin", "sales_manager"],
  "prospects.search": ["tenant_admin", "sales_manager", "sales_rep"],
  "prospects.enrich": ["tenant_admin", "sales_manager"],
  "campaign.edit": ["tenant_admin", "sales_manager"],
  "campaign.approve": ["tenant_admin", "sales_manager"],
  "campaign.enroll": ["tenant_admin", "sales_manager"],
  "suppression.add": ["tenant_admin", "sales_manager", "sales_rep"],
  "suppression.remove": ["tenant_admin"],
  "team.manage": ["tenant_admin"],
  "integrations.view": ["tenant_admin", "sales_manager"],
  "integrations.manage": ["tenant_admin"],
  "jobs.view": ["tenant_admin", "sales_manager"],
  "audit.view": ["tenant_admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export class ForbiddenError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Forbidden: missing permission ${permission}`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}
