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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 md:snap-none" data-testid="pipeline-board">
        {stages.map((stage) => {
          const column = items.filter((deal) => deal.stageId === stage.id);
          return (
            <section
              key={stage.id}
              className={`flex w-[85vw] max-w-[340px] shrink-0 snap-start flex-col rounded-xl border bg-muted/40 sm:w-[330px] ${over === stage.id ? "border-primary" : "border-border"}`}
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
              <header className="flex items-center justify-between gap-2 border-b border-border/70 p-3">
                <span className="text-sm font-medium">{stage.name}</span>
                <span className="text-xs font-medium text-muted-foreground">{column.length}</span>
              </header>
              <div className="flex max-h-[calc(100dvh-15rem)] min-h-[6rem] flex-col gap-2 overflow-y-auto p-2">
                {column.length === 0 ? (
                  <div className="m-1 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Nothing here
                  </div>
                ) : (
                  column.map((deal) => (
                    <article
                      key={deal.id}
                      draggable
                      onDragStart={(event) => {
                        dragging.current = deal.id;
                        event.dataTransfer.setData("text/plain", deal.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      className="cursor-grab rounded-lg border border-border bg-card p-3 shadow-sm"
                    >
                      <Link href={`/deals/${deal.id}`} className="block truncate text-sm font-medium hover:underline">
                        {deal.name}
                      </Link>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{deal.companyName}</div>
                      <div className="mt-2 text-xs font-medium tabular-nums">{formatMoney(deal.amountCents, deal.currency)}</div>
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
