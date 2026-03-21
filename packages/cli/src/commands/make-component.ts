import { toCamelCase, toKebabCase, toPascalCase } from "../utils/names.js";
import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import { defineCommand } from "citty";
import { consola } from "consola";
import { join } from "node:path";

export const makeComponentCommand = defineCommand({
  meta: {
    name: "make:component",
    description: "Generate a Qwik or React component",
  },
  args: {
    name: {
      type: "positional",
      description: "Component name in PascalCase (e.g. UserCard)",
      required: true,
    },
    react: {
      type: "boolean",
      description: "Generate a React component with qwikify$ wrapper",
      default: false,
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

    const isReact = args.react === true;
    const subfolder = isReact ? "react" : "qwik";
    const templateFile = isReact
      ? "component-react.tsx.hbs"
      : "component-qwik.tsx.hbs";

    consola.info(
      `Generating ${isReact ? "React" : "Qwik"} component: ${pascalName}`,
    );

    const context = { pascalName, camelName, kebabName };
    const content = renderTemplate(templateFile, context);

    await writeFile(
      join(cwd, "src", "client", "components", subfolder, `${kebabName}.tsx`),
      content,
    );

    consola.success(`Component ${pascalName} generated successfully`);
  },
});
