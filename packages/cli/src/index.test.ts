import {
  parseColumns,
  toCamelCase,
  toKebabCase,
  toPascalCase,
  toPlural,
  toSnakeCase,
  uniqueColumnDrizzleTypes,
} from "./utils/names.js";
import { clearTemplateCache, renderTemplate } from "./utils/render.js";
import { beforeEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Name utilities
// ---------------------------------------------------------------------------

describe("toPascalCase", () => {
  it("converts kebab-case to PascalCase", () => {
    expect(toPascalCase("my-post")).toBe("MyPost");
  });

  it("converts snake_case to PascalCase", () => {
    expect(toPascalCase("my_post")).toBe("MyPost");
  });

  it("converts camelCase to PascalCase", () => {
    expect(toPascalCase("myPost")).toBe("MyPost");
  });

  it("converts space-separated to PascalCase", () => {
    expect(toPascalCase("my post")).toBe("MyPost");
  });

  it("leaves PascalCase unchanged", () => {
    expect(toPascalCase("MyPost")).toBe("MyPost");
  });

  it("handles single word", () => {
    expect(toPascalCase("post")).toBe("Post");
  });
});

describe("toKebabCase", () => {
  it("converts PascalCase to kebab-case", () => {
    expect(toKebabCase("MyPost")).toBe("my-post");
  });

  it("converts camelCase to kebab-case", () => {
    expect(toKebabCase("myPost")).toBe("my-post");
  });

  it("converts snake_case to kebab-case", () => {
    expect(toKebabCase("my_post")).toBe("my-post");
  });

  it("leaves kebab-case unchanged", () => {
    expect(toKebabCase("my-post")).toBe("my-post");
  });

  it("handles single word", () => {
    expect(toKebabCase("post")).toBe("post");
  });
});

describe("toCamelCase", () => {
  it("converts kebab-case to camelCase", () => {
    expect(toCamelCase("my-post")).toBe("myPost");
  });

  it("converts PascalCase to camelCase", () => {
    expect(toCamelCase("MyPost")).toBe("myPost");
  });

  it("converts snake_case to camelCase", () => {
    expect(toCamelCase("my_post")).toBe("myPost");
  });

  it("handles single word", () => {
    expect(toCamelCase("post")).toBe("post");
  });
});

describe("toSnakeCase", () => {
  it("converts PascalCase to snake_case", () => {
    expect(toSnakeCase("MyPost")).toBe("my_post");
  });

  it("converts kebab-case to snake_case", () => {
    expect(toSnakeCase("my-post")).toBe("my_post");
  });

  it("leaves snake_case unchanged", () => {
    expect(toSnakeCase("my_post")).toBe("my_post");
  });
});

describe("toPlural", () => {
  it("appends s to the name", () => {
    expect(toPlural("post")).toBe("posts");
  });

  it("handles camelCase", () => {
    expect(toPlural("blogPost")).toBe("blogPosts");
  });
});

// ---------------------------------------------------------------------------
// Column parsing
// ---------------------------------------------------------------------------

describe("parseColumns", () => {
  it("parses a single column", () => {
    const cols = parseColumns("title:text");
    expect(cols).toHaveLength(1);
    expect(cols[0]).toMatchObject({
      name: "title",
      type: "text",
      drizzleType: "text",
      zodType: "z.string()",
    });
  });

  it("parses multiple columns", () => {
    const cols = parseColumns("title:text,published:boolean,age:integer");
    expect(cols).toHaveLength(3);
    expect(cols[0]?.name).toBe("title");
    expect(cols[1]?.name).toBe("published");
    expect(cols[2]?.name).toBe("age");
  });

  it("maps type aliases to Drizzle types", () => {
    const cols = parseColumns("active:bool,count:int,score:float,data:jsonb");
    expect(cols[0]?.drizzleType).toBe("boolean");
    expect(cols[1]?.drizzleType).toBe("integer");
    expect(cols[2]?.drizzleType).toBe("real");
    expect(cols[3]?.drizzleType).toBe("jsonb");
  });

  it("defaults to text type when type is omitted", () => {
    const cols = parseColumns("title");
    expect(cols[0]?.drizzleType).toBe("text");
  });

  it("returns an empty array for an empty string", () => {
    expect(parseColumns("")).toHaveLength(0);
    expect(parseColumns("   ")).toHaveLength(0);
  });

  it("includes camelName for each column", () => {
    const cols = parseColumns("created_at:timestamp");
    expect(cols[0]?.camelName).toBe("createdAt");
  });

  it("maps types to appropriate Zod validators", () => {
    const cols = parseColumns("active:boolean,count:integer,score:numeric");
    expect(cols[0]?.zodType).toBe("z.boolean()");
    expect(cols[1]?.zodType).toBe("z.number().int()");
    expect(cols[2]?.zodType).toBe("z.number()");
  });

  it("throws an error for an empty column name (trailing comma)", () => {
    expect(() => parseColumns("title:text,")).toThrow(/must not be empty/);
  });

  it("throws an error for a column name starting with a digit", () => {
    expect(() => parseColumns("1title:text")).toThrow(/valid identifier/);
  });

  it("throws an error for a column name containing invalid characters", () => {
    expect(() => parseColumns("my-col:text")).toThrow(/valid identifier/);
  });
});

// ---------------------------------------------------------------------------
// uniqueColumnDrizzleTypes
// ---------------------------------------------------------------------------

describe("uniqueColumnDrizzleTypes", () => {
  it("returns empty array when there are no columns", () => {
    expect(uniqueColumnDrizzleTypes([])).toEqual([]);
  });

  it("excludes text since it is always imported", () => {
    const cols = parseColumns("title:text");
    expect(uniqueColumnDrizzleTypes(cols)).toEqual([]);
  });

  it("returns unique non-text types in sorted order", () => {
    const cols = parseColumns("published:boolean,age:integer,score:numeric");
    expect(uniqueColumnDrizzleTypes(cols)).toEqual([
      "boolean",
      "integer",
      "numeric",
    ]);
  });

  it("deduplicates repeated types", () => {
    const cols = parseColumns("active:boolean,verified:boolean");
    expect(uniqueColumnDrizzleTypes(cols)).toEqual(["boolean"]);
  });

  it("does not include text even when mixed with other types", () => {
    const cols = parseColumns("title:text,published:boolean");
    expect(uniqueColumnDrizzleTypes(cols)).toEqual(["boolean"]);
  });
});

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------

describe("renderTemplate (model.ts.hbs)", () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  it("renders model with PascalCase name", () => {
    const content = renderTemplate("model.ts.hbs", {
      pascalName: "Post",
      camelName: "post",
      kebabName: "post",
      snakeName: "post",
      columns: [],
      uniqueColumnTypes: [],
    });

    expect(content).toContain("export type Post = typeof post.$inferSelect");
    expect(content).toContain("export type NewPost = typeof post.$inferInsert");
    expect(content).toContain("mySchema.table(");
    expect(content).toContain('"post"');
    expect(content).toContain("...timestamps");
    // relations must be a value import, not type-only
    expect(content).toContain("import { relations }");
    expect(content).not.toContain("import type { relations }");
  });

  it("renders model columns", () => {
    const columns = parseColumns("title:text,published:boolean");
    const content = renderTemplate("model.ts.hbs", {
      pascalName: "Post",
      camelName: "post",
      kebabName: "post",
      snakeName: "post",
      columns,
      uniqueColumnTypes: uniqueColumnDrizzleTypes(columns),
    });

    expect(content).toContain("title: text()");
    expect(content).toContain("published: boolean()");
    expect(content).toContain(".notNull()");
  });

  it("deduplicates drizzle import when a text column is present alongside text", () => {
    // Two text columns + a boolean: should generate `import { index, text, boolean }`, not `{ index, text, text, boolean }`
    const columns = parseColumns("title:text,slug:text,active:boolean");
    const content = renderTemplate("model.ts.hbs", {
      pascalName: "Post",
      camelName: "post",
      kebabName: "post",
      snakeName: "post",
      columns,
      uniqueColumnTypes: uniqueColumnDrizzleTypes(columns),
    });

    // boolean appears once, text appears once (in the base import)
    const importLine =
      content.split("\n").find((l) => l.includes("drizzle-orm/pg-core")) ?? "";
    const occurrences = (importLine.match(/\bboolean\b/g) ?? []).length;
    expect(occurrences).toBe(1);
    // text must NOT be duplicated
    const textOccurrences = (importLine.match(/\btext\b/g) ?? []).length;
    expect(textOccurrences).toBe(1);
  });

  it("imports drizzle column types used by columns", () => {
    const columns = parseColumns("title:text");
    const content = renderTemplate("model.ts.hbs", {
      pascalName: "Post",
      camelName: "post",
      kebabName: "post",
      snakeName: "post",
      columns,
      uniqueColumnTypes: uniqueColumnDrizzleTypes(columns),
    });

    expect(content).toContain("text");
    expect(content).toContain("drizzle-orm/pg-core");
  });

  it("returns cached template on second call (cache hit path)", () => {
    const context = {
      pascalName: "Post",
      camelName: "post",
      kebabName: "post",
      snakeName: "post",
      columns: [],
      uniqueColumnTypes: [],
    };

    // First call compiles the template
    const first = renderTemplate("model.ts.hbs", context);
    // Second call uses the cache
    const second = renderTemplate("model.ts.hbs", context);

    expect(first).toBe(second);
  });
});

describe("renderTemplate (queries.ts.hbs)", () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  it("renders findById and findAll prepared statements", () => {
    const content = renderTemplate("queries.ts.hbs", {
      pascalName: "Post",
      camelName: "post",
      kebabName: "post",
      snakeName: "post",
    });

    expect(content).toContain("findPostById");
    expect(content).toContain("findAllPosts");
    expect(content).toContain(".prepare(");
    expect(content).toContain("find_post_by_id");
    // findAll should accept limit/offset for DB-level pagination
    expect(content).toContain('.placeholder("limit")');
    expect(content).toContain('.placeholder("offset")');
  });

  it("exports correct type aliases", () => {
    const content = renderTemplate("queries.ts.hbs", {
      pascalName: "Post",
      camelName: "post",
      kebabName: "post",
      snakeName: "post",
    });

    expect(content).toContain("export type PostById");
    expect(content).toContain("export type AllPosts");
  });
});

describe("renderTemplate (mutations.ts.hbs)", () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  it("renders create, update, and delete functions", () => {
    const content = renderTemplate("mutations.ts.hbs", {
      pascalName: "Post",
      camelName: "post",
      kebabName: "post",
      snakeName: "post",
    });

    expect(content).toContain("createPost");
    expect(content).toContain("updatePost");
    expect(content).toContain("deletePost");
  });

  it("uses ulid() for ID generation", () => {
    const content = renderTemplate("mutations.ts.hbs", {
      pascalName: "Post",
      camelName: "post",
      kebabName: "post",
      snakeName: "post",
    });

    expect(content).toContain("ulid()");
    expect(content).toContain('from "ulid"');
  });
});

describe("renderTemplate (router-queries.ts.hbs)", () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  it("renders getById and list procedures", () => {
    const content = renderTemplate("router-queries.ts.hbs", {
      pascalName: "Post",
      camelName: "post",
      kebabName: "post",
      snakeName: "post",
      columns: [],
    });

    expect(content).toContain("postQueries");
    expect(content).toContain("getById");
    expect(content).toContain("list");
    expect(content).toContain("protectedProcedure");
  });
});

describe("renderTemplate (router-mutations.ts.hbs)", () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  it("renders create, update, and delete mutations", () => {
    const content = renderTemplate("router-mutations.ts.hbs", {
      pascalName: "Post",
      camelName: "post",
      kebabName: "post",
      snakeName: "post",
      columns: [],
    });

    expect(content).toContain("postMutations");
    expect(content).toContain("create:");
    expect(content).toContain("update:");
    expect(content).toContain("delete:");
  });

  it("create and update mutations do not use async (no await needed)", () => {
    const content = renderTemplate("router-mutations.ts.hbs", {
      pascalName: "Post",
      camelName: "post",
      kebabName: "post",
      snakeName: "post",
      columns: [],
    });

    // create and update simply return the promise — no async keyword
    expect(content).toContain(".mutation(({ input }) => {");
    // delete does use await, so async is correct there
    expect(content).toContain(".mutation(async ({ input }) => {");
  });

  it("renders column inputs when columns are provided", () => {
    const cols = parseColumns("title:text,published:boolean");
    const content = renderTemplate("router-mutations.ts.hbs", {
      pascalName: "Post",
      camelName: "post",
      kebabName: "post",
      snakeName: "post",
      columns: cols,
    });

    expect(content).toContain("title");
    expect(content).toContain("z.string()");
    expect(content).toContain("z.boolean()");
  });
});

describe("renderTemplate (route.ts.hbs)", () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  it("renders a Fastify route with CORS", () => {
    const content = renderTemplate("route.ts.hbs", {
      routePath: "external/api/v1/products",
    });

    expect(content).toContain("@fastify/cors");
    expect(content).toContain("external/api/v1/products");
    expect(content).toContain("FastifyPluginAsync");
  });
});

describe("renderTemplate (component-qwik.tsx.hbs)", () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  it("renders a Qwik component with the correct name", () => {
    const content = renderTemplate("component-qwik.tsx.hbs", {
      pascalName: "UserCard",
      camelName: "userCard",
      kebabName: "user-card",
    });

    expect(content).toContain("export const UserCard = component$");
    expect(content).toContain("interface UserCardProps");
    expect(content).toContain("@builder.io/qwik");
  });
});

describe("renderTemplate (component-react.tsx.hbs)", () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  it("renders a React component with qwikify$ wrapper", () => {
    const content = renderTemplate("component-react.tsx.hbs", {
      pascalName: "Chart",
      camelName: "chart",
      kebabName: "chart",
    });

    expect(content).toContain("@jsxImportSource react");
    expect(content).toContain("qwikify$");
    expect(content).toContain("export const QChart = qwikify$(Chart)");
    expect(content).toContain("function Chart(");
  });
});

describe("renderTemplate (page.tsx.hbs)", () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  it("renders a Qwik page with routeLoader$", () => {
    const content = renderTemplate("page.tsx.hbs", {
      pascalName: "BlogPost",
      camelName: "blogPost",
      kebabName: "blog-post",
    });

    expect(content).toContain("routeLoader$");
    expect(content).toContain("useBlogPostData");
    expect(content).toContain("export default component$");
    expect(content).toContain("@builder.io/qwik-city");
  });
});

describe("renderTemplate (plugin.ts.hbs)", () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  it("renders a Fastify plugin with onClose hook", () => {
    const content = renderTemplate("plugin.ts.hbs", {
      pascalName: "Cache",
      camelName: "cache",
      kebabName: "cache",
    });

    expect(content).toContain("cachePlugin");
    expect(content).toContain("fp(");
    expect(content).toContain("onClose");
    expect(content).toContain("fastify-plugin");
  });
});

// ---------------------------------------------------------------------------
// File path conventions (kebab-case)
// ---------------------------------------------------------------------------

describe("renderTemplate (migration.sql.hbs)", () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  it("renders a migration with name and timestamp header", () => {
    const content = renderTemplate("migration.sql.hbs", {
      name: "add_role_to_users",
      timestamp: "20260101120000",
    });

    expect(content).toContain("Migration: add_role_to_users");
    expect(content).toContain("Generated: 20260101120000");
    expect(content).toContain("drizzle-kit generate");
  });
});

describe("renderTemplate (seed.ts.hbs)", () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  it("renders a generic seed file without a model", () => {
    const content = renderTemplate("seed.ts.hbs", {
      pascalName: "InitialData",
      camelName: "initialData",
      kebabName: "initial-data",
      model: "",
      modelPascalName: "",
      modelCamelName: "",
      modelKebabName: "",
    });

    expect(content).toContain("seedInitialData");
    expect(content).toContain("~/db/index.js");
    expect(content).toContain("process.exit(0)");
    expect(content).toContain("pathToFileURL");
    expect(content).toContain("import.meta.url");
  });

  it("renders a seed file with a model import", () => {
    const content = renderTemplate("seed.ts.hbs", {
      pascalName: "Users",
      camelName: "users",
      kebabName: "users",
      model: "User",
      modelPascalName: "User",
      modelCamelName: "user",
      modelKebabName: "user",
    });

    expect(content).toContain("seedUsers");
    expect(content).toContain('import { user } from "~/db/schema/user.js"');
    expect(content).toContain("ulid");
    expect(content).toContain("db.insert(user)");
  });
});

describe("renderTemplate (test.ts.hbs)", () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  it("renders a Vitest test scaffold", () => {
    const content = renderTemplate("test.ts.hbs", {
      name: "queries",
    });

    expect(content).toContain('from "vitest"');
    expect(content).toContain('describe("queries"');
    expect(content).toContain("expect(true).toBe(true)");
  });
});

// ---------------------------------------------------------------------------
// File path conventions (kebab-case)
// ---------------------------------------------------------------------------

describe("file path conventions", () => {
  it("model names use kebab-case for file paths", () => {
    const kebabName = toKebabCase("BlogPost");
    expect(kebabName).toBe("blog-post");
    // File path would be src/db/schema/blog-post.ts
    expect(`src/db/schema/${kebabName}.ts`).toBe("src/db/schema/blog-post.ts");
  });

  it("queries files use plural kebab-case names", () => {
    const kebabName = toKebabCase("BlogPost");
    expect(`src/db/queries/${kebabName}s.ts`).toBe(
      "src/db/queries/blog-posts.ts",
    );
  });

  it("router directories use kebab-case", () => {
    const kebabName = toKebabCase("BlogPost");
    expect(`src/routers/${kebabName}/queries.ts`).toBe(
      "src/routers/blog-post/queries.ts",
    );
  });

  it("component files use kebab-case", () => {
    const kebabName = toKebabCase("UserCard");
    expect(`src/client/components/qwik/${kebabName}.tsx`).toBe(
      "src/client/components/qwik/user-card.tsx",
    );
  });

  it("migration files use timestamp prefix and snake_case name", () => {
    const kebabName = toKebabCase("AddRoleToUsers").replace(/-/g, "_");
    const timestamp = "20260101120000";
    expect(`src/db/migrations/${timestamp}_${kebabName}.sql`).toBe(
      "src/db/migrations/20260101120000_add_role_to_users.sql",
    );
  });

  it("seed files use kebab-case", () => {
    const kebabName = toKebabCase("Users");
    expect(`src/db/seeds/${kebabName}.ts`).toBe("src/db/seeds/users.ts");
  });

  it("test files use kebab-case and .test.ts extension", () => {
    const path = "routers/posts/queries";
    expect(`src/${path}.test.ts`).toBe("src/routers/posts/queries.test.ts");
  });
});

// ---------------------------------------------------------------------------
// Template cache hit
// ---------------------------------------------------------------------------
