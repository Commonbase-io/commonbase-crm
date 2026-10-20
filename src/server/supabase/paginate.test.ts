import { describe, expect, it } from "vitest";
import { fetchAllPages, PAGE_SIZE } from "./paginate";

/** Simulates PostgREST: honors range() but never returns more than maxRows. */
const table = (count: number, maxRows = 1000) => (from: number, to: number) =>
  Promise.resolve({ data: Array.from({ length: Math.max(0, Math.min(to, count - 1, from + maxRows - 1) - from + 1) }, (_, i) => from + i), error: null });

describe("fetchAllPages", () => {
  it("reads past the API row cap", async () => {
    const { data } = await fetchAllPages(table(2345));
    expect(data).toHaveLength(2345);
    expect(new Set(data).size).toBe(2345);
  });

  it("handles empty, exact-multiple, and single-page tables", async () => {
    expect((await fetchAllPages(table(0))).data).toHaveLength(0);
    expect((await fetchAllPages(table(PAGE_SIZE * 2))).data).toHaveLength(PAGE_SIZE * 2);
    expect((await fetchAllPages(table(7))).data).toHaveLength(7);
  });

  it("stops and reports an error", async () => {
    let calls = 0;
    const result = await fetchAllPages(() => Promise.resolve(++calls === 2 ? { data: null, error: new Error("boom") } : { data: Array(PAGE_SIZE).fill(0), error: null }));
    expect(result.error).toBeInstanceOf(Error);
    expect(result.data).toHaveLength(PAGE_SIZE);
  });
});
