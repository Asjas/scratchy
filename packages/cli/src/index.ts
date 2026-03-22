#!/usr/bin/env node
import { cacheClearCommand } from "./commands/cache-clear.js";
import { dbFreshCommand } from "./commands/db-fresh.js";
import { dbSeedCommand } from "./commands/db-seed.js";
import { makeComponentCommand } from "./commands/make-component.js";
import { makeMigrationCommand } from "./commands/make-migration.js";
import { makeModelCommand } from "./commands/make-model.js";
import { makePageCommand } from "./commands/make-page.js";
import { makePluginCommand } from "./commands/make-plugin.js";
import { makeRouteCommand } from "./commands/make-route.js";
import { makeRouterCommand } from "./commands/make-router.js";
import { makeScaffoldCommand } from "./commands/make-scaffold.js";
import { makeSeedCommand } from "./commands/make-seed.js";
import { makeTestCommand } from "./commands/make-test.js";
import { routesListCommand } from "./commands/routes-list.js";
import { defineCommand, runMain } from "citty";

export { makeModelCommand } from "./commands/make-model.js";
export { makeRouterCommand } from "./commands/make-router.js";
export { makeRouteCommand } from "./commands/make-route.js";
export { makeComponentCommand } from "./commands/make-component.js";
export { makePageCommand } from "./commands/make-page.js";
export { makePluginCommand } from "./commands/make-plugin.js";
export { makeScaffoldCommand } from "./commands/make-scaffold.js";
export { makeMigrationCommand } from "./commands/make-migration.js";
export { makeSeedCommand } from "./commands/make-seed.js";
export { makeTestCommand } from "./commands/make-test.js";
export { dbSeedCommand } from "./commands/db-seed.js";
export { dbFreshCommand } from "./commands/db-fresh.js";
export { routesListCommand } from "./commands/routes-list.js";
export { cacheClearCommand } from "./commands/cache-clear.js";
export { renderTemplate, clearTemplateCache } from "./utils/render.js";
export {
  toPascalCase,
  toKebabCase,
  toCamelCase,
  toSnakeCase,
  toPlural,
  parseColumns,
  uniqueColumnDrizzleTypes,
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
    "make:migration": makeMigrationCommand,
    "make:seed": makeSeedCommand,
    "make:test": makeTestCommand,
    "db:seed": dbSeedCommand,
    "db:fresh": dbFreshCommand,
    "routes:list": routesListCommand,
    "cache:clear": cacheClearCommand,
  },
});

runMain(main);
