import { toCamelCase, toKebabCase, toPascalCase } from "../utils/names.js";
import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import { defineCommand } from "citty";
import { consola } from "consola";
import { join } from "node:path";

export const makePluginCommand = defineCommand({
  meta: {
    name: "make:plugin",
    description: "Generate a Fastify plugin",
  },
  args: {
    name: {
      type: "positional",
      description: "Plugin name (e.g. cache or myService)",
      required: true,
    },
    cwd: {
      type: "string",
      description: "Working directory (defaults to process.cwd())",
      default: "",
    },
  },
  async run({ args }) {
    const name = args.name;
    const pascalName = toPascalCase(name);
    const camelName = toCamelCase(name);
    const kebabName = toKebabCase(name);
    const cwd = args.cwd || process.cwd();

    consola.info(`Generating plugin: ${kebabName}`);

    const context = { pascalName, camelName, kebabName };
    const content = renderTemplate("plugin.ts.hbs", context);

    await writeFile(
      join(cwd, "src", "plugins", "app", `${kebabName}.ts`),
      content,
    );

    consola.success(`Plugin ${kebabName} generated successfully`);
  },
});
