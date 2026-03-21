/**
 * Options for customizing the HTML shell template.
 */
export interface ShellOptions {
  /** Language attribute for the `<html>` element (default: `"en"`). */
  lang?: string;
  /** Extra attributes to add to the `<html>` element. */
  htmlAttributes?: string;
  /** Extra attributes to add to the `<body>` element. */
  bodyAttributes?: string;
}

/**
 * Wraps rendered body and head content in a minimal HTML shell.
 *
 * Produces a `<!DOCTYPE html>` document with a viewport meta tag,
 * charset declaration, and slots for head/body content.
 */
export function wrapInShell(
  body: string,
  head = "",
  options: ShellOptions = {},
): string {
  const lang = options.lang ?? "en";
  const htmlAttrs = options.htmlAttributes ? ` ${options.htmlAttributes}` : "";
  const bodyAttrs = options.bodyAttributes ? ` ${options.bodyAttributes}` : "";

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
