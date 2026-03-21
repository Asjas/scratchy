import {
  toCamelCase,
  toKebabCase,
  toPascalCase,
  toSnakeCase,
} from "../utils/names.js";
import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import { defineCommand } from "citty";
import { consola } from "consola";
import { join } from "node:path";

export const makeRouterCommand = defineCommand({
  meta: {
    name: "make:router",
    description: "Generate tRPC router queries and mutations",
  },
  args: {
    name: {
      type: "positional",
      description: "Router name (e.g. post or Post)",
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
    const snakeName = toSnakeCase(name);
    const cwd = args.cwd || process.cwd();

    consola.info(`Generating router: ${pascalName}`);

    const context = {
      pascalName,
      camelName,
      kebabName,
      snakeName,
      columns: [],
    };

    const queriesContent = renderTemplate("router-queries.ts.hbs", context);
    await writeFile(
      join(cwd, "src", "routers", kebabName, "queries.ts"),
      queriesContent,
    );

    const mutationsContent = renderTemplate("router-mutations.ts.hbs", context);
    await writeFile(
      join(cwd, "src", "routers", kebabName, "mutations.ts"),
      mutationsContent,
    );

    consola.info(
      `Register the router in src/routers/index.ts:\n` +
        `  import { ${camelName}Queries } from "./${kebabName}/queries.js";\n` +
        `  import { ${camelName}Mutations } from "./${kebabName}/mutations.js";\n` +
        `\n` +
        `  export const appRouter = router({\n` +
        `    ${camelName}: router({ ...${camelName}Queries, ...${camelName}Mutations }),\n` +
        `  });`,
    );

    consola.success(`Router ${pascalName} generated successfully`);
  },
});
