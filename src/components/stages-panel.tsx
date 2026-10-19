"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Field, FormError, useSubmit } from "@/components/form-state";

type Stage = { id: string; name: string; position: number; outcome: "OPEN" | "WON" | "LOST" };

export function StagesPanel({ stages }: { stages: Stage[] }) {
  const router = useRouter();
  const { fieldErrors, formError, pending, ready, submit } = useSubmit();
  return (
    <div>
      <form
        className="form two card"
        style={{ padding: 18, marginBottom: 16 }}
        onSubmit={(event) => {
          event.preventDefault();
          const data = Object.fromEntries(new FormData(event.currentTarget).entries());
          void submit(async () => {
            await api("/api/stages", { method: "POST", body: data });
            event.currentTarget.reset();
            router.refresh();
          });
        }}
      >
        <Field label="Stage name" name="name" error={fieldErrors.name}>
          <input id="name" name="name" required />
        </Field>
        <Field label="Outcome" name="outcome" error={fieldErrors.outcome}>
          <select id="outcome" name="outcome" defaultValue="OPEN">
            <option value="OPEN">Open</option>
            <option value="WON">Won</option>
            <option value="LOST">Lost</option>
          </select>
        </Field>
        <div className="wide">
          <button className="button" type="submit" disabled={!ready || pending}>
            Add stage
          </button>
        </div>
      </form>
      <FormError message={formError} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Name</th>
              <th>Outcome</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage, index) => (
              <tr key={stage.id}>
                <td>{stage.position + 1}</td>
                <td>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const name = new FormData(event.currentTarget).get("name");
                      void submit(async () => {
                        await api(`/api/stages/${stage.id}`, { method: "PATCH", body: { name } });
                        router.refresh();
                      });
                    }}
                  >
                    <input name="name" defaultValue={stage.name} aria-label={`Name for ${stage.name}`} />
                    <button className="button secondary" type="submit">
                      Rename
                    </button>
                  </form>
                </td>
                <td>{stage.outcome}</td>
                <td>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={index === 0}
                    onClick={() => {
                      const ids = stages.map((item) => item.id);
                      const swap = ids[index - 1];
                      if (!swap) return;
                      ids[index - 1] = stage.id;
                      ids[index] = swap;
                      void submit(async () => {
                        await api("/api/stages/reorder", { method: "POST", body: { stageIds: ids } });
                        router.refresh();
                      });
                    }}
                  >
                    Up
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => {
                      void submit(async () => {
                        await api(`/api/stages/${stage.id}`, { method: "PATCH", body: { archived: true } });
                        router.refresh();
                      });
                    }}
                  >
                    Archive
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
