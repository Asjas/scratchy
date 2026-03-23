import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the performance benchmarking suite.
 *
 * Run benchmarks with:
 *   pnpm bench           — interactive mode (watch-friendly)
 *   pnpm bench:ci        — single run, JSON output saved to benchmarks/results.json
 */
export default defineConfig({
  test: {
    globals: true,
    include: ["benchmarks/**/*.bench.ts"],
    benchmark: {
      include: ["benchmarks/**/*.bench.ts"],
      outputJson: "benchmarks/results.json",
    },
  },
});
