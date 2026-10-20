import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="mt-1 text-sm text-muted-foreground">This page or workspace doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/app" className="mt-4 inline-block text-sm underline">Back to your workspaces</Link>
    </main>
  );
}
