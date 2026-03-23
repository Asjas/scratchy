import type {} from "./types/fastify.js";
import type { StreamingRenderResult, StreamingRenderTask } from "./worker.js";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Readable } from "node:stream";

/**
 * Options for creating a streaming SSR route handler.
 */
export interface StreamingSSRHandlerOptions {
  /**
   * Optional function to extract props from the incoming request.
   * The returned object is passed as `props` to the render task.
   */
  getProps?: (
    request: FastifyRequest,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
}

/**
 * Creates a Fastify route handler that dispatches an `"ssr-stream"` render
 * task to the worker pool and streams the resulting HTML chunks to the client
 * using HTTP chunked transfer encoding.
 *
 * The worker splits the HTML into ordered chunks (shell/head, content,
 * closing tags). Each chunk is piped into the response as it becomes
 * available, letting the browser start parsing critical resources before the
 * full body is ready.
 *
 * @example
 * ```ts
 * fastify.get("/about", createStreamingSSRHandler());
 * fastify.get("/profile", createStreamingSSRHandler({
 *   getProps: (request) => ({ user: request.user }),
 * }));
 * ```
 */
export function createStreamingSSRHandler(
  options: StreamingSSRHandlerOptions = {},
) {
  return async function streamingSSRHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const props = options.getProps
      ? await options.getProps(request)
      : undefined;

    const task: StreamingRenderTask = {
      type: "ssr-stream",
      route: request.url,
      props,
      headers: request.headers as Record<string, string | string[] | undefined>,
    };

    const result = await request.server.runTask<
      StreamingRenderTask,
      StreamingRenderResult
    >(task);

    reply.status(result.statusCode);
    reply.header("content-type", "text/html; charset=utf-8");
    reply.header("x-content-type-options", "nosniff");

    if (result.headers) {
      for (const [key, value] of Object.entries(result.headers)) {
        const lowerKey = key.toLowerCase();
        // Avoid overwriting the content-type and x-content-type-options we already set.
        if (
          lowerKey !== "content-type" &&
          lowerKey !== "x-content-type-options"
        ) {
          reply.header(key, value);
        }
      }
    }

    // Pipe the ordered HTML chunks into the response as a Node.js Readable
    // stream.  Fastify automatically applies Transfer-Encoding: chunked when
    // a stream is passed to reply.send(), enabling the browser to render
    // progressively as chunks arrive.
    const stream = Readable.from(result.chunks);
    return reply.send(stream);
  };
}
