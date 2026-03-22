import fastifyCors, { type FastifyCorsOptions } from "@fastify/cors";
import fp from "fastify-plugin";

/**
 * Build the `origin` option for `@fastify/cors` from the parsed `Config`
 * values (not `process.env`). This ensures the effective CORS policy always
 * matches the `Config` object passed to `createServer()`, even when a
 * consumer constructs config programmatically without setting env vars.
 *
 * - **Development / test:** `origin: true` — all origins allowed.
 * - **Production with `ALLOWED_ORIGINS` set:** explicit allowlist callback —
 *   only listed origins may make credentialed requests.
 * - **Production without `ALLOWED_ORIGINS`:** `origin: false` — no
 *   cross-origin requests are permitted. This is a safe default that
 *   intentionally breaks misconfigured production deployments rather than
 *   silently reflecting every origin with `credentials: true`.
 *
 * CVE-mitigations addressed:
 * - CORS misconfiguration (origin reflection + credentials) — CVE-2024-8024 pattern
 */
function buildOrigin(
  nodeEnv: string,
  allowedOrigins: string[],
): FastifyCorsOptions["origin"] {
  if (nodeEnv !== "production") {
    return true;
  }

  if (allowedOrigins.length === 0) {
    // Production with no allowlist — refuse all cross-origin requests rather
    // than silently reflecting the caller's origin with credentials.
    return false;
  }

  return (origin, callback) => {
    // Same-origin / non-CORS requests have no Origin header.
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS policy"), false);
    }
  };
}

export default fp(
  async function corsPlugin(fastify) {
    const { NODE_ENV, ALLOWED_ORIGINS } = fastify.config;

    await fastify.register(fastifyCors, {
      credentials: true,
      maxAge: 86_400,
      origin: buildOrigin(NODE_ENV, ALLOWED_ORIGINS),
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    });
  },
  { name: "cors" },
);
