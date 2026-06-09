import { defineConfig } from "vitest/config";

// E2E tests spawn the real app as an OS process (real BunDriver, real stdin/
// stdout). They are slower and have no meaningful line coverage of `src`, so
// they run via their own config — separate from the unit/integration suite —
// and are excluded from the coverage gate.
export default defineConfig({
  test: {
    globals: true,
    include: ["e2e/**/*.e2e.test.ts"],
    exclude: ["node_modules", ".oss", "dist"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
