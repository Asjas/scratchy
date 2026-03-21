import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { availableParallelism } from "node:os";
import { Piscina } from "piscina";

/**
 * Configuration options for the renderer worker-pool plugin.
 */
export interface RendererPluginOptions {
  /** Absolute path to the worker entry-point file. */
  worker: string;
  /** Minimum number of worker threads to keep alive (default: 2). */
  minThreads?: number;
  /** Maximum number of worker threads (default: `max(4, availableParallelism())`). */
  maxThreads?: number;
  /** Milliseconds an idle worker can live before being terminated (default: 60 000). */
  idleTimeout?: number;
  /** V8 old-generation heap limit in MB per worker (default: 512). */
  maxOldGenerationSizeMb?: number;
}

/**
 * Fastify plugin that creates a Piscina worker thread pool for
 * server-side rendering. Decorates the instance with `fastify.piscina`
 * (the pool) and `fastify.runTask()` for dispatching render tasks.
 *
 * The pool is drained automatically when the server closes.
 */
export default fp(
  async function rendererPlugin(
    fastify: FastifyInstance,
    opts: RendererPluginOptions,
  ) {
    const {
      worker,
      minThreads = 2,
      maxThreads = Math.max(4, availableParallelism()),
      idleTimeout = 60_000,
      maxOldGenerationSizeMb = 512,
    } = opts;

    const pool = new Piscina({
      filename: worker,
      minThreads,
      maxThreads,
      idleTimeout,
      resourceLimits: {
        maxOldGenerationSizeMb,
      },
    });

    fastify.decorate("piscina", pool);
    fastify.decorate("runTask", pool.run.bind(pool));

    fastify.addHook("onClose", async () => {
      await pool.close();
    });

    fastify.log.info(
      { worker, minThreads, maxThreads },
      "renderer worker pool initialized",
    );
  },
  { name: "@scratchy/renderer" },
);
