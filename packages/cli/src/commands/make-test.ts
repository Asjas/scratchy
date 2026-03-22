import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import { defineCommand } from "citty";
import { consola } from "consola";
import { basename, join } from "node:path";

export const makeTestCommand = defineCommand({
  meta: {
    name: "make:test",
    description: "Generate a Vitest test file",
  },
  args: {
    path: {
      type: "positional",
      description:
        "Path relative to src/ (without .test.ts), e.g. routers/posts/queries",
      required: true,
    },
    cwd: {
      type: "string",
      description: "Working directory (defaults to process.cwd())",
      default: "",
    },
  },
  async run({ args }) {
    const testPath = args.path.startsWith("/") ? args.path.slice(1) : args.path;
    const cwd = args.cwd || process.cwd();

    // Derive a human-readable description from the last path segment
    const name = basename(testPath);

    consola.info(`Generating test: src/${testPath}.test.ts`);

    const context = { name };
    const content = renderTemplate("test.ts.hbs", context);

    await writeFile(join(cwd, "src", `${testPath}.test.ts`), content);

    consola.success(`Test src/${testPath}.test.ts generated successfully`);
  },
});
