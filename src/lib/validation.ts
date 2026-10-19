import { dollarsToCents } from "@/lib/money";
import { passwordRuleError } from "@/lib/auth/password-rule";
import { z, type ZodError } from "zod";

export function fieldErrorsFromZod(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "_form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  let domain = value.trim().toLowerCase();
  domain = domain.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  domain = domain.replace(/^www\./, "");
  domain = domain.split("/")[0]?.split("?")[0]?.split("#")[0] ?? "";
  domain = domain.replace(/\.$/, "");
  return domain || null;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  return email || null;
}

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalTrimmed(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));
}

const optionalDomain = z
  .string()
  .trim()
  .max(253)
  .nullish()
  .transform((value) => normalizeDomain(value))
  .refine((value) => value === null || DOMAIN_PATTERN.test(value), "Enter a domain like example.com");

const optionalEmail = z
  .string()
  .trim()
  .max(320)
  .nullish()
  .transform((value) => normalizeEmail(value))
  .refine((value) => value === null || EMAIL_PATTERN.test(value), "Enter a valid email");

const optionalUuid = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || z.string().uuid().safeParse(value).success, "Choose a valid record");

const optionalOwner = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value : undefined))
  .refine((value) => value === undefined || z.string().uuid().safeParse(value).success, "Choose an owner");

export const companySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name must be 200 characters or fewer"),
  domain: optionalDomain,
  phone: optionalTrimmed(40),
  addressLine1: optionalTrimmed(200),
  addressLine2: optionalTrimmed(200),
  city: optionalTrimmed(100),
  region: optionalTrimmed(100),
  postalCode: optionalTrimmed(20),
  country: optionalTrimmed(100),
  notes: optionalTrimmed(5000),
  ownerId: optionalOwner,
});

export const contactSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  email: optionalEmail,
  phone: optionalTrimmed(40),
  title: optionalTrimmed(120),
  companyId: optionalUuid,
  notes: optionalTrimmed(5000),
  ownerId: optionalOwner,
});

const CURRENCIES = new Set(Intl.supportedValuesOf("currency"));

const amountField = z
  .string()
  .trim()
  .refine((value) => dollarsToCents(value) !== null, "Enter a dollar amount with up to 2 decimal places");

const closeDate = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), "Use a date as YYYY-MM-DD");

export const dealSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  amount: amountField,
  currency: z
    .string()
    .trim()
    .nullish()
    .transform((value) => (value ? value.toUpperCase() : "USD"))
    .refine((value) => CURRENCIES.has(value), "Use a real currency code"),
  stageId: z.string().uuid("Choose a stage"),
  companyId: optionalUuid,
  ownerId: optionalOwner,
  expectedCloseDate: closeDate,
  contactIds: z.array(z.string().uuid()).max(50).optional().transform((value) => value ?? []),
});

export const dealUpdateSchema = dealSchema.omit({ stageId: true });

export const noteSchema = z
  .object({
    body: z.string().trim().min(1, "Note is required").max(5000),
    companyId: optionalUuid,
    contactId: optionalUuid,
    dealId: optionalUuid,
  })
  .refine((value) => [value.companyId, value.contactId, value.dealId].filter(Boolean).length === 1, {
    message: "Attach the note to one record",
    path: ["body"],
  });

export const stageMoveSchema = z.object({
  stageId: z.string().uuid("Choose a stage"),
  expectedStageId: z.string().uuid("Missing the stage this deal is moving from"),
});

const passwordField = z.string().superRefine((value, ctx) => {
  const message = passwordRuleError(value);
  if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").max(320),
  password: z.string().min(1, "Password is required").max(128, "Password must be 128 characters or fewer."),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(128, "Password must be 128 characters or fewer."),
  newPassword: passwordField,
});

export const userCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(320)
    .transform((value) => value.toLowerCase())
    .refine((value) => EMAIL_PATTERN.test(value), "Enter a valid email"),
  role: z.enum(["ADMIN", "MEMBER"]),
  password: passwordField,
});

export const userPatchSchema = z
  .object({
    role: z.enum(["ADMIN", "MEMBER"]).optional(),
    deactivated: z.boolean().optional(),
  })
  .refine((value) => value.role !== undefined || value.deactivated !== undefined, {
    message: "Nothing to update",
    path: ["_form"],
  });

export const stageCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  outcome: z.enum(["OPEN", "WON", "LOST"]).optional().default("OPEN"),
});

export const stagePatchSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80).optional(),
    outcome: z.enum(["OPEN", "WON", "LOST"]).optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.outcome !== undefined || value.archived !== undefined, {
    message: "Nothing to update",
    path: ["_form"],
  });

export const stageReorderSchema = z.object({
  stageIds: z.array(z.string().uuid()).min(1, "Include every stage"),
});

export const orgCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens"),
  adminName: z.string().trim().min(1, "Admin name is required").max(120),
  adminEmail: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => EMAIL_PATTERN.test(value), "Enter a valid email"),
  password: passwordField,
});

export const importSchema = z.object({
  csv: z.string().min(1, "Upload a CSV file").max(1_000_000, "CSV must be 1 MB or smaller"),
  mapping: z.record(z.string(), z.string()),
});

export const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  ownerId: z.string().trim().optional().default(""),
  stageId: z.string().trim().optional().default(""),
  companyId: z.string().trim().optional().default(""),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type CompanyInput = z.infer<typeof companySchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type DealInput = z.infer<typeof dealSchema>;
export type DealUpdateInput = z.infer<typeof dealUpdateSchema>;
export type NoteInput = z.infer<typeof noteSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserPatchInput = z.infer<typeof userPatchSchema>;
export type OrgCreateInput = z.infer<typeof orgCreateSchema>;
export type ImportInput = z.infer<typeof importSchema>;

export function parseListQuery(raw: Record<string, string | string[] | undefined>): ListQuery {
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const parsed = listQuerySchema.parse({
    q: one(raw.q),
    ownerId: one(raw.ownerId),
    stageId: one(raw.stageId),
    companyId: one(raw.companyId),
    page: one(raw.page) || "1",
    pageSize: one(raw.pageSize) || "20",
  });
  const uuid = (value: string) => (z.string().uuid().safeParse(value).success ? value : "");
  return {
    ...parsed,
    ownerId: uuid(parsed.ownerId),
    stageId: uuid(parsed.stageId),
    companyId: uuid(parsed.companyId),
  };
}
