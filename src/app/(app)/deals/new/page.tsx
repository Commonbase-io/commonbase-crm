import { requireSession } from "@/lib/auth/current";
import { listCompanies } from "@/lib/crm/companies";
import { listContacts } from "@/lib/crm/contacts";
import { getPipeline } from "@/lib/crm/pipelines";
import { listActiveOwners } from "@/lib/crm/users";
import { DealForm } from "@/components/deal-form";

export default async function NewDealPage() {
  const session = await requireSession();
  const empty = { q: "", ownerId: "", stageId: "", companyId: "", page: 1, pageSize: 100 };
  const [owners, companies, contacts, pipeline] = await Promise.all([
    listActiveOwners(session),
    listCompanies(session, empty),
    listContacts(session, empty),
    getPipeline(session),
  ]);
  return (
    <section>
      <div className="page-head">
        <h1>New deal</h1>
      </div>
      <DealForm
        owners={owners}
        companies={companies.items}
        stages={pipeline.stages}
        contacts={contacts.items.map((contact) => ({ id: contact.id, name: `${contact.firstName} ${contact.lastName}` }))}
        initial={{ ownerId: session.id, currency: "USD" }}
      />
    </section>
  );
}
