import type { IncomingHttpHeaders } from "node:http";

/**
 * A request-like object with a `headers` property compatible with Node.js
 * `IncomingHttpHeaders`.
 */
export interface RequestLike {
  headers: IncomingHttpHeaders;
}

/**
 * Return the `Location` URL for a "redirect back" response – i.e. the value
 * of the `Referer` request header, falling back to `fallback` when the header
 * is absent.
 *
 * Use this in Fastify route handlers to redirect the user back to the page
 * they came from:
 *
 * @example
 * fastify.post("/action", (request, reply) => {
 *   // ... do work ...
 *   reply.redirect(redirectBack(request, { fallback: "/" }));
 * });
 */
export function redirectBack(
  request: RequestLike,
  options: { fallback: string },
): string {
  const referer = request.headers["referer"];
  const raw = Array.isArray(referer) ? referer[0] : referer;
  return raw && raw.length > 0 ? raw : options.fallback;
}
