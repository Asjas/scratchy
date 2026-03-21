import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";

/**
 * A request-like object with a `headers` property compatible with Node.js
 * `IncomingHttpHeaders`.
 */
export interface RequestLike {
  headers: IncomingHttpHeaders;
}

/**
 * The ordered list of headers inspected to find the client IP address.
 */
const IP_HEADER_NAMES = Object.freeze([
  "x-azure-clientip",
  "x-client-ip",
  "x-forwarded-for",
  "http-x-forwarded-for",
  "fly-client-ip",
  "cf-connecting-ip",
  "fastly-client-ip",
  "true-client-ip",
  "x-real-ip",
  "x-cluster-client-ip",
  "x-forwarded",
  "forwarded-for",
  "forwarded",
  "do-connecting-ip",
  "oxygen-buyer-ip",
] as const);

function parseForwardedHeader(value: string): string | null {
  for (const part of value.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith("for=")) return trimmed.slice(4);
  }
  return null;
}

function extractIPs(
  headerName: string,
  rawValue: string | string[] | undefined,
): string[] {
  if (!rawValue) return [];
  const value = Array.isArray(rawValue) ? rawValue.join(",") : rawValue;

  if (headerName === "forwarded") {
    const parsed = parseForwardedHeader(value);
    return parsed ? [parsed] : [];
  }

  if (value.includes(",")) {
    return value.split(",").map((ip) => ip.trim());
  }

  return [value.trim()];
}

/**
 * Get the IP address of the client that originated the request.
 *
 * Inspects a prioritised list of headers commonly set by proxies and CDNs.
 * Returns `null` when no valid IP address is found (e.g. in local development).
 *
 * Accepts either a Fastify `FastifyRequest` or any object with a `headers`
 * property compatible with Node.js `IncomingHttpHeaders`.
 *
 * @example
 * fastify.get("/", (request, reply) => {
 *   const ip = getClientIPAddress(request);
 *   reply.send({ ip });
 * });
 */
export function getClientIPAddress(request: RequestLike): string | null {
  const headers = request.headers;

  for (const name of IP_HEADER_NAMES) {
    const rawValue = headers[name];
    const candidates = extractIPs(name, rawValue);
    const valid = candidates.find((ip) => isIP(ip) !== 0);
    if (valid !== undefined) return valid;
  }

  return null;
}
