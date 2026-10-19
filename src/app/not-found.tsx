import Link from "next/link";

export default function NotFound() {
  return (
    <div className="auth-screen">
      <section className="auth-card">
        <h1>Not found</h1>
        <p>That page is not available.</p>
        <Link className="button" href="/companies">
          Back to companies
        </Link>
      </section>
    </div>
  );
}
