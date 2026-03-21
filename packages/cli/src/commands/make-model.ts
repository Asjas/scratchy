import {
  parseColumns,
  toCamelCase,
  toKebabCase,
  toPascalCase,
  toSnakeCase,
  uniqueColumnDrizzleTypes,
} from "../utils/names.js";
import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import { defineCommand } from "citty";
import { consola } from "consola";
import { join } from "node:path";

export const makeModelCommand = defineCommand({
  meta: {
    name: "make:model",
    description: "Generate a Drizzle model (schema, queries, mutations)",
  },
  args: {
    "name": {
      type: "positional",
      description: "Model name in PascalCase (e.g. Post)",
      required: true,
    },
    "columns": {
      type: "string",
      description: 'Column definitions, e.g. "title:text,published:boolean"',
      default: "",
    },
    "with-router": {
      type: "boolean",
      description: "Also generate tRPC router queries and mutations",
      default: false,
    },
    "cwd": {
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
    const columns = parseColumns(args.columns ?? "");
    const cwd = args.cwd || process.cwd();

    consola.info(`Generating model: ${pascalName}`);

    const context = {
      pascalName,
      camelName,
      kebabName,
      snakeName,
      columns,
      uniqueColumnTypes: uniqueColumnDrizzleTypes(columns),
    };

    // Generate schema file
    const schemaContent = renderTemplate("model.ts.hbs", context);
    await writeFile(
      join(cwd, "src", "db", "schema", `${kebabName}.ts`),
      schemaContent,
    );

    // Generate queries file
    const queriesContent = renderTemplate("queries.ts.hbs", context);
    await writeFile(
      join(cwd, "src", "db", "queries", `${kebabName}s.ts`),
      queriesContent,
    );

    // Generate mutations file
    const mutationsContent = renderTemplate("mutations.ts.hbs", context);
    await writeFile(
      join(cwd, "src", "db", "mutations", `${kebabName}s.ts`),
      mutationsContent,
    );

    if (args["with-router"]) {
      const routerQueriesContent = renderTemplate(
        "router-queries.ts.hbs",
        context,
      );
      await writeFile(
        join(cwd, "src", "routers", kebabName, "queries.ts"),
        routerQueriesContent,
      );

      const routerMutationsContent = renderTemplate(
        "router-mutations.ts.hbs",
        context,
      );
      await writeFile(
        join(cwd, "src", "routers", kebabName, "mutations.ts"),
        routerMutationsContent,
      );

      consola.info(
        `Register the router in src/routers/index.ts:\n` +
          `  import { ${camelName}Queries } from "./${kebabName}/queries.js";\n` +
          `  import { ${camelName}Mutations } from "./${kebabName}/mutations.js";`,
      );
    }

    consola.success(`Model ${pascalName} generated successfully`);
  },
});
