import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts"],
    // The DB tests start a PGlite (Postgres in WebAssembly) and run the migrations inside a test or hook. When all files
    // start at once on a busy machine (a dev server compiling next to it), that cold start alone can pass the 5 s default.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
