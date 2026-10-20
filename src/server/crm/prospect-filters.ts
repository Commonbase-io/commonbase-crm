import { z } from "zod";
import type { ProspectFilters } from "@/server/providers/interfaces";

// Prospect search filters arrive as URL search params (GET form) and are
// re-sent with the save action so the server can repeat the search.

const list = z
  .string()
  .max(500)
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 10),
  );

const optionalInt = z
  .string()
  .regex(/^\d{1,7}$/)
  .transform(Number)
  .optional()
  .or(z.literal("").transform(() => undefined));

export const prospectFilterSchema = z.object({
  location: list.optional(),
  industry: list.optional(),
  title: list.optional(),
  sizeMin: optionalInt,
  sizeMax: optionalInt,
  trigger: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,47}$/)).max(20).optional(),
});

export type ProspectFilterInput = z.infer<typeof prospectFilterSchema>;

type Source = Record<string, string | string[] | undefined>;

/** Parses URL params; invalid fields are dropped instead of failing the page. */
export function parseProspectFilters(source: Source): ProspectFilterInput {
  const single = (key: string) => {
    const value = source[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const many = (key: string) => {
    const value = source[key];
    return value === undefined ? undefined : Array.isArray(value) ? value : [value];
  };
  const out: ProspectFilterInput = {};
  for (const key of ["location", "industry", "title"] as const) {
    const parsed = prospectFilterSchema.shape[key].safeParse(single(key));
    if (parsed.success && parsed.data?.length) out[key] = parsed.data;
  }
  for (const key of ["sizeMin", "sizeMax"] as const) {
    const parsed = prospectFilterSchema.shape[key].safeParse(single(key));
    if (parsed.success && parsed.data !== undefined) out[key] = parsed.data;
  }
  const trigger = prospectFilterSchema.shape.trigger.safeParse(many("trigger"));
  if (trigger.success && trigger.data?.length) out.trigger = trigger.data;
  return out;
}

export function hasAnyFilter(filters: ProspectFilterInput): boolean {
  return Object.values(filters).some((value) => value !== undefined);
}

export function toProviderFilters(filters: ProspectFilterInput, perPage = 100): ProspectFilters {
  return {
    locations: filters.location,
    industries: filters.industry,
    titles: filters.title,
    employeeCountMin: filters.sizeMin,
    employeeCountMax: filters.sizeMax,
    triggerEventTypes: filters.trigger,
    page: 1,
    perPage,
  };
}

/** Serializes filters back to URL params (for links and hidden form fields). */
export function filtersToParams(filters: ProspectFilterInput): [string, string][] {
  const params: [string, string][] = [];
  if (filters.location) params.push(["location", filters.location.join(", ")]);
  if (filters.industry) params.push(["industry", filters.industry.join(", ")]);
  if (filters.title) params.push(["title", filters.title.join(", ")]);
  if (filters.sizeMin !== undefined) params.push(["sizeMin", String(filters.sizeMin)]);
  if (filters.sizeMax !== undefined) params.push(["sizeMax", String(filters.sizeMax)]);
  for (const t of filters.trigger ?? []) params.push(["trigger", t]);
  return params;
}
