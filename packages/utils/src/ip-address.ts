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

/**
 * Parse a RFC 7239 `Forwarded` header and return all IP candidates found in
 * `for=` directives across every comma-separated hop entry.
 *
 * Handles:
 * - Multiple hop entries:  `for=1.2.3.4, for=5.6.7.8`
 * - Quoted values:         `for="1.2.3.4:1234"`
 * - IPv6 bracket literals: `for="[2001:db8::1]"` or `for=[2001:db8::1]`
 * - IPv6 with port:        `for="[2001:db8::1]:4711"`
 * - IPv4 with port:        `for=1.2.3.4:1234`
 */
function parseForwardedHeader(value: string): string[] {
  const candidates: string[] = [];

  // Split on commas to handle multiple hop entries (RFC 7239 §4).
  for (const entry of value.split(",")) {
    // Each hop entry has semicolon-separated directive parameters.
    for (const directive of entry.split(";")) {
      const trimmed = directive.trim();
      // The "for" directive name is case-insensitive (RFC 7239 §4).
      if (!/^for\s*=/i.test(trimmed)) continue;

      // Extract the value after the first "=".
      let forValue = trimmed.slice(trimmed.indexOf("=") + 1).trim();

      // Strip surrounding double quotes.
      if (forValue.startsWith('"') && forValue.endsWith('"')) {
        forValue = forValue.slice(1, -1);
      }

      // Handle IPv6 address literals in square brackets:
      //   "[2001:db8::1]" or "[2001:db8::1]:4711"
      if (forValue.startsWith("[")) {
        const closingBracket = forValue.indexOf("]");
        if (closingBracket !== -1) {
          forValue = forValue.slice(1, closingBracket);
        }
      } else {
        // Strip optional port from IPv4: "1.2.3.4:1234" → "1.2.3.4".
        // Bare IPv6 addresses have multiple colons — don't strip those.
        const colonCount = (forValue.match(/:/g) ?? []).length;
        if (colonCount === 1) {
          forValue = (forValue.split(":")[0] ?? forValue).trim();
        }
      }

      if (forValue) candidates.push(forValue);
      break; // Only one "for=" per hop entry is meaningful.
    }
  }

  return candidates;
}

function extractIPs(
  headerName: string,
  rawValue: string | string[] | undefined,
): string[] {
  if (!rawValue) return [];
  const value = Array.isArray(rawValue) ? rawValue.join(",") : rawValue;

  if (headerName === "forwarded") {
    return parseForwardedHeader(value);
  }

  return value
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
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
