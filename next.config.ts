import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
