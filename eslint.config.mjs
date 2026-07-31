import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    ".next-portable/**",
    ".next-e2e/**",
    "release/**",
    ".release/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "vendor/**",
    "next-env.d.ts",
  ]),
]);
