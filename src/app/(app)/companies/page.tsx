import Link from "next/link";
import { requireSession } from "@/lib/auth/current";
import { listCompanies } from "@/lib/crm/companies";
import { listActiveOwners } from "@/lib/crm/users";
import { Filters, Pager } from "@/components/list";
import { parseListQuery } from "@/lib/validation";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const query = parseListQuery(await searchParams);
  const [result, owners] = await Promise.all([listCompanies(session, query), listActiveOwners(session)]);
  return (
    <section data-testid="companies-list">
      <div className="page-head">
        <h1>Companies</h1>
        <Link className="button" href="/companies/new">
          New company
        </Link>
      </div>
      <Filters action="/companies" query={query} owners={owners} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Domain</th>
              <th>Phone</th>
              <th>Owner</th>
            </tr>
          </thead>
          <tbody>
            {result.items.length === 0 ? (
              <tr>
                <td colSpan={4}>No companies match.</td>
              </tr>
            ) : null}
            {result.items.map((company) => (
              <tr key={company.id}>
                <td>
                  <Link href={`/companies/${company.id}`}>{company.name}</Link>
                </td>
                <td>{company.domain}</td>
                <td>{company.phone}</td>
                <td>{company.owner.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager path="/companies" query={query} total={result.total} />
    </section>
  );
}
