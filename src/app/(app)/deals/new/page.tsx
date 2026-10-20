import { requireSession } from "@/lib/auth/current";
import { listCompanies } from "@/lib/crm/companies";
import { listContacts } from "@/lib/crm/contacts";
import { getPipeline } from "@/lib/crm/pipelines";
import { listActiveOwners } from "@/lib/crm/users";
import { DealWizard } from "@/components/deal-wizard";

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const requested = typeof params.companyId === "string" ? params.companyId : "";
  const empty = { q: "", ownerId: "", stageId: "", companyId: "", page: 1, pageSize: 100 };
  const [owners, companies, contacts, pipeline] = await Promise.all([
    listActiveOwners(session),
    listCompanies(session, empty),
    listContacts(session, empty),
    getPipeline(session),
  ]);
  const initialCompanyId = companies.items.some((company) => company.id === requested) ? requested : undefined;
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>New deal</h1>
          <p className="lede">Pick the company, then someone who works there, then the deal. Nothing is saved until the last step.</p>
        </div>
      </div>
      <DealWizard
        owners={owners}
        companies={companies.items}
        stages={pipeline.stages}
        contacts={contacts.items.map((contact) => ({
          id: contact.id,
          name: `${contact.firstName} ${contact.lastName}`,
          companyId: contact.companyId,
        }))}
        initialOwnerId={session.id}
        initialCompanyId={initialCompanyId}
      />
    </section>
  );
}
