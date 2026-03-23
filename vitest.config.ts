import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["packages/*/src/**/*.test.ts", "examples/*/src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "istanbul",
      include: ["packages/*/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "**/create-scratchy-app/src/template/**",
        // CLI entry-point files with top-level side effects (interactive
        // prompts, process.exit, runMain) that cannot be unit-tested.
        // All testable logic is extracted into separate modules.
        "**/cli/src/index.ts",
        "**/create-scratchy-app/src/index.ts",
        // Test-only worker scripts used by ssg-pipeline tests.
        "**/renderer/src/test-workers/**",
      ],
      reporter: ["text", "json", "json-summary"],
    },
  },
});
