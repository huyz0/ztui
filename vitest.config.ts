import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["node_modules", ".oss", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json"],
      include: ["src/**/*"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        // Performance suite — run via `bun run perf` / `bun run bench`, not the gate.
        "src/**/*.perf.ts",
        "src/**/*.bench.ts",
        "src/test/bench/**",
        // Re-export-only package entry points (no logic to cover).
        "src/core.ts",
        "src/react.ts",
        "src/markdown.ts",
        "src/syntax.ts",
        "src/mermaid.ts",
        "src/widgets/register-core.ts",
        "src/widgets/text/register-markdown.ts",
        "src/widgets/text/register-syntax.ts",
        "src/widgets/text/register-mermaid.ts",
        "src/react/jsx-namespace.d.ts",
        "src/react/host-config.ts",
        "src/core/inspector.ts",
        "src/utils/sharp-render-sync.ts",
        "src/widgets/text/mermaid.ts",
        "src/react/components/text/mermaid.tsx",
        // Browser-/bundler-only web code, verified via Playwright (bun run web:debug)
        // rather than the unit runner.
        "src/tools/web-inspector.ts",
        "src/driver/web/canvas-bundle.ts",
        "src/driver/web/canvas-client.ts",
        "src/driver/web/dom.ts",
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
});
