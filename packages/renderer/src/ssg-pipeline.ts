import type { RenderResult, RenderTask } from "./worker.js";
import { mkdir, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { Piscina } from "piscina";

/**
 * Configuration options for the SSG build-time pre-rendering pipeline.
 */
export interface SsgPipelineOptions {
  /**
   * Absolute path to the Piscina worker entry-point file.
   * Should point to the compiled worker that exports a default `handler`
   * function (e.g. `@scratchy/renderer/worker`).
   */
  worker: string;
  /**
   * List of routes to pre-render (e.g. `["/", "/about", "/blog/hello"]`).
   */
  routes: string[];
  /**
   * Absolute path to the directory where pre-rendered HTML files will be
   * written.  The directory (and any required sub-directories) will be
   * created if it does not exist.
   */
  outDir: string;
  /**
   * Maximum number of worker threads to use (default:
   * `min(routes.length, availableParallelism())`).
   */
  maxThreads?: number;
  /**
   * Optional function that returns props to pass into the renderer for a
   * given route.  Use this to supply route-specific data at build time.
   */
  getProps?: (
    route: string,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /**
   * Task timeout in milliseconds (default: 30 000).
   * Tasks that exceed this limit are aborted.
   */
  taskTimeout?: number;
}

/**
 * An individual route result from the SSG pipeline.
 */
export interface SsgRouteResult {
  /** The route that was rendered (e.g. `"/about"`). */
  route: string;
  /** Absolute path of the file that was written. */
  path: string;
}

/**
 * An individual route failure from the SSG pipeline.
 */
export interface SsgRouteFailure {
  /** The route that failed to render. */
  route: string;
  /** The error thrown by the renderer. */
  error: Error;
}

/**
 * The aggregate result of a completed SSG pipeline run.
 */
export interface SsgPipelineResult {
  /** Routes that were successfully rendered and written to disk. */
  rendered: SsgRouteResult[];
  /** Routes that could not be rendered due to an error. */
  failed: SsgRouteFailure[];
  /** Total wall-clock duration of the pipeline run in milliseconds. */
  duration: number;
}

/**
 * Converts a URL route such as `"/about"` or `"/blog/hello"` into a
 * relative file path:
 * - `"/"` → `"index.html"`
 * - `"/about"` → `"about/index.html"`
 * - `"/blog/hello"` → `"blog/hello/index.html"`
 */
function routeToFilePath(route: string): string {
  const normalised = route.replace(/^\//, "").replace(/\/$/, "");
  if (normalised === "") {
    return "index.html";
  }
  return `${normalised}/index.html`;
}

/**
 * Runs the SSG build-time pre-rendering pipeline.
 *
 * For each route in `opts.routes` a Piscina worker dispatches an SSG
 * render task and writes the resulting HTML to disk under `opts.outDir`.
 * Routes are rendered concurrently up to the configured thread limit.
 *
 * @example
 * ```ts
 * import { runSsgPipeline } from "@scratchy/renderer";
 * import { resolve } from "node:path";
 *
 * const result = await runSsgPipeline({
 *   worker: resolve(import.meta.dirname, "renderer", "worker.ts"),
 *   routes: ["/", "/about", "/blog/hello"],
 *   outDir: resolve(import.meta.dirname, "..", "dist", "static"),
 * });
 *
 * console.log(`Rendered ${result.rendered.length} pages in ${result.duration}ms`);
 * ```
 */
export async function runSsgPipeline(
  opts: SsgPipelineOptions,
): Promise<SsgPipelineResult> {
  const {
    worker,
    routes,
    outDir,
    maxThreads = Math.min(routes.length || 1, availableParallelism()),
    getProps,
    taskTimeout = 30_000,
  } = opts;

  if (routes.length === 0) {
    return { rendered: [], failed: [], duration: 0 };
  }

  const start = Date.now();

  const pool = new Piscina({
    filename: worker,
    minThreads: 1,
    maxThreads,
    idleTimeout: 5_000,
  });

  const rendered: SsgRouteResult[] = [];
  const failed: SsgRouteFailure[] = [];

  const tasks = routes.map(async (route) => {
    const props = getProps ? await getProps(route) : undefined;

    const task: RenderTask = { type: "ssg", route, props };

    let result: RenderResult;
    try {
      result = (await pool.run(task, {
        signal: AbortSignal.timeout(taskTimeout),
      })) as RenderResult;
    } catch (err) {
      const isTimeoutError =
        err instanceof Error &&
        (err.name === "TimeoutError" || err.name === "AbortError");
      const message = isTimeoutError
        ? `SSG render timed out for route "${route}" after ${taskTimeout}ms`
        : err instanceof Error
          ? err.message
          : String(err);
      failed.push({
        route,
        error: isTimeoutError
          ? new Error(message, { cause: err })
          : err instanceof Error
            ? err
            : new Error(message),
      });
      return;
    }

    const relPath = routeToFilePath(route);
    const absPath = join(outDir, relPath);
    const dir = dirname(absPath);

    try {
      await mkdir(dir, { recursive: true });
      await writeFile(absPath, result.html, "utf8");
      rendered.push({ route, path: absPath });
    } catch (err) {
      failed.push({
        route,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  });

  await Promise.allSettled(tasks);
  await pool.close();

  return { rendered, failed, duration: Date.now() - start };
}
