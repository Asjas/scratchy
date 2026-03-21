import type { IncomingHttpHeaders } from "node:http";

/**
 * A request-like object with a `headers` property compatible with Node.js
 * `IncomingHttpHeaders`.
 */
export interface RequestLike {
  headers: IncomingHttpHeaders;
}

/**
 * Ordered list of locale strings, or `undefined` when the header is absent or
 * contains no supported locales.
 */
export type Locales = string[] | undefined;

/**
 * Parse a single locale tag from the Accept-Language header.
 * Returns `{ locale, quality }` where quality defaults to 1.0.
 */
function parseLocaleTag(tag: string): { locale: string; quality: number } {
  const [locale, qParam] = tag.trim().split(";");
  const quality = qParam ? parseFloat(qParam.trim().replace(/^q=/i, "")) : 1.0;
  return { locale: (locale ?? "").trim(), quality };
}

/**
 * Get the client's preferred locales from the `Accept-Language` header,
 * sorted by quality value (highest quality first). Returns `undefined` when
 * the header is absent or contains no recognised locales.
 *
 * Accepts either a Fastify `FastifyRequest` or any object with a `headers`
 * property compatible with Node.js `IncomingHttpHeaders`.
 *
 * @example
 * fastify.get("/", (request, reply) => {
 *   const locales = getClientLocales(request);
 *   const date = new Date().toLocaleDateString(locales, {
 *     year: "numeric",
 *     month: "long",
 *   });
 *   reply.send({ date });
 * });
 */
export function getClientLocales(request: RequestLike): Locales {
  const raw = request.headers["accept-language"];
  if (!raw) return undefined;

  const header = Array.isArray(raw) ? raw.join(",") : raw;

  const parsed = header
    .split(",")
    .map(parseLocaleTag)
    .filter(({ locale, quality }) => {
      if (!locale || locale === "*") return false;
      if (Number.isNaN(quality)) return false;
      if (quality <= 0 || quality > 1) return false;
      // Validate that the locale is supported by the Intl API
      try {
        return Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0;
      } catch {
        return false;
      }
    })
    .sort((a, b) => b.quality - a.quality)
    .map(({ locale }) => locale);

  return parsed.length > 0 ? parsed : undefined;
}
