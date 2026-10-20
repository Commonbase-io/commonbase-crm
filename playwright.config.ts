import { defineConfig, devices } from "@playwright/test";

// Critical end-to-end flows only. Needs the local Supabase stack running and
// seeded (`npm run db:start`), and the app built (`npm run build`). The
// database is reset to the seed before each run (see global-setup.ts).
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next start -p ${port}`,
    port,
    reuseExistingServer: true,
  },
});
