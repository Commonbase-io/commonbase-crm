"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ApiError, api } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { moveDealOptimistic, reconcileDeal, type BoardDeal, type BoardStage } from "@/lib/crm/board";

export function PipelineBoard({ stages, deals }: { stages: BoardStage[]; deals: BoardDeal[] }) {
  const [items, setItems] = useState(deals);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const serverStage = useRef(new Map(deals.map((deal) => [deal.id, deal.stageId])));
  const queue = useRef(new Map<string, Promise<void>>());
  const dragging = useRef<string | null>(null);
  const itemsRef = useRef(deals);

  function enqueue(dealId: string, task: () => Promise<void>) {
    const previous = queue.current.get(dealId) ?? Promise.resolve();
    const next = previous.then(task, task);
    queue.current.set(dealId, next);
  }

  function commit(next: BoardDeal[]) {
    itemsRef.current = next;
    setItems(next);
  }

  function move(dealId: string, stageId: string) {
    const stage = stages.find((item) => item.id === stageId);
    if (!stage) return;
    const snapshot = itemsRef.current.find((deal) => deal.id === dealId);
    if (!snapshot || snapshot.stageId === stageId) return;
    setError(null);
    commit(moveDealOptimistic(itemsRef.current, dealId, stage));
    enqueue(dealId, async () => {
      const expectedStageId = serverStage.current.get(dealId) ?? snapshot.stageId;
      if (!expectedStageId || expectedStageId === stageId) return;
      try {
        const updated = await api<BoardDeal>(`/api/deals/${dealId}/stage`, {
          method: "POST",
          body: { stageId, expectedStageId },
        });
        serverStage.current.set(dealId, updated.stageId);
        commit(reconcileDeal(itemsRef.current, updated));
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 409 && caught.payload.deal) {
          const serverDeal = caught.payload.deal as BoardDeal;
          serverStage.current.set(dealId, serverDeal.stageId);
          commit(reconcileDeal(itemsRef.current, serverDeal));
          setError("That deal was moved by someone else. The board shows the saved stage.");
          return;
        }
        serverStage.current.set(dealId, snapshot.stageId);
        commit(reconcileDeal(itemsRef.current, snapshot));
        setError(caught instanceof ApiError ? caught.message : "Could not move the deal");
      }
    });
  }

  return (
    <div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="board" data-testid="pipeline-board">
        {stages.map((stage) => (
          <section
            key={stage.id}
            className={over === stage.id ? "column over" : "column"}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(stage.id);
            }}
            onDragLeave={() => setOver((current) => (current === stage.id ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              setOver(null);
              // React delegates the drop listener, and some browsers clear
              // dataTransfer before that listener runs. The ref is the copy.
              const dealId = dragging.current || event.dataTransfer.getData("text/plain");
              dragging.current = null;
              if (dealId) move(dealId, stage.id);
            }}
          >
            <header>
              <strong>{stage.name}</strong>
              <span>{items.filter((deal) => deal.stageId === stage.id).length}</span>
            </header>
            {items
              .filter((deal) => deal.stageId === stage.id)
              .map((deal) => (
                <article
                  key={deal.id}
                  className="deal-card"
                  draggable
                  onDragStart={(event) => {
                    dragging.current = deal.id;
                    event.dataTransfer.setData("text/plain", deal.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                >
                  <Link href={`/deals/${deal.id}`}>
                    <strong>{deal.name}</strong>
                  </Link>
                  <span>{formatMoney(deal.amountCents, deal.currency)}</span>
                  <span>{deal.companyName}</span>
                </article>
              ))}
          </section>
        ))}
      </div>
    </div>
  );
}
