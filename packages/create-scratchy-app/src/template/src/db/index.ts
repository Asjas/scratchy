/**
 * Database layer.
 * Exports the schema namespace and all table definitions for use
 * with the Drizzle plugin (`@scratchyjs/drizzle`) registered in `server.ts`.
 */
export { appSchema } from "~/db/my-schema.js";
export * from "~/db/schema/index.js";
