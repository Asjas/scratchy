import { toCamelCase, toKebabCase, toPascalCase } from "../utils/names.js";
import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import { defineCommand } from "citty";
import { consola } from "consola";
import { join } from "node:path";

export const makeSeedCommand = defineCommand({
  meta: {
    name: "make:seed",
    description: "Generate a database seed file",
  },
  args: {
    name: {
      type: "positional",
      description: "Seed name in PascalCase (e.g. Users or InitialData)",
      required: true,
    },
    model: {
      type: "string",
      description:
        "Model name to seed (e.g. User); omit for a generic seed file",
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
    const cwd = args.cwd || process.cwd();

    consola.info(`Generating seed: ${kebabName}`);

    const context = {
      pascalName,
      camelName,
      kebabName,
      model: args.model || "",
    };

    const content = renderTemplate("seed.ts.hbs", context);

    await writeFile(
      join(cwd, "src", "db", "seeds", `${kebabName}.ts`),
      content,
    );

    consola.success(`Seed ${kebabName} generated successfully`);
    consola.info(
      `Run the seed: node --env-file=.env src/db/seeds/${kebabName}.ts`,
    );
    consola.info(`Or via CLI: scratchy db:seed ${kebabName}`);
  },
});
