import { requireSession } from "@/lib/auth/current";
import { listActiveOwners } from "@/lib/crm/users";
import { CompanyForm } from "@/components/company-form";

export default async function NewCompanyPage() {
  const session = await requireSession();
  const owners = await listActiveOwners(session);
  return (
    <section>
      <div className="page-head">
        <h1>New company</h1>
      </div>
      <CompanyForm owners={owners} initial={{ ownerId: session.id }} />
    </section>
  );
}
