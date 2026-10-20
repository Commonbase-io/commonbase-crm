import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  // `server-only` throws outside a React Server Component bundle; tests run in Node.
  "server-only": path.resolve(import.meta.dirname, "tests/support/server-only.ts"),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "tests/integrations/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          environment: "node",
          include: ["tests/tenant-isolation/**/*.test.ts"],
          // One throwaway database per run; files share it, so run them serially.
          fileParallelism: false,
          globalSetup: ["tests/support/db-global-setup.ts"],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
