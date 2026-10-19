import Link from "next/link";
import { requireSession } from "@/lib/auth/current";
import { getContact } from "@/lib/crm/contacts";
import { orNotFound } from "@/lib/or-not-found";
import { formatMoney } from "@/lib/money";
import { ArchiveButton } from "@/components/archive-button";
import { NotePanel } from "@/components/note-panel";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const contact = await orNotFound(getContact(session, id));
  {
    return (
      <section className="detail">
        <div className="page-head">
          <h1>
            {contact.firstName} {contact.lastName}
          </h1>
          <div className="row">
            <Link className="button secondary" href={`/contacts/${contact.id}/edit`}>
              Edit
            </Link>
            <ArchiveButton path={`/api/contacts/${contact.id}`} next="/contacts" />
          </div>
        </div>
        <div className="detail-grid">
          <section>
            <dl className="meta">
              <dt>Email</dt>
              <dd>{contact.email || "—"}</dd>
              <dt>Phone</dt>
              <dd>{contact.phone || "—"}</dd>
              <dt>Title</dt>
              <dd>{contact.title || "—"}</dd>
              <dt>Company</dt>
              <dd>{contact.company ? <Link href={`/companies/${contact.company.id}`}>{contact.company.name}</Link> : "—"}</dd>
              <dt>Owner</dt>
              <dd>{contact.owner.name}</dd>
            </dl>
            <h2>Deals</h2>
            <div className="related">
              {contact.deals.map((deal) => (
                <Link key={deal.id} href={`/deals/${deal.id}`}>
                  {deal.name} · {formatMoney(deal.amountCents, deal.currency)}
                </Link>
              ))}
              {contact.deals.length === 0 ? <p className="muted">No deals yet.</p> : null}
            </div>
          </section>
          <NotePanel notes={contact.activity} parent={{ contactId: contact.id }} />
        </div>
      </section>
    );
  }
}
