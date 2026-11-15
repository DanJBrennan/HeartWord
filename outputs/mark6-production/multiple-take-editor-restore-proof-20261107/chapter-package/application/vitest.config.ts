import { defineConfig } from "vitest/config";

// Vitest otherwise inherits vite.config.ts's `root: "src/web"` (the
// frontend's dev-server root) and finds zero test files anywhere else in
// the repo. This config overrides just the root back to the repo root so
// `npm test` covers server/pipeline code too, not only the frontend.
export default defineConfig({
  root: ".",
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"]
  }
});
