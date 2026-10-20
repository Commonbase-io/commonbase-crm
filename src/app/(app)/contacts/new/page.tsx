import { requireSession } from "@/lib/auth/current";
import { listCompanies } from "@/lib/crm/companies";
import { ContactWizard } from "@/components/contact-wizard";

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const requested = typeof params.companyId === "string" ? params.companyId : "";
  const companies = await listCompanies(session, { q: "", ownerId: "", stageId: "", companyId: "", page: 1, pageSize: 100 });
  const initialCompanyId = companies.items.some((company) => company.id === requested) ? requested : undefined;
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>New contact</h1>
          <p className="lede">A contact always belongs to a company. Pick one, or create it here.</p>
        </div>
      </div>
      <ContactWizard companies={companies.items} initialCompanyId={initialCompanyId} />
    </section>
  );
}
