import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Regression suite. Runs against the domain layer and the rendered React
 * tree — no dev server, so it is safe to run beside a build (dev and prod
 * servers clobber each other's .next, the test runner touches neither).
 */
export default defineConfig({
  plugins: [react()],
  /* tsconfig keeps jsx: "preserve" for Next; tests need it compiled. */
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
