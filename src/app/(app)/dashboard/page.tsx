import Link from "next/link";
import { requireSession } from "@/lib/auth/current";
import { getDashboard } from "@/lib/crm/dashboard";
import { EmptyState } from "@/components/empty-state";
import { formatMoney } from "@/lib/money";

export default async function DashboardPage() {
  const session = await requireSession();
  const dashboard = await getDashboard(session);
  return (
    <section data-testid="dashboard">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="lede">{session.orgName}</p>
        </div>
        <Link className="button" href="/deals/new">
          New deal
        </Link>
      </div>
      <div className="stat-grid">
        <Link className="stat" href="/companies">
          <span>Companies</span>
          <strong>{dashboard.companies}</strong>
        </Link>
        <Link className="stat" href="/contacts">
          <span>Contacts</span>
          <strong>{dashboard.contacts}</strong>
        </Link>
        <Link className="stat" href="/pipeline">
          <span>Open deals</span>
          <strong>{dashboard.openDeals}</strong>
        </Link>
      </div>
      {dashboard.recent.length === 0 ? (
        <EmptyState
          title="No deals yet"
          body="A deal belongs to a company and at least one contact there. The wizard walks through all three."
          action={{ href: "/deals/new", label: "New deal" }}
        />
      ) : (
        <div className="surface-card overflow-hidden p-6">
          <h2 className="mb-3 text-base font-semibold">Recent deals</h2>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Stage</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recent.map((deal) => (
                  <tr key={deal.id}>
                    <td>
                      <Link href={`/deals/${deal.id}`}>{deal.name}</Link>
                    </td>
                    <td>{deal.company.name}</td>
                    <td>{deal.stage.name}</td>
                    <td>{formatMoney(deal.amountCents, deal.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
