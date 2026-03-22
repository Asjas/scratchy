const DEFAULT_REDIRECT = "/";

/**
 * Validate and return a safe redirect path. A redirect is considered safe
 * when it is a pathname within the same application – i.e. it starts with
 * `/` but not `//` or `/\`, and does not contain `..`.
 *
 * The candidate path is URL-decoded before all safety checks so that
 * percent-encoded bypass attempts (e.g. `%2e%2e`, `%2F%2F`) are caught.
 * If decoding fails (malformed percent-encoding), the default redirect is
 * returned immediately.
 *
 * Use this whenever the redirect destination comes from user-supplied input
 * (e.g. a `redirectTo` query-string parameter) to prevent open-redirect
 * vulnerabilities.
 *
 * @param to - The candidate redirect path.
 * @param defaultRedirect - Fallback path when `to` is unsafe. Defaults to `"/"`.
 *
 * @example
 * fastify.get("/login", (request, reply) => {
 *   const redirectTo = (request.query as { redirectTo?: string }).redirectTo;
 *   reply.redirect(safeRedirect(redirectTo, "/dashboard"));
 * });
 */
export function safeRedirect(
  to: FormDataEntryValue | string | null | undefined,
  defaultRedirect: string = DEFAULT_REDIRECT,
): string {
  if (!to || typeof to !== "string") return defaultRedirect;

  // Decode percent-encoded characters before validation so that bypass
  // attempts like "%2e%2e" or "%2F%2F" are caught by the checks below.
  let decoded: string;
  try {
    decoded = decodeURIComponent(to);
  } catch {
    return defaultRedirect;
  }

  const trimmed = decoded.trim();

  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    trimmed.includes("..")
  ) {
    return defaultRedirect;
  }

  return trimmed;
}
