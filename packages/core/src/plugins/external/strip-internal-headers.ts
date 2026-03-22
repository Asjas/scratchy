import fastifyPlugin from "fastify-plugin";

/**
 * Strips security-sensitive headers on every request and response.
 *
 * **Inbound (request) headers stripped:**
 * Generic internal-routing markers that should never arrive from an external
 * client. If any application code ever trusts these headers to make auth or
 * routing decisions, an attacker could forge them to gain elevated access.
 *
 * **Outbound (response) headers stripped:**
 * - `server` — Fastify sets this to `"Fastify"` by default, advertising the
 *   framework version. Removing it reduces the server's attack surface by
 *   hiding implementation details from potential attackers.
 */
const INTERNAL_REQUEST_HEADERS = [
  // Generic internal-routing markers used by various proxies / service meshes.
  // Stripping these prevents spoofing attacks where an attacker sends a forged
  // header to bypass auth or rate-limiting logic that trusts the header value.
  "x-internal-request",
  "x-internal-token",
] as const;

export default fastifyPlugin(
  function stripInternalHeadersPlugin(fastify, _opts, done) {
    fastify.addHook("onRequest", (request, _reply, hookDone) => {
      for (const header of INTERNAL_REQUEST_HEADERS) {
        // Mutating the headers object removes the header from all downstream
        // processing (auth hooks, route handlers, etc.).
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete request.headers[header];
      }
      hookDone();
    });

    // Strip the `server` response header that Fastify adds automatically.
    // This prevents leaking framework/version information to clients.
    fastify.addHook("onSend", (_request, reply, _payload, hookDone) => {
      reply.removeHeader("server");
      hookDone();
    });

    done();
  },
  { name: "strip-internal-headers" },
);
