---
name: scratchy-framework
description:
  "Comprehensive guide for developing Scratchy applications — covers Fastify
  server setup, tRPC routers, Drizzle ORM, Better Auth, Qwik components, Worker
  Threads, and import/export patterns. Use for any code generation, review, or
  question about how Scratchy works."
---

# Scratchy Framework — Patterns & API Reference

## Server Setup (Fastify)

### Creating the Server

```typescript
// src/server.ts
import Fastify from "fastify";
import type { FastifyHttpOptions } from "fastify";
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type http from "node:http";

const opts: FastifyHttpOptions<http.Server> = {
  trustProxy: true,
  disableRequestLogging: true,
  requestTimeout: 60_000,
  keepAliveTimeout: 10_000,
  bodyLimit: 10 * 1024 * 1024,
  routerOptions: {
    ignoreTrailingSlash: true,
    maxParamLength: 5000,
  },
};

const server = Fastify(opts).withTypeProvider<ZodTypeProvider>();
server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);
```

### Fastify Plugins

Every plugin that decorates the Fastify instance **must** include a
`declare module "fastify"` augmentation:

```typescript
// src/plugins/app/cache.ts
import fp from "fastify-plugin";

export default fp(async function cachePlugin(fastify) {
  const cache = createCache();
  fastify.decorate("cache", cache);

  fastify.addHook("onClose", async () => {
    await cache.close();
  });
});

// TypeScript augmentation — required!
declare module "fastify" {
  interface FastifyInstance {
    cache: CacheInstance;
  }
}
```

### Plugin Registration Order

```typescript
// 1. External plugins first (helmet, CORS, rate-limit)
await server.register(import("@fastify/helmet"), {
  /* ... */
});
await server.register(import("@fastify/cors"), {
  /* ... */
});
await server.register(import("@fastify/rate-limit"), {
  max: 1000,
  timeWindow: "1 minute",
});

// 2. Database plugin
await server.register(drizzlePlugin, { connectionString: config.DATABASE_URL });

// 3. Auth plugin (must come AFTER database)
await server.register(authPlugin, { auth: createAppAuth(config, server.db) });

// 4. tRPC routes
await server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: {
    /* ... */
  },
});
```

### Request Lifecycle Hooks

```
onRequest → preParsing → preValidation → preHandler → handler → preSerialization → onSend → onResponse
```

```typescript
// Use request.log for structured logging inside handlers
fastify.get("/users/:id", async (request) => {
  request.log.info({ userId: request.params.id }, "fetching user");
});

// Use fastify.log only in plugin-level code
export default fp(async function myPlugin(fastify) {
  fastify.log.info("plugin initialized");
});
```

### Graceful Shutdown

```typescript
import closeWithGrace from "close-with-grace";

closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
  if (err) server.log.error(err, "server closing due to error");
  server.log.info({ signal }, "shutting down gracefully");
  await server.close();
});
```

---

## tRPC — Internal API Layer

### Router Initialization

```typescript
// src/router.ts
import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "~/context.js";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  sse: {
    enabled: true,
    maxDurationMs: 5 * 60 * 1000,
    ping: { enabled: true, intervalMs: 30 * 1000 },
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Auth middleware — narrows ctx.user from User | null to User
const isAuthenticated = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in",
    });
  }
  return next({ ctx: { user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(isAuthenticated);
```

### Context Creation

```typescript
// src/context.ts
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

export interface Context {
  request: CreateFastifyContextOptions["req"];
  reply: CreateFastifyContextOptions["res"];
  user: User | null;
  hasRole: (role: string) => boolean;
}

export function createContext({
  req,
  res,
}: CreateFastifyContextOptions): Context {
  const user = (req as unknown as { user?: User | null }).user ?? null;
  return {
    request: req,
    reply: res,
    user,
    hasRole: (role: string) => user?.role === role,
  };
}
```

### Router Organization

Domain-based routers with separate `queries.ts` and `mutations.ts`:

```
src/routers/
├── index.ts              # Aggregates all routers → appRouter
├── posts/
│   ├── queries.ts
│   └── mutations.ts
└── users/
    ├── queries.ts
    └── mutations.ts
```

### Query Procedure Example

```typescript
// src/routers/posts/queries.ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { findAllPosts, findPostById } from "~/db/schema/post.js";
import { protectedProcedure, publicProcedure } from "~/router.js";

export const postQueries = {
  getById: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const [post] = await findPostById.execute({ id: input.id });
      if (!post) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }
      return post;
    }),

  list: publicProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      return findAllPosts.execute();
    }),
};
```

### Mutation Procedure Example

```typescript
// src/routers/posts/mutations.ts
import { ulid } from "ulid";
import { z } from "zod";
import { protectedProcedure } from "~/router.js";

export const postMutations = {
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        content: z.string().min(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx.request.server;
      return db
        .insert(post)
        .values({
          id: ulid(),
          authorId: ctx.user.id,
          ...input,
        })
        .returning();
    }),
};
```

### Router Aggregation

```typescript
// src/routers/index.ts
import { router } from "~/router.js";
import { postMutations } from "~/routers/posts/mutations.js";
import { postQueries } from "~/routers/posts/queries.js";

export const appRouter = router({
  posts: router({ ...postQueries, ...postMutations }),
});

export type AppRouter = typeof appRouter;
```

### tRPC Client

```typescript
import { createTRPCClient, httpBatchStreamLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "~/routers/index.js";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchStreamLink({
      url: "/trpc",
      transformer: superjson,
      methodOverride: "POST",
    }),
  ],
});

// Usage
const posts = await trpc.posts.list.query({ page: 1, limit: 20 });
const newPost = await trpc.posts.create.mutate({
  title: "Hello",
  content: "World",
});
```

### tRPC Error Codes

```typescript
throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
throw new TRPCError({
  code: "UNAUTHORIZED",
  message: "Authentication required",
});
throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid input" });
throw new TRPCError({ code: "CONFLICT", message: "Resource already exists" });
throw new TRPCError({
  code: "TOO_MANY_REQUESTS",
  message: "Rate limit exceeded",
});
throw new TRPCError({
  code: "INTERNAL_SERVER_ERROR",
  message: "Something went wrong",
});
```

---

## Drizzle ORM — Data Layer

### Custom Schema Namespace

```typescript
// src/db/my-schema.ts
import { pgSchema } from "drizzle-orm/pg-core";

const schemaName = process.env.DATABASE_SCHEMA || "my_schema";
export const mySchema = pgSchema(schemaName);
```

Always use `mySchema.table()` and `mySchema.enum()` — never bare `pgTable()`.

### Column Helpers

```typescript
// src/db/schema/columns.helpers.ts
import { timestamp } from "drizzle-orm/pg-core";

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
};
```

### Table Definition Pattern

```typescript
// src/db/schema/user.ts
import { relations } from "drizzle-orm";
import { boolean, index, text } from "drizzle-orm/pg-core";
import { mySchema } from "~/db/my-schema.js";
import { timestamps } from "~/db/schema/columns.helpers.js";

// 1. Type exports
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

// 2. Enums
export const userRole = mySchema.enum("user_role", ["member", "admin"]);

// 3. Table
export const user = mySchema.table(
  "user",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().default(false).notNull(),
    image: text(),
    role: userRole().default("member").notNull(),
    ...timestamps,
  },
  (table) => [index("user_email_idx").on(table.email)],
);

// 4. Relations (same file as the table)
export const userRelations = relations(user, ({ many }) => ({
  posts: many(post, { relationName: "post_author" }),
}));
```

### Prepared Statements (Module-Scoped — CRITICAL)

```typescript
// ✅ CORRECT — top-level, compiled once
import { eq, sql } from "drizzle-orm";
import { db } from "~/db/index.js";
import { user } from "~/db/schema/user.js";

export const findUserById = db
  .select()
  .from(user)
  .where(eq(user.id, sql.placeholder("id")))
  .prepare("find_user_by_id");

// Usage:
const [found] = await findUserById.execute({ id: "some-ulid" });

// ❌ WRONG — inside a function (re-prepares on every call)
async function getUser(id: string) {
  const q = db
    .select()
    .from(user)
    .where(eq(user.id, sql.placeholder("id")))
    .prepare("get_user");
  return q.execute({ id });
}
```

### Queries & Mutations

```typescript
import { and, desc, eq, sql } from "drizzle-orm";

// Select with conditions
const activeUsers = await db.select().from(user).where(eq(user.banned, false));

// Joins
const postsWithAuthors = await db
  .select({ title: post.title, authorName: user.name })
  .from(post)
  .innerJoin(user, eq(post.authorId, user.id));

// Insert
const [newUser] = await db
  .insert(user)
  .values({ id: ulid(), ...data })
  .returning();

// Update
const [updated] = await db
  .update(user)
  .set(data)
  .where(eq(user.id, id))
  .returning();

// Delete
await db.delete(user).where(eq(user.id, id));

// Upsert
await db
  .insert(user)
  .values(data)
  .onConflictDoUpdate({
    target: user.email,
    set: { name: data.name, updatedAt: new Date() },
  })
  .returning();
```

### Transactions

```typescript
await db.transaction(async (tx) => {
  const [sender] = await tx
    .select()
    .from(user)
    .where(eq(user.id, fromId))
    .for("update");
  if (sender.credits < amount) throw new Error("Insufficient credits");
  await tx
    .update(user)
    .set({ credits: sender.credits - amount })
    .where(eq(user.id, fromId));
  await tx
    .update(user)
    .set({ credits: sql`${user.credits} + ${amount}` })
    .where(eq(user.id, toId));
});
```

### Migration Commands

```bash
pnpm drizzle-kit generate    # Generate migration from schema changes
pnpm drizzle-kit migrate     # Apply pending migrations
pnpm drizzle-kit studio      # Open visual database browser
# NEVER edit generated .sql migration files — they are immutable
```

---

## Authentication (Better Auth)

### Creating the Auth Instance

```typescript
// src/auth.ts
import { createAuth } from "@scratchyjs/auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export function createAppAuth(config: AppConfig, db: NodePgDatabase) {
  return createAuth({
    basePath: "/api/auth",
    secret: config.BETTER_AUTH_SECRET, // ✅ From env, never hardcoded
    trustedOrigins: config.ORIGIN ? [config.ORIGIN] : [],
    emailAndPassword: { enabled: true },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: userTable, session, account, verification },
    }),
    advanced: {
      database: { generateId: () => ulid() },
    },
  });
}
```

### Request Decorators

After `authPlugin` is registered, every request has:

| Decorator         | Type                  | Available when               |
| ----------------- | --------------------- | ---------------------------- |
| `request.session` | `AuthSession \| null` | Valid session cookie present |
| `request.user`    | `AuthUser \| null`    | Same — shorthand             |

### Protected Routes

```typescript
// With Fastify REST routes — use requireAuth or requireAdmin hooks
import { requireAdmin, requireAuth } from "@scratchyjs/auth/hooks";

// With tRPC — use protectedProcedure (from router.ts)
export const create = protectedProcedure
  .input(z.object({ title: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // ctx.user is guaranteed non-null here
    return createPost({ authorId: ctx.user.id, ...input });
  });

fastify.get("/profile", { preHandler: requireAuth }, (request) => {
  return { user: request.user }; // non-null after requireAuth
});

fastify.delete("/users/:id", { preHandler: requireAdmin }, async (request) => {
  // Only users with role === "admin" reach this handler
});
```

### Auth Endpoints (HTTP)

| Method | Path                      | Description         |
| ------ | ------------------------- | ------------------- |
| POST   | `/api/auth/sign-up/email` | Register a new user |
| POST   | `/api/auth/sign-in/email` | Sign in with email  |
| POST   | `/api/auth/sign-out`      | Sign out            |
| GET    | `/api/auth/get-session`   | Get current session |

### Browser Client

```typescript
import { createAuthClient } from "@scratchyjs/auth/client";

export const authClient = createAuthClient({ baseURL: "/api/auth" });

await authClient.signIn.email({ email, password });
await authClient.signOut();
const session = await authClient.getSession();
```

---

## TypeScript & Import Conventions

### Path Alias

All imports within `src/` use the `~/` prefix, configured in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": { "~/*": ["./src/*"] }
  }
}
```

```typescript
// ✅ Correct — use ~/ alias
import { db } from "~/db/index.js";
import { user } from "~/db/schema/user.js";
import { protectedProcedure } from "~/router.js";
import type { AppConfig } from "~/config.js";

// ❌ Wrong — relative paths across directories
import { db } from "../../db/index.js";
```

### Server vs Client Imports

```typescript
// Server-side (Node.js ESM) — always use .js extension
import { join } from "node:path";
// node: prefix for builtins

// Client-side (Vite) — omit extensions
import { Greeting } from "~/components/greeting";
import { db } from "~/db/index.js";
import { user } from "~/db/schema/user.js";
```

### Type-Only Imports (Required for Type Stripping)

```typescript
import type { FastifyInstance } from "fastify";
import type { User } from "~/db/schema/user.js";
```

### No Enums — Use Const Objects

```typescript
// ❌ Not compatible with type stripping
enum UserRole {
  MEMBER = "member",
  ADMIN = "admin",
}

// ✅ Correct pattern
const UserRole = { MEMBER: "member", ADMIN: "admin" } as const;
type UserRole = (typeof UserRole)[keyof typeof UserRole];
```

### Type Exports

```typescript
// From Drizzle schemas
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

// From functions
export type AllUsers = Awaited<ReturnType<typeof findAllUsers.execute>>;
```

---

## Qwik — Client-Side Rendering

### Components

```typescript
import { component$, useSignal } from "@builder.io/qwik";

export const Counter = component$(() => {
  const count = useSignal(0);
  return (
    <div>
      <p>Count: {count.value}</p>
      <button onClick$={() => count.value++}>Increment</button>
    </div>
  );
});
```

### Data Loading (Server-Side)

```typescript
import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";

export const useProducts = routeLoader$(async () => {
  return findAllProducts.execute();
});

export default component$(() => {
  const products = useProducts();
  return (
    <ul>
      {products.value.map((p) => <li key={p.id}>{p.name}</li>)}
    </ul>
  );
});
```

### Form Actions

```typescript
import { routeAction$, Form, zod$, z } from "@builder.io/qwik-city";

export const useCreatePost = routeAction$(
  async (data, { fail }) => {
    const result = await createPost(data);
    if (!result.success) return fail(400, { message: "Failed" });
    return { id: result.id };
  },
  zod$({ title: z.string().min(1), content: z.string().min(10) }),
);

export default component$(() => {
  const action = useCreatePost();
  return (
    <Form action={action}>
      <input name="title" />
      <textarea name="content" />
      <button type="submit">Create Post</button>
    </Form>
  );
});
```

### React Interop (qwikify$)

React component files **must** include the JSX pragma:

```tsx
/** @jsxImportSource react */
import { qwikify$ } from "@builder.io/qwik-react";

function Chart({ data }: { data: number[] }) {
  return <div>{/* React chart library */}</div>;
}

export const QChart = qwikify$(Chart);

// Usage in Qwik:
<QChart
  client:visible
  data={[1, 2, 3]}
/>;
```

Hydration strategies: `client:idle` (lazy), `client:load` (immediate),
`client:visible` (viewport), `client:hover` (interaction).

---

## Worker Threads (Piscina)

### Worker Entry Point

```typescript
// src/renderer/worker.ts
interface RenderTask {
  type: "ssr" | "ssg";
  route: string;
  props?: Record<string, unknown>;
}

interface RenderResult {
  html: string;
  head: string;
  statusCode: number;
}

export default async function handler(task: RenderTask): Promise<RenderResult> {
  switch (task.type) {
    case "ssr":
      return renderSSR(task.route, task.props);
    case "ssg":
      return renderSSG(task.route, task.props);
    default:
      throw new Error(`Unknown task type: ${task.type}`);
  }
}
```

### Using the Worker Pool

```typescript
// In route handlers — offload to worker pool
fastify.get("/*", async (request, reply) => {
  const result = await fastify.runTask({
    type: "ssr",
    route: request.url,
    props: { user: request.user },
  });

  reply
    .status(result.statusCode)
    .header("content-type", "text/html; charset=utf-8")
    .send(result.html);
});

// ❌ NEVER perform SSR on the main thread — it blocks the event loop
```

---

## RESTful Routes (External APIs)

For external consumers, use Fastify routes (not tRPC):

```typescript
// src/routes/external/api/v1/products/index.ts
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const routes: FastifyPluginAsync = async function (fastify) {
  fastify.get(
    "/",
    {
      schema: {
        querystring: z.object({
          page: z.coerce.number().min(1).default(1),
          limit: z.coerce.number().min(1).max(100).default(20),
        }),
      },
    },
    async (request) => {
      const { page, limit } = request.query;
      return db
        .select()
        .from(product)
        .limit(limit)
        .offset((page - 1) * limit);
    },
  );
};

export default routes;
```

---

## Configuration Pattern

```typescript
// src/config.ts
import { z } from "zod";

export const configSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().url(),
  DATABASE_SCHEMA: z.string().default("app"),
  BETTER_AUTH_SECRET: z.string().min(32),
  ORIGIN: z.string().url().optional(),
  ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform(
      (v) =>
        v
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean) ?? [],
    ),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadAppConfig(): AppConfig {
  return configSchema.parse(process.env);
}
```

---

## Validation — Mandatory Before Every Commit

Run **all four steps** before committing — CI rejects on any failure:

```bash
pnpm format                        # Prettier — fix code formatting
pnpm lint                          # ESLint — catch lint errors
pnpm typecheck                     # tsc --noEmit — catch type errors
pnpm build                         # Build all packages

# Or as a single command chain:
pnpm format && pnpm lint && pnpm typecheck && pnpm build
```

`pnpm typecheck` runs `tsc --noEmit` and catches type errors that tests and
linting miss — for example, missing properties on objects, incorrect type
assignments, and unresolved imports.

---

## Anti-Patterns (Do NOT Do These)

```typescript
// ❌ Using any
function processData(data: any): any { ... }
// ✅ Use generics or unknown with type guards

// ❌ async without await
async function getHealth() { return { status: "ok" }; }
// ✅ Remove async when await is not used
function getHealth() { return { status: "ok" }; }

// ❌ Enums (not compatible with type stripping)
enum Status { Active = "active" }
// ✅ Const objects
const Status = { Active: "active" } as const;

// ❌ Mixing async + done() callbacks
fastify.addHook("onRequest", async (request, reply, done) => { done(); });
// ✅ Use async without done
fastify.addHook("onRequest", async (request, reply) => { });

// ❌ Prepared statements inside functions
async function getUser(id: string) { const q = db.select()...prepare(); }
// ✅ Module-scoped prepared statements
export const findUser = db.select()...prepare("find_user");

// ❌ Default public schema
import { pgTable } from "drizzle-orm/pg-core";
// ✅ Custom schema namespace
import { mySchema } from "~/db/my-schema.js";

// ❌ Auto-increment integer IDs
id: serial().primaryKey()
// ✅ ULID text IDs
id: text().primaryKey()  // set with ulid() at insert time

// ❌ isNaN() — coerces argument
if (isNaN(value)) { }
// ✅ Number.isNaN() — no coercion
if (Number.isNaN(value)) { }

// ❌ Performing SSR on the main thread
const html = renderToString(<App />);
// ✅ Offload to worker pool
const result = await fastify.runTask({ type: "ssr", route: request.url });
```
