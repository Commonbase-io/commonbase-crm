import Link from "next/link";
import { requireSession } from "@/lib/auth/current";
import { listCompanies } from "@/lib/crm/companies";
import { listContacts } from "@/lib/crm/contacts";
import { listActiveOwners } from "@/lib/crm/users";
import { EmptyState } from "@/components/empty-state";
import { Filters, Pager } from "@/components/list";
import { parseListQuery } from "@/lib/validation";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const query = parseListQuery(await searchParams);
  const filtered = Boolean(query.q || query.ownerId || query.companyId);
  const [result, owners, companies] = await Promise.all([
    listContacts(session, query),
    listActiveOwners(session),
    listCompanies(session, { ...query, q: "", ownerId: "", companyId: "", stageId: "", page: 1, pageSize: 100 }),
  ]);
  return (
    <section>
      <div className="page-head">
        <h1>Contacts</h1>
        <Link className="button" href="/contacts/new">
          New contact
        </Link>
      </div>
      <Filters action="/contacts" query={query} owners={owners} companies={companies.items} />
      {result.items.length === 0 && !filtered ? (
        <EmptyState
          title="No contacts yet"
          body="Every contact belongs to a company. Create the company first, or do both in the contact wizard."
          action={{ href: "/contacts/new", label: "New contact" }}
        />
      ) : (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Company</th>
              <th>Owner</th>
            </tr>
          </thead>
          <tbody>
            {result.items.length === 0 ? (
              <tr>
                <td colSpan={4}>No contacts match.</td>
              </tr>
            ) : null}
            {result.items.map((contact) => (
              <tr key={contact.id}>
                <td>
                  <Link href={`/contacts/${contact.id}`}>
                    {contact.firstName} {contact.lastName}
                  </Link>
                </td>
                <td>{contact.email}</td>
                <td>{contact.company.name}</td>
                <td>{contact.owner.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <Pager path="/contacts" query={query} total={result.total} />
    </section>
  );
}
