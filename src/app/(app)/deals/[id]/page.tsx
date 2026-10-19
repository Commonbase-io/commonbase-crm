import Link from "next/link";
import { requireSession } from "@/lib/auth/current";
import { getDeal } from "@/lib/crm/deals";
import { orNotFound } from "@/lib/or-not-found";
import { formatMoney } from "@/lib/money";
import { ArchiveButton } from "@/components/archive-button";
import { NotePanel } from "@/components/note-panel";

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const deal = await orNotFound(getDeal(session, id));
  {
    return (
      <section className="detail" data-testid="deal-detail">
        <div className="page-head">
          <h1>{deal.name}</h1>
          <div className="row">
            <Link className="button secondary" href={`/deals/${deal.id}/edit`}>
              Edit
            </Link>
            <ArchiveButton path={`/api/deals/${deal.id}`} next="/deals" />
          </div>
        </div>
        <div className="detail-grid">
          <section>
            <dl className="meta">
              <dt>Amount</dt>
              <dd>{formatMoney(deal.amountCents, deal.currency)}</dd>
              <dt>Stage</dt>
              <dd>{deal.stage.name}</dd>
              <dt>Status</dt>
              <dd>
                <span className={`badge ${deal.status === "WON" ? "won" : deal.status === "LOST" ? "lost" : ""}`}>{deal.status}</span>
              </dd>
              <dt>Company</dt>
              <dd>{deal.company ? <Link href={`/companies/${deal.company.id}`}>{deal.company.name}</Link> : "—"}</dd>
              <dt>Owner</dt>
              <dd>{deal.owner.name}</dd>
              <dt>Expected close</dt>
              <dd>{deal.expectedCloseDate || "—"}</dd>
            </dl>
            <h2>Contacts</h2>
            <div className="related">
              {deal.contacts.map((contact) => (
                <Link key={contact.id} href={`/contacts/${contact.id}`}>
                  {contact.firstName} {contact.lastName}
                </Link>
              ))}
              {deal.contacts.length === 0 ? <p className="muted">No contacts linked.</p> : null}
            </div>
          </section>
          <NotePanel notes={deal.activity} parent={{ dealId: deal.id }} />
        </div>
      </section>
    );
  }
}
