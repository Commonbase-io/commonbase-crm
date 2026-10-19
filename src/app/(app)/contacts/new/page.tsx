import { requireSession } from "@/lib/auth/current";
import { listCompanies } from "@/lib/crm/companies";
import { listActiveOwners } from "@/lib/crm/users";
import { ContactForm } from "@/components/contact-form";

export default async function NewContactPage() {
  const session = await requireSession();
  const [owners, companies] = await Promise.all([
    listActiveOwners(session),
    listCompanies(session, { q: "", ownerId: "", stageId: "", companyId: "", page: 1, pageSize: 100 }),
  ]);
  return (
    <section>
      <div className="page-head">
        <h1>New contact</h1>
      </div>
      <ContactForm owners={owners} companies={companies.items} initial={{ ownerId: session.id }} />
    </section>
  );
}
