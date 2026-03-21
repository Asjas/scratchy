/**
 * Database layer for the starter example.
 * Exports the schema namespace and all table definitions for use
 * with the Drizzle plugin (`@scratchy/drizzle`) registered in `server.ts`.
 */
export { appSchema } from "./my-schema.js";
export * from "./schema/index.js";
