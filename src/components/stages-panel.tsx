"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { api } from "@/lib/api-client";
import { Field, FormError, useSubmit } from "@/components/form-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Stage = { id: string; name: string; position: number; outcome: "OPEN" | "WON" | "LOST" };

export function StagesPanel({ stages }: { stages: Stage[] }) {
  const router = useRouter();
  const { fieldErrors, formError, pending, ready, submit } = useSubmit();
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Stages</CardTitle>
        <Button type="button" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Add stage
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New stage</DialogTitle>
            </DialogHeader>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = Object.fromEntries(new FormData(form).entries());
                void submit(async () => {
                  await api("/api/stages", { method: "POST", body: data });
                  form.reset();
                  setOpen(false);
                  router.refresh();
                });
              }}
            >
              <Field label="Stage name" name="name" error={fieldErrors.name}>
                <Input id="name" name="name" required />
              </Field>
              <Field label="Outcome" name="outcome" error={fieldErrors.outcome}>
                <Select id="outcome" name="outcome" defaultValue="OPEN">
                  <option value="OPEN">Open</option>
                  <option value="WON">Won</option>
                  <option value="LOST">Lost</option>
                </Select>
              </Field>
              <FormError message={formError} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!ready || pending}>
                  {pending ? "Saving…" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <FormError message={open ? null : formError} />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {stages.map((stage, index) => (
              <TableRow key={stage.id}>
                <TableCell>{stage.position + 1}</TableCell>
                <TableCell>
                  <form
                    className="flex flex-wrap items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const name = new FormData(event.currentTarget).get("name");
                      void submit(async () => {
                        await api(`/api/stages/${stage.id}`, { method: "PATCH", body: { name } });
                        router.refresh();
                      });
                    }}
                  >
                    <Input name="name" defaultValue={stage.name} aria-label={`Name for ${stage.name}`} className="h-10 max-w-xs" />
                    <Button variant="outline" size="sm" type="submit">
                      Rename
                    </Button>
                  </form>
                </TableCell>
                <TableCell>
                  <Badge variant={stage.outcome === "WON" ? "success" : stage.outcome === "LOST" ? "destructive" : "secondary"}>
                    {stage.outcome === "OPEN" ? "Open" : stage.outcome === "WON" ? "Won" : "Lost"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
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
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => {
                        void submit(async () => {
                          await api(`/api/stages/${stage.id}`, { method: "PATCH", body: { archived: true } });
                          router.refresh();
                        });
                      }}
                    >
                      Archive
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
