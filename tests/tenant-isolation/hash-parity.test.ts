import { describe, expect, it } from "vitest";
import { suppressionHash } from "@/server/compliance/suppression";
import { asService } from "../support/db";

describe("suppression hash parity", () => {
  it("TypeScript and SQL hash normalized values identically", async () => {
    const values = ["Dana@Example.COM", "  spaced@x.example ", "domain.example", "ünïcode@exämple.example"];
    await asService(async (db) => {
      for (const value of values) {
        const { rows } = await db.query("select app.suppression_hash($1) as h", [value]);
        expect(rows[0]?.h, value).toBe(suppressionHash(value));
      }
    });
  });
});
