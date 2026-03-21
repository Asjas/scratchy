import type { IncomingHttpHeaders } from "node:http";

/**
 * A request-like object with a `headers` property compatible with Node.js
 * `IncomingHttpHeaders`.
 */
export interface RequestLike {
  headers: IncomingHttpHeaders;
}

function getHeader(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const value = headers[name];
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

// ---------------------------------------------------------------------------
// Sec-Fetch-Dest
// ---------------------------------------------------------------------------

export const FetchDestValues = [
  "audio",
  "audioworklet",
  "document",
  "embed",
  "empty",
  "font",
  "frame",
  "iframe",
  "image",
  "manifest",
  "object",
  "paintworklet",
  "report",
  "script",
  "serviceworker",
  "sharedworker",
  "style",
  "track",
  "video",
  "worker",
  "xslt",
] as const;

export type FetchDest = (typeof FetchDestValues)[number];

/**
 * Return the value of the `Sec-Fetch-Dest` header, or `null` when absent or
 * unrecognised.
 *
 * @example
 * fastify.get("/resource", (request, reply) => {
 *   const dest = fetchDest(request);
 *   if (dest === "document") {
 *     // full-page navigation
 *   }
 * });
 */
export function fetchDest(request: RequestLike): FetchDest | null {
  const header = getHeader(request.headers, "sec-fetch-dest");
  if (!header) return null;
  return (FetchDestValues as readonly string[]).includes(header)
    ? (header as FetchDest)
    : null;
}

// ---------------------------------------------------------------------------
// Sec-Fetch-Mode
// ---------------------------------------------------------------------------

export const FetchModeValues = [
  "cors",
  "navigate",
  "no-cors",
  "same-origin",
  "websocket",
] as const;

export type FetchMode = (typeof FetchModeValues)[number];

/**
 * Return the value of the `Sec-Fetch-Mode` header, or `null` when absent or
 * unrecognised.
 *
 * @example
 * fastify.get("/resource", (request, reply) => {
 *   const mode = fetchMode(request);
 * });
 */
export function fetchMode(request: RequestLike): FetchMode | null {
  const header = getHeader(request.headers, "sec-fetch-mode");
  if (!header) return null;
  return (FetchModeValues as readonly string[]).includes(header)
    ? (header as FetchMode)
    : null;
}

// ---------------------------------------------------------------------------
// Sec-Fetch-Site
// ---------------------------------------------------------------------------

export const FetchSiteValues = [
  "cross-site",
  "none",
  "same-origin",
  "same-site",
] as const;

export type FetchSite = (typeof FetchSiteValues)[number];

/**
 * Return the value of the `Sec-Fetch-Site` header, or `null` when absent or
 * unrecognised.
 *
 * @example
 * fastify.get("/resource", (request, reply) => {
 *   const site = fetchSite(request);
 *   if (site === "cross-site") { ... }
 * });
 */
export function fetchSite(request: RequestLike): FetchSite | null {
  const header = getHeader(request.headers, "sec-fetch-site");
  if (!header) return null;
  return (FetchSiteValues as readonly string[]).includes(header)
    ? (header as FetchSite)
    : null;
}

// ---------------------------------------------------------------------------
// Sec-Fetch-User
// ---------------------------------------------------------------------------

/**
 * Return `true` when the `Sec-Fetch-User` header indicates that the request
 * was triggered directly by a user interaction (the header value is `?1`).
 *
 * @example
 * fastify.get("/resource", (request, reply) => {
 *   const initiated = isUserInitiated(request);
 * });
 */
export function isUserInitiated(request: RequestLike): boolean {
  return getHeader(request.headers, "sec-fetch-user") === "?1";
}
