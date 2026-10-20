import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { signIn } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Commonbase Sales OS</p>
        <form action={signIn} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error === "link" ? "That link is invalid or has expired. Ask your admin to resend it." : "That email and password did not match."}
            </p>
          ) : null}
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}
