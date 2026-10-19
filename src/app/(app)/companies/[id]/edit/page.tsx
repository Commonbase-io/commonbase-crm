import { requireSession } from "@/lib/auth/current";
import { getCompany } from "@/lib/crm/companies";
import { listActiveOwners } from "@/lib/crm/users";
import { orNotFound } from "@/lib/or-not-found";
import { CompanyForm } from "@/components/company-form";

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const [company, owners] = await orNotFound(Promise.all([getCompany(session, id), listActiveOwners(session)]));
  {
    return (
      <section>
        <div className="page-head">
          <h1>Edit {company.name}</h1>
        </div>
        <CompanyForm owners={owners} initial={company} />
      </section>
    );
  }
}
