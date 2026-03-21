import { toCamelCase, toKebabCase, toPascalCase } from "../utils/names.js";
import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import { defineCommand } from "citty";
import { consola } from "consola";
import { join } from "node:path";

/**
 * Derives the component name from a route path.
 * Strips dynamic segments markers (`[`, `]`) and picks the last meaningful segment.
 * e.g., "blog/[slug]" → "BlogSlug"
 */
function pageNameFromPath(routePath: string): string {
  const segments = routePath
    .split("/")
    .filter(Boolean)
    .map((s) => s.replace(/[[\]]/g, ""));
  return segments.map((s) => toPascalCase(s)).join("");
}

export const makePageCommand = defineCommand({
  meta: {
    name: "make:page",
    description: "Generate a Qwik page with routeLoader$",
  },
  args: {
    path: {
      type: "positional",
      description: "Page route path (e.g. blog/[slug])",
      required: true,
    },
    cwd: {
      type: "string",
      description: "Working directory (defaults to process.cwd())",
      default: "",
    },
  },
  async run({ args }) {
    const routePath = args.path.startsWith("/")
      ? args.path.slice(1)
      : args.path;
    const cwd = args.cwd || process.cwd();

    const derivedName = pageNameFromPath(routePath);
    const pascalName = toPascalCase(derivedName);
    const camelName = toCamelCase(derivedName);
    const kebabName = toKebabCase(derivedName);

    consola.info(`Generating page: /${routePath}`);

    const context = { pascalName, camelName, kebabName, routePath };
    const content = renderTemplate("page.tsx.hbs", context);

    await writeFile(
      join(cwd, "src", "client", "routes", routePath, "index.tsx"),
      content,
    );

    consola.success(`Page /${routePath} generated successfully`);
  },
});
