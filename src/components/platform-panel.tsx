"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Field, FormError, useSubmit } from "@/components/form-state";

type Org = {
  orgId: string;
  name: string;
  slug: string;
  isPlatform: boolean;
  createdAt: string;
  adminEmail: string | null;
  adminName: string | null;
  userCount: number;
};

export function PlatformPanel({ orgs }: { orgs: Org[] }) {
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
            await api("/api/platform/orgs", { method: "POST", body: data });
            event.currentTarget.reset();
            router.refresh();
          });
        }}
      >
        <h2 className="wide">New client organization</h2>
        <Field label="Organization" name="name" error={fieldErrors.name}>
          <input id="name" name="name" required />
        </Field>
        <Field label="Slug" name="slug" error={fieldErrors.slug}>
          <input id="slug" name="slug" required placeholder="northwind" />
        </Field>
        <Field label="First admin name" name="adminName" error={fieldErrors.adminName}>
          <input id="adminName" name="adminName" required />
        </Field>
        <Field label="First admin email" name="adminEmail" error={fieldErrors.adminEmail}>
          <input id="adminEmail" name="adminEmail" type="email" required />
        </Field>
        <Field label="Temporary password" name="password" error={fieldErrors.password} wide>
          <input id="password" name="password" required />
        </Field>
        <div className="wide">
          <FormError message={formError} />
          <button className="button" type="submit" disabled={!ready || pending}>
            Create organization
          </button>
        </div>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Organization</th>
              <th>Slug</th>
              <th>First admin</th>
              <th>Users</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.orgId}>
                <td>
                  {org.name} {org.isPlatform ? <span className="badge">Platform</span> : null}
                </td>
                <td>{org.slug}</td>
                <td>
                  {org.adminName} · {org.adminEmail}
                </td>
                <td>{org.userCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
