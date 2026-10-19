import { requireSession } from "@/lib/auth/current";
import { listCompanies } from "@/lib/crm/companies";
import { getContact } from "@/lib/crm/contacts";
import { listActiveOwners } from "@/lib/crm/users";
import { orNotFound } from "@/lib/or-not-found";
import { ContactForm } from "@/components/contact-form";

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const [contact, owners, companies] = await orNotFound(Promise.all([
      getContact(session, id),
      listActiveOwners(session),
      listCompanies(session, { q: "", ownerId: "", stageId: "", companyId: "", page: 1, pageSize: 100 }),
    ]));
  return (
      <section>
        <div className="page-head">
          <h1>
            Edit {contact.firstName} {contact.lastName}
          </h1>
        </div>
        <ContactForm owners={owners} companies={companies.items} initial={contact} />
      </section>
    );
}
