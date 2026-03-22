import fastifyCors, { type FastifyCorsOptions } from "@fastify/cors";

/**
 * Parse the `ALLOWED_ORIGINS` environment variable into an array of allowed
 * origins. Returns an empty array when the variable is unset or empty.
 *
 * NOTE: This reads `process.env` directly (rather than the `Config` object)
 * because `autoConfig` is evaluated at module load time via `@fastify/autoload`
 * — before the `Config` decorator is attached to the Fastify instance.
 * The parsing logic intentionally mirrors `configSchema.ALLOWED_ORIGINS` in
 * `config.ts` so they remain in sync.
 */
function parseAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS ?? "";
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Build the `origin` option for `@fastify/cors`.
 *
 * - **Development / test:** `origin: true` — all origins allowed (mirrors the
 *   legacy default so that local development is unaffected).
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
function buildOrigin(): FastifyCorsOptions["origin"] {
  const nodeEnv = process.env.NODE_ENV ?? "development";

  if (nodeEnv !== "production") {
    return true;
  }

  const allowed = parseAllowedOrigins();
  if (allowed.length === 0) {
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
    if (allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS policy"), false);
    }
  };
}

export const autoConfig: FastifyCorsOptions = {
  credentials: true,
  maxAge: 86_400,
  origin: buildOrigin(),
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
};

export default fastifyCors;
