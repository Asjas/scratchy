import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import { defineCommand } from "citty";
import { consola } from "consola";
import { join } from "node:path";

export const makeRouteCommand = defineCommand({
  meta: {
    name: "make:route",
    description: "Generate a Fastify REST route",
  },
  args: {
    path: {
      type: "positional",
      description: "Route path (e.g. external/api/v1/products)",
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

    consola.info(`Generating route: /${routePath}`);

    const context = { routePath };
    const content = renderTemplate("route.ts.hbs", context);

    await writeFile(join(cwd, "src", "routes", routePath, "index.ts"), content);

    consola.success(`Route /${routePath} generated successfully`);
  },
});
