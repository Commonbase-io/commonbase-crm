"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface CreateField {
  name: string;
  label: string;
  type?: "text" | "email";
  required?: boolean;
}

/**
 * Same chrome as MyCrew's QuickAdd: a plus button, a dialog, Cancel and Create.
 * The CRM wizard holds the values and writes them with the deal, so this does
 * not call the API on its own.
 */
export function CreateDialog({
  label,
  title,
  fields,
  onCreate,
}: {
  label: string;
  title: string;
  fields: CreateField[];
  onCreate: (values: Record<string, string>) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const missing = fields.find((field) => field.required && !(values[field.name] ?? "").trim());
    if (missing) {
      setError(`${missing.label} is required`);
      return;
    }
    onCreate(values);
    setValues({});
    setError(null);
    setOpen(false);
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-3">
            {fields.map((field) => (
              <div key={field.name} className="flex flex-col gap-1">
                <Label htmlFor={field.name}>
                  {field.label}
                  {field.required ? <span className="text-destructive"> *</span> : null}
                </Label>
                <Input
                  id={field.name}
                  type={field.type ?? "text"}
                  required={field.required}
                  value={values[field.name] ?? ""}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                />
              </div>
            ))}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
