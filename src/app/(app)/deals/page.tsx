import Link from "next/link";
import { requireSession } from "@/lib/auth/current";
import { listCompanies } from "@/lib/crm/companies";
import { listDeals } from "@/lib/crm/deals";
import { getPipeline } from "@/lib/crm/pipelines";
import { listActiveOwners } from "@/lib/crm/users";
import { EmptyState } from "@/components/empty-state";
import { Filters, Pager } from "@/components/list";
import { formatMoney } from "@/lib/money";
import { parseListQuery } from "@/lib/validation";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const query = parseListQuery(await searchParams);
  const empty = { q: "", ownerId: "", stageId: "", companyId: "", page: 1, pageSize: 100 };
  const filtered = Boolean(query.q || query.ownerId || query.stageId || query.companyId);
  const [result, owners, companies, pipeline] = await Promise.all([
    listDeals(session, query),
    listActiveOwners(session),
    listCompanies(session, empty),
    getPipeline(session),
  ]);
  return (
    <section>
      <div className="page-head">
        <h1>Deals</h1>
        <Link className="button" href="/deals/new">
          New deal
        </Link>
      </div>
      <Filters action="/deals" query={query} owners={owners} companies={companies.items} stages={pipeline.stages} />
      {result.items.length === 0 && !filtered ? (
        <EmptyState
          title="No deals yet"
          body="A deal needs a company and a contact at that company. The wizard collects all three before anything is saved."
          action={{ href: "/deals/new", label: "New deal" }}
        />
      ) : (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Amount</th>
              <th>Stage</th>
              <th>Company</th>
              <th>Owner</th>
            </tr>
          </thead>
          <tbody>
            {result.items.length === 0 ? (
              <tr>
                <td colSpan={5}>No deals match.</td>
              </tr>
            ) : null}
            {result.items.map((deal) => (
              <tr key={deal.id}>
                <td>
                  <Link href={`/deals/${deal.id}`}>{deal.name}</Link>
                </td>
                <td>{formatMoney(deal.amountCents, deal.currency)}</td>
                <td>{deal.stage.name}</td>
                <td>{deal.company.name}</td>
                <td>{deal.owner.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <Pager path="/deals" query={query} total={result.total} />
    </section>
  );
}
