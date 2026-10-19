export type BoardStage = {
  id: string;
  name: string;
  position: number;
  outcome: "OPEN" | "WON" | "LOST";
};

export type BoardDeal = {
  id: string;
  name: string;
  stageId: string;
  amountCents: number;
  currency: string;
  status: "OPEN" | "WON" | "LOST";
  companyName: string | null;
  ownerName: string;
  expectedCloseDate: string | null;
};

export function outcomeToStatus(outcome: BoardStage["outcome"]): BoardDeal["status"] {
  if (outcome === "WON") return "WON";
  if (outcome === "LOST") return "LOST";
  return "OPEN";
}

export function moveDealOptimistic(deals: BoardDeal[], dealId: string, stage: BoardStage): BoardDeal[] {
  return deals.map((deal) =>
    deal.id === dealId
      ? { ...deal, stageId: stage.id, status: outcomeToStatus(stage.outcome) }
      : deal,
  );
}

export function reconcileDeal(deals: BoardDeal[], serverDeal: BoardDeal): BoardDeal[] {
  const exists = deals.some((deal) => deal.id === serverDeal.id);
  if (!exists) return [...deals, serverDeal];
  return deals.map((deal) => (deal.id === serverDeal.id ? { ...deal, ...serverDeal } : deal));
}
