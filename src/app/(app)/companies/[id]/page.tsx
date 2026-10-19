import Link from "next/link";
import { requireSession } from "@/lib/auth/current";
import { getCompany } from "@/lib/crm/companies";
import { orNotFound } from "@/lib/or-not-found";
import { formatMoney } from "@/lib/money";
import { ArchiveButton } from "@/components/archive-button";
import { NotePanel } from "@/components/note-panel";

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const company = await orNotFound(getCompany(session, id));
  {
    const address = [company.addressLine1, company.addressLine2, company.city, company.region, company.postalCode, company.country]
      .filter(Boolean)
      .join(", ");
    return (
      <section className="detail">
        <div className="page-head">
          <h1>{company.name}</h1>
          <div className="row">
            <Link className="button secondary" href={`/companies/${company.id}/edit`}>
              Edit
            </Link>
            <ArchiveButton path={`/api/companies/${company.id}`} next="/companies" />
          </div>
        </div>
        <div className="detail-grid">
          <section>
            <dl className="meta">
              <dt>Domain</dt>
              <dd>{company.domain || "—"}</dd>
              <dt>Phone</dt>
              <dd>{company.phone || "—"}</dd>
              <dt>Address</dt>
              <dd>{address || "—"}</dd>
              <dt>Owner</dt>
              <dd>{company.owner.name}</dd>
              <dt>Profile notes</dt>
              <dd>{company.notes || "—"}</dd>
            </dl>
            <h2>Contacts</h2>
            <div className="related">
              {company.contacts.map((contact) => (
                <Link key={contact.id} href={`/contacts/${contact.id}`}>
                  {contact.firstName} {contact.lastName}
                  {contact.title ? ` · ${contact.title}` : ""}
                </Link>
              ))}
              {company.contacts.length === 0 ? <p className="muted">No contacts yet.</p> : null}
            </div>
            <h2>Deals</h2>
            <div className="related">
              {company.deals.map((deal) => (
                <Link key={deal.id} href={`/deals/${deal.id}`}>
                  {deal.name} · {formatMoney(deal.amountCents, deal.currency)} · {deal.stage.name}
                </Link>
              ))}
              {company.deals.length === 0 ? <p className="muted">No deals yet.</p> : null}
            </div>
          </section>
          <NotePanel notes={company.activity} parent={{ companyId: company.id }} />
        </div>
      </section>
    );
  }
}
