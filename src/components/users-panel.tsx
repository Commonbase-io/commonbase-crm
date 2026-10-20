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

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MEMBER";
  deactivatedAt: string | null;
  mustChangePassword: boolean;
};

export function UsersPanel({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const { fieldErrors, formError, pending, ready, submit } = useSubmit();
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Users</CardTitle>
        <Button type="button" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Add user
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New user</DialogTitle>
            </DialogHeader>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = Object.fromEntries(new FormData(event.currentTarget).entries());
                void submit(async () => {
                  await api("/api/users", { method: "POST", body: data });
                  setOpen(false);
                  router.refresh();
                });
              }}
            >
              <Field label="Name" name="name" error={fieldErrors.name}>
                <Input id="name" name="name" required />
              </Field>
              <Field label="Email" name="email" error={fieldErrors.email}>
                <Input id="email" name="email" type="email" required />
              </Field>
              <Field label="Role" name="role" error={fieldErrors.role}>
                <Select id="role" name="role" defaultValue="MEMBER">
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </Select>
              </Field>
              <Field label="Temporary password" name="password" error={fieldErrors.password}>
                <Input id="password" name="password" type="text" required />
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
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.role === "ADMIN" ? "Admin" : "Member"}</TableCell>
                <TableCell>
                  {user.deactivatedAt ? (
                    <Badge variant="secondary">Deactivated</Badge>
                  ) : user.mustChangePassword ? (
                    <Badge variant="warning">Temporary password</Badge>
                  ) : (
                    <Badge variant="success">Active</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {user.deactivatedAt ? null : (
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => {
                          void submit(async () => {
                            await api(`/api/users/${user.id}`, {
                              method: "PATCH",
                              body: { role: user.role === "ADMIN" ? "MEMBER" : "ADMIN" },
                            });
                            router.refresh();
                          });
                        }}
                      >
                        Make {user.role === "ADMIN" ? "member" : "admin"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => {
                          void submit(async () => {
                            await api(`/api/users/${user.id}`, { method: "PATCH", body: { deactivated: true } });
                            router.refresh();
                          });
                        }}
                      >
                        Deactivate
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
