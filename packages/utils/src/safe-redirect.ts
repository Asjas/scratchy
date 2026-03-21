const DEFAULT_REDIRECT = "/";

/**
 * Validate and return a safe redirect path. A redirect is considered safe
 * when it is a pathname within the same application – i.e. it starts with
 * `/` but not `//` or `/\`, and does not contain `..`.
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

  const trimmed = to.trim();

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
