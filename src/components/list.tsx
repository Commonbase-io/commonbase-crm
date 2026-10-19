import Link from "next/link";
import type { ListQuery } from "@/lib/validation";

export function Filters({
  action,
  query,
  owners,
  stages,
  companies,
}: {
  action: string;
  query: ListQuery;
  owners: Array<{ id: string; name: string }>;
  stages?: Array<{ id: string; name: string }>;
  companies?: Array<{ id: string; name: string }>;
}) {
  return (
    <form className="filters" action={action} method="get">
      <input name="q" defaultValue={query.q} placeholder="Search" aria-label="Search" />
      <select name="ownerId" defaultValue={query.ownerId} aria-label="Owner">
        <option value="">All owners</option>
        {owners.map((owner) => (
          <option key={owner.id} value={owner.id}>
            {owner.name}
          </option>
        ))}
      </select>
      {stages ? (
        <select name="stageId" defaultValue={query.stageId} aria-label="Stage">
          <option value="">All stages</option>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>
      ) : null}
      {companies ? (
        <select name="companyId" defaultValue={query.companyId} aria-label="Company">
          <option value="">All companies</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      ) : null}
      <button className="button secondary" type="submit">
        Apply
      </button>
    </form>
  );
}

export function Pager({ path, query, total }: { path: string; query: ListQuery; total: number }) {
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  const href = (page: number) => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.ownerId) params.set("ownerId", query.ownerId);
    if (query.stageId) params.set("stageId", query.stageId);
    if (query.companyId) params.set("companyId", query.companyId);
    params.set("page", String(page));
    return `${path}?${params.toString()}`;
  };
  return (
    <div className="pager">
      {query.page > 1 ? <Link href={href(query.page - 1)}>Previous</Link> : <span className="muted">Previous</span>}
      <span>
        Page {query.page} of {pages} · {total} records
      </span>
      {query.page < pages ? <Link href={href(query.page + 1)}>Next</Link> : <span className="muted">Next</span>}
    </div>
  );
}
