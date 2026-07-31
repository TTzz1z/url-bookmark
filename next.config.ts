import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": [
      "./drizzle/**/*",
      "./node_modules/css-tree/**/*",
      "./node_modules/mdn-data/**/*",
    ],
  },
  outputFileTracingExcludes: {
    "/*": [
      "./.git/**/*",
      "./.next/**/*",
      "./.next-e2e/**/*",
      "./.release/**/*",
      "./data/**/*",
      "./release/**/*",
      "./.env*",
      "./*.log",
    ],
  },
  serverExternalPackages: [
    "better-sqlite3",
    "canvas",
    "@napi-rs/canvas",
    "vega",
    "vega-lite",
    "vega-canvas",
  ],
  poweredByHeader: false,
};

export default nextConfig;
