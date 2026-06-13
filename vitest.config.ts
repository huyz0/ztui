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
        "src/index.ts",
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
        lines: 90,
        functions: 90,
        branches: 70,
        statements: 88,
      },
    },
  },
});
