import { requireSession } from "@/lib/auth/current";
import { listCompanies } from "@/lib/crm/companies";
import { listContacts } from "@/lib/crm/contacts";
import { getDeal } from "@/lib/crm/deals";
import { listActiveOwners } from "@/lib/crm/users";
import { orNotFound } from "@/lib/or-not-found";
import { DealForm } from "@/components/deal-form";

export default async function EditDealPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const empty = { q: "", ownerId: "", stageId: "", companyId: "", page: 1, pageSize: 100 };
  const [deal, owners, companies, contacts] = await orNotFound(Promise.all([
      getDeal(session, id),
      listActiveOwners(session),
      listCompanies(session, empty),
      listContacts(session, empty),
    ]));
  return (
      <section>
        <div className="page-head">
          <h1>Edit {deal.name}</h1>
        </div>
        <p className="muted">Move the stage from the pipeline board. Saving here keeps the current stage.</p>
        <DealForm
          owners={owners}
          companies={companies.items}
          contacts={contacts.items.map((contact) => ({
            id: contact.id,
            name: `${contact.firstName} ${contact.lastName}`,
            companyId: contact.companyId,
          }))}
          initial={{
            id: deal.id,
            name: deal.name,
            amountCents: deal.amountCents,
            currency: deal.currency,
            companyId: deal.companyId,
            ownerId: deal.ownerId,
            expectedCloseDate: deal.expectedCloseDate,
            contactIds: deal.contacts.map((contact) => contact.id),
          }}
        />
      </section>
    );
}
