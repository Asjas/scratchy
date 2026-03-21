import type { PoolOptions } from "./pool.js";
import { createPool } from "./pool.js";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type pg from "pg";

export interface DrizzlePluginOptions {
  /** PostgreSQL connection URL. */
  connectionString: string;
  /** Pool sizing and timeout options. */
  pool?: PoolOptions;
  /** Drizzle schema objects to register for relational queries. */
  schemas?: Record<string, unknown>;
}

declare module "fastify" {
  interface FastifyInstance {
    db: NodePgDatabase<Record<string, unknown>>;
    pool: pg.Pool;
  }
}

/**
 * Fastify plugin that decorates the instance with a Drizzle ORM
 * database connection (`fastify.db`) and the underlying `pg.Pool`
 * (`fastify.pool`). Cleans up the pool on server close.
 */
export default fp(
  async function drizzlePlugin(
    fastify: FastifyInstance,
    opts: DrizzlePluginOptions,
  ) {
    const { drizzle } = await import("drizzle-orm/node-postgres");

    const pool = await createPool(
      opts.connectionString,
      opts.pool,
      fastify.log,
    );

    const db = drizzle({
      client: pool,
      casing: "snake_case",
      schema: opts.schemas,
    });

    fastify.decorate("db", db);
    fastify.decorate("pool", pool);

    fastify.addHook("onClose", async () => {
      await pool.end();
    });

    fastify.log.info("drizzle plugin registered");
  },
  { name: "@scratchy/drizzle" },
);
