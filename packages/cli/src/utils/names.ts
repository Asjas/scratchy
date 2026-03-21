/**
 * Converts a string to PascalCase.
 * Handles kebab-case, snake_case, camelCase, and space-separated strings.
 * @example "my-post" → "MyPost", "myPost" → "MyPost"
 */
export function toPascalCase(name: string): string {
  return name
    .replace(/[-_\s]+(.)/g, (_, char: string) => char.toUpperCase())
    .replace(/^(.)/, (_, char: string) => char.toUpperCase());
}

/**
 * Converts a string to kebab-case.
 * Handles PascalCase, camelCase, snake_case, and space-separated strings.
 * @example "MyPost" → "my-post", "myPost" → "my-post"
 */
export function toKebabCase(name: string): string {
  return name
    .replace(/([A-Z])/g, (_, char: string) => `-${char.toLowerCase()}`)
    .replace(/^-/, "")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

/**
 * Converts a string to camelCase.
 * @example "my-post" → "myPost", "MyPost" → "myPost"
 */
export function toCamelCase(name: string): string {
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Converts a string to snake_case.
 * @example "MyPost" → "my_post", "myPost" → "my_post"
 */
export function toSnakeCase(name: string): string {
  return toKebabCase(name).replace(/-/g, "_");
}

/**
 * Pluralizes a name by appending 's'. Handles simple cases like
 * "post" → "posts", "category" → "categorys" (intentionally simple).
 */
export function toPlural(name: string): string {
  return `${name}s`;
}

/**
 * Parses a column definition string into an array of column objects.
 * Format: "title:text,published:boolean,age:integer"
 */
export interface ColumnDefinition {
  name: string;
  camelName: string;
  type: string;
  drizzleType: string;
  zodType: string;
}

const TYPE_MAP: Record<string, string> = {
  text: "text",
  string: "text",
  varchar: "varchar",
  boolean: "boolean",
  bool: "boolean",
  integer: "integer",
  int: "integer",
  number: "integer",
  numeric: "numeric",
  decimal: "numeric",
  real: "real",
  float: "real",
  timestamp: "timestamp",
  date: "date",
  json: "json",
  jsonb: "jsonb",
  bigint: "bigint",
  uuid: "uuid",
};

const ZOD_TYPE_MAP: Record<string, string> = {
  text: "z.string()",
  varchar: "z.string()",
  boolean: "z.boolean()",
  integer: "z.number().int()",
  numeric: "z.number()",
  real: "z.number()",
  timestamp: "z.string()",
  date: "z.string()",
  json: "z.unknown()",
  jsonb: "z.unknown()",
  bigint: "z.bigint()",
  uuid: "z.string().uuid()",
};

export function parseColumns(columns: string): ColumnDefinition[] {
  if (!columns.trim()) {
    return [];
  }

  return columns.split(",").map((col) => {
    const [rawName, rawType = "text"] = col.trim().split(":");
    const name = (rawName ?? "").trim();
    const type = (rawType ?? "text").trim().toLowerCase();
    const drizzleType = TYPE_MAP[type] ?? "text";
    const zodType = ZOD_TYPE_MAP[drizzleType] ?? "z.string()";

    return {
      name,
      camelName: toCamelCase(name),
      type,
      drizzleType,
      zodType,
    };
  });
}
