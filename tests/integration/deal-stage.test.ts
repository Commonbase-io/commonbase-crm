import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as moveStage } from "@/app/api/deals/[id]/stage/route";
import { admin, call, makeOrg, resetDb, sessionCookie } from "../helpers/db";

beforeEach(async () => {
  await resetDb();
});

describe("deal stage moves", () => {
  it("updates status from the stage and refuses a stale concurrent move", async () => {
    const { org, user } = await makeOrg({ name: "Deal Org", slug: "deal-org", email: "ada@example.com" });
    const stages = await admin.stage.findMany({ where: { orgId: org.id } });
    const byName = Object.fromEntries(stages.map((stage) => [stage.name, stage]));
    const deal = await admin.deal.create({
      data: {
        orgId: org.id,
        name: "Retainer",
        amountCents: 50000,
        stageId: byName.Lead.id,
        ownerId: user.id,
        status: "OPEN",
      },
    });
    const signedIn = await call(login, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "ada@example.com", password: "Password1" }),
    });
    const cookie = sessionCookie(signedIn.cookie);

    const qualified = await call(moveStage, `/api/deals/${deal.id}/stage`, {
      method: "POST",
      cookie,
      params: { id: deal.id },
      body: JSON.stringify({ stageId: byName.Qualified.id, expectedStageId: byName.Lead.id }),
    });
    expect(qualified.status).toBe(200);
    expect(qualified.body.stageId).toBe(byName.Qualified.id);
    expect(qualified.body.status).toBe("OPEN");

    const won = await call(moveStage, `/api/deals/${deal.id}/stage`, {
      method: "POST",
      cookie,
      params: { id: deal.id },
      body: JSON.stringify({ stageId: byName.Won.id, expectedStageId: byName.Qualified.id }),
    });
    expect(won.status).toBe(200);
    expect(won.body.status).toBe("WON");

    const stale = await call(moveStage, `/api/deals/${deal.id}/stage`, {
      method: "POST",
      cookie,
      params: { id: deal.id },
      body: JSON.stringify({ stageId: byName.Lost.id, expectedStageId: byName.Qualified.id }),
    });
    expect(stale.status).toBe(409);
    expect(stale.body.deal.stageId).toBe(byName.Won.id);
    expect(stale.body.deal.status).toBe("WON");
    const saved = await admin.deal.findUniqueOrThrow({ where: { id: deal.id } });
    expect(saved.stageId).toBe(byName.Won.id);
    expect(saved.status).toBe("WON");
  });
});
