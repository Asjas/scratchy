import type {} from "./types/fastify.js";
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
  /** Maximum number of worker threads (default: `max(4, availableParallelism())`).
   *  Override this in containerized environments where the container's
   *  CPU limit may differ from the host's reported parallelism. */
  maxThreads?: number;
  /** Milliseconds an idle worker can live before being terminated (default: 60 000). */
  idleTimeout?: number;
  /**
   * Maximum time in milliseconds a single render task may run before
   * being aborted (default: 30 000). Prevents hung SSR/SSG renders
   * from occupying a worker indefinitely.
   */
  taskTimeout?: number;
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
  function rendererPlugin(
    fastify: FastifyInstance,
    opts: RendererPluginOptions,
  ) {
    const {
      worker,
      minThreads = 2,
      maxThreads = Math.max(4, availableParallelism()),
      idleTimeout = 60_000,
      taskTimeout = 30_000,
      maxOldGenerationSizeMb = 512,
    } = opts;

    if (!Number.isInteger(minThreads) || minThreads <= 0) {
      throw new RangeError(
        `renderer worker pool configuration error: minThreads must be a positive integer, got ${minThreads}`,
      );
    }

    if (!Number.isInteger(maxThreads) || maxThreads <= 0) {
      throw new RangeError(
        `renderer worker pool configuration error: maxThreads must be a positive integer, got ${maxThreads}`,
      );
    }

    if (minThreads > maxThreads) {
      throw new RangeError(
        `renderer worker pool configuration error: minThreads (${minThreads}) cannot be greater than maxThreads (${maxThreads})`,
      );
    }
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
    fastify.decorate(
      "runTask",
      <T, R>(task: T) =>
        pool.run(task, {
          signal: AbortSignal.timeout(taskTimeout),
        }) as Promise<R>,
    );

    fastify.addHook("onClose", async () => {
      await pool.close();
    });

    fastify.log.info(
      { worker, minThreads, maxThreads, taskTimeout },
      "renderer worker pool initialized",
    );
  },
  { name: "@scratchyjs/renderer" },
);
