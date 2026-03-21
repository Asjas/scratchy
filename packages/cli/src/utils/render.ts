import Handlebars from "handlebars";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TEMPLATES_DIR = join(import.meta.dirname, "..", "templates");

/** Cache of compiled template functions. */
const compiled = new Map<string, Handlebars.TemplateDelegate>();

/**
 * Reads and compiles a Handlebars template file from the templates directory.
 * Templates are cached after the first compile.
 */
function getTemplate(templateFile: string): Handlebars.TemplateDelegate {
  const cached = compiled.get(templateFile);
  if (cached) {
    return cached;
  }

  const filePath = join(TEMPLATES_DIR, templateFile);
  const source = readFileSync(filePath, "utf8");
  const template = Handlebars.compile(source);
  compiled.set(templateFile, template);
  return template;
}

/**
 * Renders a Handlebars template file with the given context.
 * @param templateFile - Filename relative to the `templates/` directory.
 * @param context - Data to pass to the template.
 * @returns The rendered string.
 */
export function renderTemplate(
  templateFile: string,
  context: Record<string, unknown>,
): string {
  const template = getTemplate(templateFile);
  return template(context);
}

/**
 * Clears the compiled template cache. Useful for testing.
 */
export function clearTemplateCache(): void {
  compiled.clear();
}
