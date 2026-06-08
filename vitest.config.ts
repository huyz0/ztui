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
        "src/widgets/mermaid.ts",
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
