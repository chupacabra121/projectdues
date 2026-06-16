import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests for the pure money engine (forecast / cashflow / memberDues).
 * Node environment — no DOM, no Next runtime. The `@/` alias mirrors the app's
 * tsconfig path so tests import modules exactly as the app does.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
