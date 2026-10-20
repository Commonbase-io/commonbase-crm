import { describe, expect, it } from "vitest";
import { filtersToParams, hasAnyFilter, parseProspectFilters, toProviderFilters } from "./prospect-filters";

describe("prospect filters", () => {
  it("parses comma lists, sizes, and repeated trigger params", () => {
    const filters = parseProspectFilters({
      title: " Facilities Manager, Office Manager ,",
      location: "Springfield",
      sizeMin: "50",
      sizeMax: "",
      trigger: ["lease_expiration", "relocation"],
    });
    expect(filters).toEqual({
      title: ["Facilities Manager", "Office Manager"],
      location: ["Springfield"],
      sizeMin: 50,
      trigger: ["lease_expiration", "relocation"],
    });
    expect(toProviderFilters(filters)).toMatchObject({ titles: ["Facilities Manager", "Office Manager"], employeeCountMin: 50, triggerEventTypes: ["lease_expiration", "relocation"] });
  });

  it("drops invalid values instead of failing", () => {
    const filters = parseProspectFilters({ sizeMin: "-5", sizeMax: "lots", trigger: "DROP TABLE" });
    expect(filters).toEqual({});
    expect(hasAnyFilter(filters)).toBe(false);
  });

  it("round-trips through URL params", () => {
    const filters = parseProspectFilters({ industry: "Software, Legal", sizeMax: "500", trigger: "relocation" });
    const params = new URLSearchParams(filtersToParams(filters));
    expect(parseProspectFilters({ industry: params.get("industry") ?? undefined, sizeMax: params.get("sizeMax") ?? undefined, trigger: params.getAll("trigger") })).toEqual(filters);
  });
});
