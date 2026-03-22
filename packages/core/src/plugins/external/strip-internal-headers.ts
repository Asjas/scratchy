import fastifyPlugin from "fastify-plugin";

/**
 * Headers that must never be accepted from external clients.
 *
 * Internal-routing headers are set by reverse proxies / edge layers to
 * communicate between internal services. If an attacker can send these
 * headers directly to the origin server they may be able to:
 *   - Bypass authentication middleware (CVE-2025-29927 pattern — Next.js
 *     `x-middleware-subrequest` bypass, directly applicable to any
 *     SSR / API framework that trusts internal headers from external clients).
 *   - Spoof trusted callers or skip rate-limiting.
 *
 * Mitigation: strip all known internal-routing headers on every inbound
 * request **before** any other hook runs so they can never reach route
 * handlers or auth middleware.
 */
const INTERNAL_HEADERS = [
  // Next.js middleware bypass header (CVE-2025-29927)
  "x-middleware-subrequest",
  "x-middleware-prefetch",
  "x-middleware-rewrite",
  // Generic internal-routing markers used by various frameworks / proxies
  "x-internal-request",
  "x-internal-token",
  // Vercel/edge platform internal headers
  "x-vercel-internal",
  "x-now-route-matches",
  // Remix internal header (CVE-2025-31137 pattern)
  "x-remix-response",
] as const;

export default fastifyPlugin(
  function stripInternalHeadersPlugin(fastify, _opts, done) {
    fastify.addHook("onRequest", (request, _reply, hookDone) => {
      for (const header of INTERNAL_HEADERS) {
        // Mutating the headers object removes the header from all downstream
        // processing (auth hooks, route handlers, etc.).
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete request.headers[header];
      }
      hookDone();
    });

    done();
  },
  { name: "strip-internal-headers" },
);
