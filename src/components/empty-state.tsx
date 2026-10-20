import Link from "next/link";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{body}</p>
      {action ? (
        <Link className="button" href={action.href}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
