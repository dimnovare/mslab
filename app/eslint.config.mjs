import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build output of the retired Cloudflare Worker (wrangler / OpenNext), if a checkout still has it:
    ".open-next/**",
    ".wrangler/**",
    // The static design-review hub and its comment widget (public/guide, public/p, public/feedback.js: plain browser scripts):
    "public/**",
  ]),
]);

export default eslintConfig;
