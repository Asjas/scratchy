#!/usr/bin/env node
import { makeComponentCommand } from "./commands/make-component.js";
import { makeModelCommand } from "./commands/make-model.js";
import { makePageCommand } from "./commands/make-page.js";
import { makePluginCommand } from "./commands/make-plugin.js";
import { makeRouteCommand } from "./commands/make-route.js";
import { makeRouterCommand } from "./commands/make-router.js";
import { makeScaffoldCommand } from "./commands/make-scaffold.js";
import { defineCommand, runMain } from "citty";

export { makeModelCommand } from "./commands/make-model.js";
export { makeRouterCommand } from "./commands/make-router.js";
export { makeRouteCommand } from "./commands/make-route.js";
export { makeComponentCommand } from "./commands/make-component.js";
export { makePageCommand } from "./commands/make-page.js";
export { makePluginCommand } from "./commands/make-plugin.js";
export { makeScaffoldCommand } from "./commands/make-scaffold.js";
export { renderTemplate, clearTemplateCache } from "./utils/render.js";
export {
  toPascalCase,
  toKebabCase,
  toCamelCase,
  toSnakeCase,
  toPlural,
  parseColumns,
} from "./utils/names.js";
export type { ColumnDefinition } from "./utils/names.js";

const main = defineCommand({
  meta: {
    name: "scratchy",
    version: "0.0.0",
    description:
      "Scratchy framework CLI — scaffold models, routers, pages and more",
  },
  subCommands: {
    "make:model": makeModelCommand,
    "make:router": makeRouterCommand,
    "make:route": makeRouteCommand,
    "make:component": makeComponentCommand,
    "make:page": makePageCommand,
    "make:plugin": makePluginCommand,
    "make:scaffold": makeScaffoldCommand,
  },
});

runMain(main);
