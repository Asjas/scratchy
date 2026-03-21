import {
  parseColumns,
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

export const makeScaffoldCommand = defineCommand({
  meta: {
    name: "make:scaffold",
    description:
      "Generate a full feature set: model, router, list/detail pages, card and form components",
  },
  args: {
    name: {
      type: "positional",
      description: "Resource name in PascalCase (e.g. Product)",
      required: true,
    },
    columns: {
      type: "string",
      description: 'Column definitions, e.g. "title:text,price:numeric"',
      default: "",
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
    const columns = parseColumns(args.columns ?? "");
    const cwd = args.cwd || process.cwd();

    consola.info(`Scaffolding feature: ${pascalName}`);

    const context = {
      pascalName,
      camelName,
      kebabName,
      snakeName,
      columns,
    };

    // 1. Schema
    const schemaContent = renderTemplate("model.ts.hbs", context);
    await writeFile(
      join(cwd, "src", "db", "schema", `${kebabName}.ts`),
      schemaContent,
    );

    // 2. Queries
    const queriesContent = renderTemplate("queries.ts.hbs", context);
    await writeFile(
      join(cwd, "src", "db", "queries", `${kebabName}s.ts`),
      queriesContent,
    );

    // 3. Mutations
    const mutationsContent = renderTemplate("mutations.ts.hbs", context);
    await writeFile(
      join(cwd, "src", "db", "mutations", `${kebabName}s.ts`),
      mutationsContent,
    );

    // 4. Router queries
    const routerQueriesContent = renderTemplate(
      "router-queries.ts.hbs",
      context,
    );
    await writeFile(
      join(cwd, "src", "routers", kebabName, "queries.ts"),
      routerQueriesContent,
    );

    // 5. Router mutations
    const routerMutationsContent = renderTemplate(
      "router-mutations.ts.hbs",
      context,
    );
    await writeFile(
      join(cwd, "src", "routers", kebabName, "mutations.ts"),
      routerMutationsContent,
    );

    // 6. List page
    const listContext = {
      ...context,
      pascalName: `${pascalName}List`,
      camelName: `${camelName}List`,
      kebabName: `${kebabName}-list`,
    };
    const listPageContent = renderTemplate("page.tsx.hbs", listContext);
    await writeFile(
      join(cwd, "src", "client", "routes", kebabName, "index.tsx"),
      listPageContent,
    );

    // 7. Detail page
    const detailContext = {
      ...context,
      pascalName: `${pascalName}Detail`,
      camelName: `${camelName}Detail`,
      kebabName: `${kebabName}-detail`,
    };
    const detailPageContent = renderTemplate("page.tsx.hbs", detailContext);
    await writeFile(
      join(cwd, "src", "client", "routes", kebabName, "[id]", "index.tsx"),
      detailPageContent,
    );

    // 8. Card component
    const cardContext = {
      pascalName: `${pascalName}Card`,
      camelName: `${camelName}Card`,
      kebabName: `${kebabName}-card`,
    };
    const cardContent = renderTemplate("component-qwik.tsx.hbs", cardContext);
    await writeFile(
      join(cwd, "src", "client", "components", "qwik", `${kebabName}-card.tsx`),
      cardContent,
    );

    // 9. Form component
    const formContext = {
      pascalName: `${pascalName}Form`,
      camelName: `${camelName}Form`,
      kebabName: `${kebabName}-form`,
    };
    const formContent = renderTemplate("component-qwik.tsx.hbs", formContext);
    await writeFile(
      join(cwd, "src", "client", "components", "qwik", `${kebabName}-form.tsx`),
      formContent,
    );

    consola.info(
      `Register the router in src/routers/index.ts:\n` +
        `  import { ${camelName}Queries } from "./${kebabName}/queries.js";\n` +
        `  import { ${camelName}Mutations } from "./${kebabName}/mutations.js";`,
    );

    consola.success(
      `Scaffold for ${pascalName} generated successfully (9 files created)`,
    );
  },
});
