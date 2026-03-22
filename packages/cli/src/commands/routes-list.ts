import { defineCommand } from "citty";
import { consola } from "consola";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

interface RouteEntry {
  method: string;
  path: string;
  file: string;
}

/** Recursively collect all *.ts files under a directory. */
function collectFiles(dir: string): string[] {
  let results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(collectFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Derive a URL path from a file path relative to the routes root.
 * e.g. "health/index.ts"        → "/health"
 *      "external/api/v1/index.ts" → "/external/api/v1"
 */
function fileToRoutePath(routesDir: string, filePath: string): string {
  const rel = relative(routesDir, filePath);
  const normalizedRel = rel.replace(/\\/g, "/");
  const parts = normalizedRel.replace(/\.ts$/, "").split("/");
  const cleaned = parts.filter((p) => p !== "index");
  return "/" + (cleaned.length > 0 ? cleaned.join("/") : "");
}

/**
 * Parse a TypeScript source file and extract Fastify HTTP method registrations.
 * Returns an array of HTTP methods found (e.g. ["get", "post"]).
 */
function extractMethods(source: string): HttpMethod[] {
  const found = new Set<HttpMethod>();
  const pattern = /fastify\.(get|post|put|patch|delete|head|options)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const method = match[1] as HttpMethod;
    if (HTTP_METHODS.includes(method)) {
      found.add(method);
    }
  }
  return Array.from(found);
}

/**
 * Parse a tRPC router file and extract exported procedure names.
 * Returns an array of procedure keys found (e.g. ["getById", "list"]).
 */
function extractTrpcProcedures(source: string): string[] {
  const found: string[] = [];
  // Match exported procedure keys in an object, tolerant of indentation and quoted keys
  const pattern =
    /^\s*(?:(["'`])([^"'`]+)\1|(\w+))\s*:\s+(?:publicProcedure|protectedProcedure|t\.procedure)/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const proc = match[2] ?? match[3];
    if (proc !== undefined) {
      found.push(proc);
    }
  }
  return found;
}

export const routesListCommand = defineCommand({
  meta: {
    name: "routes:list",
    description: "List all registered Fastify REST routes and tRPC procedures",
  },
  args: {
    cwd: {
      type: "string",
      description: "Working directory (defaults to process.cwd())",
      default: "",
    },
  },
  run({ args }) {
    const cwd = args.cwd || process.cwd();
    const routesDir = join(cwd, "src", "routes");
    const routersDir = join(cwd, "src", "routers");

    const restRoutes: RouteEntry[] = [];
    const trpcRoutes: RouteEntry[] = [];

    // --- Fastify REST routes ---
    const routeFiles = collectFiles(routesDir);
    for (const file of routeFiles) {
      const source = readFileSync(file, "utf8");
      const methods = extractMethods(source);
      const routePath = fileToRoutePath(routesDir, file);

      if (methods.length > 0) {
        for (const method of methods) {
          restRoutes.push({
            method: method.toUpperCase(),
            path: routePath,
            file: relative(cwd, file),
          });
        }
      } else {
        // Include even if no explicit method found (may use dynamic registration)
        restRoutes.push({
          method: "*",
          path: routePath,
          file: relative(cwd, file),
        });
      }
    }

    // --- tRPC procedures ---
    const routerFiles = collectFiles(routersDir).filter(
      (f) => !basename(f).startsWith("index"),
    );
    for (const file of routerFiles) {
      const source = readFileSync(file, "utf8");
      const procedures = extractTrpcProcedures(source);
      const rel = relative(routersDir, file);
      // e.g. "posts/queries.ts" → "posts"
      const domain = rel.split("/")[0];
      if (domain === undefined) continue;
      const fileBase = basename(file, ".ts"); // queries | mutations

      if (procedures.length > 0) {
        for (const proc of procedures) {
          trpcRoutes.push({
            method: fileBase === "mutations" ? "MUTATION" : "QUERY",
            path: `/trpc/${domain}.${proc}`,
            file: relative(cwd, file),
          });
        }
      }
    }

    // --- Print results ---
    if (restRoutes.length === 0 && trpcRoutes.length === 0) {
      consola.warn(
        "No routes found. Make sure src/routes/ and src/routers/ exist.",
      );
      return;
    }

    if (restRoutes.length > 0) {
      consola.log("\n── REST Routes ─────────────────────────────────────────");
      const methodWidth = Math.max(
        ...restRoutes.map((r) => r.method.length),
        6,
      );
      for (const r of restRoutes) {
        consola.log(
          `  ${r.method.padEnd(methodWidth)}  ${r.path.padEnd(40)}  ${r.file}`,
        );
      }
    }

    if (trpcRoutes.length > 0) {
      consola.log(
        "\n── tRPC Procedures ──────────────────────────────────────",
      );
      const methodWidth = Math.max(
        ...trpcRoutes.map((r) => r.method.length),
        8,
      );
      for (const r of trpcRoutes) {
        consola.log(
          `  ${r.method.padEnd(methodWidth)}  ${r.path.padEnd(40)}  ${r.file}`,
        );
      }
    }

    consola.log("");
    consola.success(
      `Found ${restRoutes.length} REST route(s) and ${trpcRoutes.length} tRPC procedure(s)`,
    );
  },
});
