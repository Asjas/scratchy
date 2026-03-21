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

  // Only allow safe relative redirects.
  // 1. If no referer or it's empty, use the fallback.
  if (typeof raw !== "string" || raw.length === 0) {
    return options.fallback;
  }

  // 2. If it's already a relative path, return it directly.
  if (raw.startsWith("/")) {
    return raw;
  }

  // 3. If it's an absolute HTTP(S) URL, strip origin and keep only path,
  //    query, and hash. For anything else, fall back.
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") {
      const path = `${url.pathname}${url.search}${url.hash}`;
      return path.length > 0 ? path : options.fallback;
    }
  } catch {
    // Invalid URL; fall through to fallback.
  }

  return options.fallback;
}
