"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Field, FormError, useSubmit } from "@/components/form-state";

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
  return (
    <div>
      <form
        className="form two card"
        style={{ padding: 18, marginBottom: 16 }}
        onSubmit={(event) => {
          event.preventDefault();
          const data = Object.fromEntries(new FormData(event.currentTarget).entries());
          void submit(async () => {
            await api("/api/users", { method: "POST", body: data });
            event.currentTarget.reset();
            router.refresh();
          });
        }}
      >
        <h2 className="wide">Add a user</h2>
        <Field label="Name" name="name" error={fieldErrors.name}>
          <input id="name" name="name" required />
        </Field>
        <Field label="Email" name="email" error={fieldErrors.email}>
          <input id="email" name="email" type="email" required />
        </Field>
        <Field label="Role" name="role" error={fieldErrors.role}>
          <select id="role" name="role" defaultValue="MEMBER">
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
          </select>
        </Field>
        <Field label="Temporary password" name="password" error={fieldErrors.password}>
          <input id="password" name="password" type="text" required />
        </Field>
        <div className="wide">
          <FormError message={formError} />
          <button className="button" disabled={!ready || pending} type="submit">
            Add user
          </button>
        </div>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>{user.deactivatedAt ? "Deactivated" : user.mustChangePassword ? "Temporary password" : "Active"}</td>
                <td>
                  {user.deactivatedAt ? null : (
                    <button
                      className="button secondary"
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
                    </button>
                  )}
                  {user.deactivatedAt ? null : (
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => {
                        void submit(async () => {
                          await api(`/api/users/${user.id}`, { method: "PATCH", body: { deactivated: true } });
                          router.refresh();
                        });
                      }}
                    >
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
