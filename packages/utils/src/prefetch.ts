import type { IncomingHttpHeaders } from "node:http";

/**
 * A request-like object with a `headers` property compatible with Node.js
 * `IncomingHttpHeaders`.
 */
export interface RequestLike {
  headers: IncomingHttpHeaders;
}

/**
 * Return `true` when the request was triggered by a browser prefetch
 * (e.g. `<link rel="prefetch">`, `<link rel="prerender">` or a navigation
 * hint). Checks the `Purpose`, `X-Purpose`, `Sec-Purpose`,
 * `Sec-Fetch-Purpose`, `Moz-Purpose`, and `X-Moz` headers.
 *
 * Accepts either a Fastify `FastifyRequest` or any object with a `headers`
 * property compatible with Node.js `IncomingHttpHeaders`.
 *
 * @example
 * fastify.get("/data", (request, reply) => {
 *   if (isPrefetch(request)) {
 *     reply.header("Cache-Control", "private, max-age=5");
 *   }
 *   reply.send({ ok: true });
 * });
 */
export function isPrefetch(request: RequestLike): boolean {
  const { headers } = request;
  const purpose =
    headers["purpose"] ??
    headers["x-purpose"] ??
    headers["sec-purpose"] ??
    headers["sec-fetch-purpose"] ??
    headers["moz-purpose"] ??
    headers["x-moz"];

  if (!purpose) return false;

  const value = Array.isArray(purpose) ? purpose[0] : purpose;
  return value?.toLowerCase() === "prefetch";
}
