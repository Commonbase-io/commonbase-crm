import { execSync } from "node:child_process";

// E2E tests save records, so start every run from the seed. Set
// E2E_SKIP_RESET=1 to reuse the current database (e.g. while iterating).
export default function globalSetup() {
  if (process.env.E2E_SKIP_RESET === "1") return;
  execSync("npx supabase db reset", { stdio: "inherit" });
}
