/**
 * Options for customizing the HTML shell template.
 */
export interface ShellOptions {
  /** Language attribute for the `<html>` element (default: `"en"`). */
  lang?: string;
  /**
   * Extra attributes to add to the `<html>` element.
   * Values are automatically escaped to prevent attribute injection.
   */
  htmlAttributes?: Record<string, string>;
  /**
   * Extra attributes to add to the `<body>` element.
   * Values are automatically escaped to prevent attribute injection.
   */
  bodyAttributes?: Record<string, string>;
}

/**
 * Escapes a string for safe inclusion in an HTML attribute value.
 */
function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Serializes a Record of attribute name/value pairs into an HTML
 * attribute string. Values are escaped; names are validated to
 * contain only safe characters.
 */
function formatAttributes(attrs: Record<string, string>): string {
  const parts: string[] = [];

  for (const [name, value] of Object.entries(attrs)) {
    if (!/^[a-z][a-z0-9-]*$/i.test(name)) {
      throw new Error(`Invalid HTML attribute name: "${name}"`);
    }
    parts.push(`${name}="${escapeAttribute(value)}"`);
  }

  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

/**
 * Wraps rendered body and head content in a minimal HTML shell.
 *
 * Produces a `<!DOCTYPE html>` document with a viewport meta tag,
 * charset declaration, and slots for head/body content. Attribute
 * values are HTML-escaped to prevent injection.
 */
export function wrapInShell(
  body: string,
  head = "",
  options: ShellOptions = {},
): string {
  const lang = escapeAttribute(options.lang ?? "en");
  const htmlAttrs = options.htmlAttributes
    ? formatAttributes(options.htmlAttributes)
    : "";
  const bodyAttrs = options.bodyAttributes
    ? formatAttributes(options.bodyAttributes)
    : "";

  return `<!DOCTYPE html>
<html lang="${lang}"${htmlAttrs}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
</head>
<body${bodyAttrs}>
${body}
</body>
</html>`;
}
