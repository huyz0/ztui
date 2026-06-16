import { defineConfig } from "vitest/config";

// Performance suite: ratio-guard tests (`*.perf.ts`) and tracking benchmarks
// (`*.bench.ts`). Kept out of the default coverage gate so commits stay fast;
// run explicitly via `bun run perf` (guards, hard fail) and `bun run bench`
// (vitest bench, ops/sec tracking).
//
// Timing stability: no parallelism — files and tests run one at a time so a
// neighbouring worker can't steal CPU mid-measurement and inflate a ratio.
export default defineConfig({
  test: {
    globals: true,
    // Only the ratio-guard tests run under `vitest run` (`bun run perf`). The
    // `.bench.ts` files use `bench()`, which is valid only under `vitest bench`
    // (`bun run bench`) — including them here would error in run mode. They're
    // scoped via `benchmark.include` below.
    include: ["src/**/*.perf.ts"],
    exclude: ["node_modules", ".oss", "dist"],
    fileParallelism: false,
    pool: "forks",
    sequence: { concurrent: false },
    // `vitest bench` uses its own include/exclude (not `test.include`), and its
    // default exclude misses the vendored `.oss` trees — scope it to ours.
    benchmark: {
      include: ["src/**/*.bench.ts"],
      exclude: ["node_modules", ".oss", "dist"],
    },
  },
});
