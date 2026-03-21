import type { RenderResult, RenderTask } from "./worker.js";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Options for creating an SSR route handler.
 */
export interface SSRHandlerOptions {
  /**
   * Optional function to extract props from the incoming request.
   * The returned object is passed as `props` to the render task.
   */
  getProps?: (
    request: FastifyRequest,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
}

/**
 * Creates a Fastify route handler that dispatches an SSR render task
 * to the worker pool and returns the resulting HTML.
 *
 * @example
 * ```ts
 * fastify.get("/about", createSSRHandler());
 * fastify.get("/profile", createSSRHandler({
 *   getProps: (request) => ({ user: request.user }),
 * }));
 * ```
 */
export function createSSRHandler(options: SSRHandlerOptions = {}) {
  return async function ssrHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const props = options.getProps
      ? await options.getProps(request)
      : undefined;

    const task: RenderTask = {
      type: "ssr",
      route: request.url,
      props,
      headers: request.headers as Record<string, string | string[] | undefined>,
    };

    const result = await request.server.runTask<RenderTask, RenderResult>(task);

    const hasContentTypeHeader =
      result.headers &&
      Object.keys(result.headers).some(
        (key) => key.toLowerCase() === "content-type",
      );

    const replyWithStatus = reply.status(result.statusCode);

    if (!hasContentTypeHeader) {
      replyWithStatus.header("content-type", "text/html; charset=utf-8");
    }

    if (result.headers) {
      for (const [key, value] of Object.entries(result.headers)) {
        replyWithStatus.header(key, value);
      }
    }

    return replyWithStatus.send(result.html);
  };
}
