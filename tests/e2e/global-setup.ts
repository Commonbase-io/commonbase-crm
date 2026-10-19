import { execSync } from "node:child_process";

export default function globalSetup() {
  execSync("npx prisma db seed", { stdio: "inherit" });
}
