import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` otherwise rewrites the tracked AGENTS.md with a generated block.
  agentRules: false,
  // The dev tools badge sits on the sidebar and covers the signed-in user block.
  devIndicators: false,
  // Playwright and local curls use 127.0.0.1. Next serves dev assets to localhost
  // unless this origin is listed.
  allowedDevOrigins: ["127.0.0.1"],
  // Cache Components stay off. Tenant pages are request-scoped, and a shared
  // static cache must not be able to retain one organization's records.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
