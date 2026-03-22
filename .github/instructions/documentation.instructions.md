---
name: documentation
description:
  "Creates, structures, and reviews technical documentation for the Scratchy
  framework following the Diátaxis framework (tutorials, how-to guides,
  reference, and explanation pages). Use when writing or reorganizing docs,
  structuring a tutorial vs. a how-to guide, building reference docs or API
  documentation, creating explanation pages, choosing between Diátaxis
  documentation types, or improving existing documentation structure. Trigger
  terms: documentation, docs, technical writing, tutorial, how-to guide,
  reference, explanation, Diátaxis, user guide, API docs, restructure docs."
applyTo: "docs/**/*.md"
---

# Documentation in Scratchy

## When to Use

Use this skill when you need to create, review, or improve technical
documentation for the Scratchy framework following the Diátaxis framework.
Examples include:

- Creating user guides for Scratchy features
- API documentation for tRPC routers, Fastify plugins, and REST endpoints
- Tutorial content for getting started or building features
- Restructuring existing documentation to better serve different user needs
- Writing reference pages for configuration, CLI commands, or schema patterns
- Explaining architectural decisions (worker threads, tRPC vs REST, Qwik SSR)

## Diátaxis Framework

Scratchy documentation follows the **Diátaxis** framework — a systematic
approach that organizes content into four distinct types based on user needs:

```
                 PRACTICAL                          THEORETICAL
            ┌─────────────────────┐          ┌─────────────────────┐
 LEARNING   │     Tutorials       │          │    Explanation      │
            │  (learning-oriented)│          │(understanding-      │
            │                     │          │ oriented)            │
            └─────────────────────┘          └─────────────────────┘
            ┌─────────────────────┐          ┌─────────────────────┐
 WORKING    │   How-to Guides     │          │    Reference        │
            │ (problem-oriented)  │          │(information-        │
            │                     │          │ oriented)            │
            └─────────────────────┘          └─────────────────────┘
```

Each type serves a different need. Never mix types in a single document.

---

## Step 1 — Identify the Documentation Type

Use the following decision checklist based on user signals:

| User signal                                         | Documentation type |
| --------------------------------------------------- | ------------------ |
| "I'm new to Scratchy and want to learn it"          | **Tutorial**       |
| "How do I configure X?" / "I need to accomplish X"  | **How-to guide**   |
| "What are the options/parameters/API for X?"        | **Reference**      |
| "Why does Scratchy use X?" / "Help me understand X" | **Explanation**    |

Quick decision tree:

- Is the user **learning by doing** for the first time? → Tutorial
- Do they need to **solve a specific problem** they already understand? → How-to
  guide
- Do they need **technical facts** to look up? → Reference
- Do they want **conceptual background**? → Explanation

Always ask clarifying questions about the user's context, audience, and goals
**before** creating documentation if the type is ambiguous.

---

## Step 2 — Apply Type-Specific Patterns

### Tutorials (learning-oriented)

- **Title pattern:** Start with a verb — _"Build your first Scratchy API"_,
  _"Create a tRPC router from scratch"_
- **Structure:** Goal → Prerequisites → Numbered steps → Immediate verifiable
  result at each step → Final outcome
- Minimise explanation; maximise doing
- Every step must produce a visible, testable result
- **Validation:** A beginner must be able to complete the tutorial without
  external help

**Example intro for Scratchy:**

> \*"In this tutorial, you will build a simple API with Scratchy using Fastify
> and tRPC. By the end, you will have a running server that responds to
> type-safe queries. No prior Scratchy experience is needed — only Node.js
>
> > = 22 and pnpm >= 10."\*

**Scratchy tutorial patterns:**

```typescript
// Step 1: Create the server — show the working result immediately
import Fastify from "fastify";

const server = Fastify({ logger: true });

server.get("/health", async () => ({ status: "ok" }));

await server.listen({ port: 5000, host: "0.0.0.0" });
// ✅ Visit http://localhost:5000/health to verify
```

```typescript
// Step 2: Add a tRPC router — build on the previous step
import { initTRPC } from "@trpc/server";
import { z } from "zod";

const t = initTRPC.create();

const appRouter = t.router({
  hello: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => `Hello, ${input.name}!`),
});

export type AppRouter = typeof appRouter;
// ✅ Call the query from a client to verify
```

```typescript
// Step 3: Add a Drizzle schema — each step is self-contained and verifiable
import { text } from "drizzle-orm/pg-core";
import { mySchema } from "~/db/my-schema.js";
import { timestamps } from "~/db/schema/columns.helpers.js";

export const user = mySchema.table("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  ...timestamps,
});

export type User = typeof user.$inferSelect;
// ✅ Run `pnpm drizzle-kit generate` and verify the migration is created
```

---

### How-to Guides (problem-oriented)

- **Title pattern:** Frame as a task — _"How to add authentication"_, _"How to
  configure Redis caching"_, _"How to deploy with Docker"_
- **Structure:** Goal statement → Assumptions/prerequisites → Numbered steps →
  Expected result
- Assume baseline knowledge of Scratchy; skip conceptual explanations
- Allow for variation; note alternatives where they exist
- **Validation:** An experienced Scratchy user can complete the task without
  confusion or backtracking

**Example intro for Scratchy:**

> _"This guide shows how to add session-based authentication to an existing
> Scratchy application. It assumes you have a working Fastify server with the
> Drizzle ORM data layer configured."_

**Scratchy how-to patterns:**

```typescript
// How to create a Fastify plugin with a decorator
import fp from "fastify-plugin";

export default fp(async function myPlugin(fastify) {
  // Register the decorator
  fastify.decorate("myService", new MyService());
});

// Augment the Fastify type so TypeScript knows about it
declare module "fastify" {
  interface FastifyInstance {
    myService: MyService;
  }
}
```

```typescript
// How to set up a prepared statement with Drizzle
import { eq, sql } from "drizzle-orm";
import { db } from "~/db/index.js";
import { user } from "~/db/schema/user.js";

// Module-scoped — never inside a function
export const findUserByEmail = db
  .select()
  .from(user)
  .where(eq(user.email, sql.placeholder("email")))
  .prepare("find_user_by_email");

// Usage in a tRPC procedure
const result = await findUserByEmail.execute({ email: input.email });
```

```typescript
// How to define a tRPC mutation with Zod validation
import { z } from "zod";
import { createPost } from "~/db/mutations/posts.js";
import { protectedProcedure } from "~/router.js";

export const create = protectedProcedure
  .input(
    z.object({
      title: z.string().min(1).max(200),
      content: z.string().min(10),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    return createPost({ ...input, authorId: ctx.user.id });
  });
```

```typescript
// How to set up a routeLoader$ for server-side data loading
import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { findAllProducts } from "~/db/queries/products.js";

export const useProducts = routeLoader$(async () => {
  return findAllProducts.execute();
});

export default component$(() => {
  const products = useProducts();
  return (
    <ul>
      {products.value.map((p) => (
        <li key={p.id}>{p.name}</li>
      ))}
    </ul>
  );
});
```

---

### Reference (information-oriented)

- **Title pattern:** Name the thing — _"Configuration options"_, _"CLI
  commands"_, _"tRPC procedure types"_, _"Fastify lifecycle hooks"_
- **Structure:** Consistent repeatable format per entry (name → type → default →
  description → example)
- State facts; avoid instruction beyond minimal usage examples
- Keep current; version-stamp if needed
- **Validation:** A user can look up a specific fact in under 30 seconds without
  reading surrounding content

**Example entries for Scratchy:**

> **`routeLoader$()`** Server-side data loader that runs before route rendering.
> Returns a read-only signal in the component. _Returns:_ `Signal<T>` accessible
> via `.value` _Runs:_ On every navigation (server and client-side) _Example:_
>
> ```typescript
> export const useUser = routeLoader$(async (event) => {
>   return findUserById.execute({ id: event.params.id });
> });
> ```

> **`createError()`** _(factory function)_ Creates a structured `AppError` with
> status code, message, code, and optional metadata. _Parameters:_ | Param |
> Type | Required | Default |
> |--------------|--------------------------|----------|----------------------|
> | `statusCode` | `StatusCode` | Yes | — | | `message` | `string` | Yes | — | |
> `code` | `string` | No | `E_HTTP_{statusCode}`| | `fatal` | `boolean` | No |
> `false` | | `data` | `Record<string, unknown>`| No | `{}` | | `cause` |
> `unknown` | No | — |
>
> _Example:_
>
> ```typescript
> throw createError({ statusCode: 404, message: "Post not found" });
> ```

**Scratchy reference tables:**

| Fastify Hook       | Phase                | Common Use Cases                            |
| ------------------ | -------------------- | ------------------------------------------- |
| `onRequest`        | Before parsing       | Authentication, early rejection, request ID |
| `preParsing`       | Before body parsing  | Decompress body, transform raw stream       |
| `preValidation`    | Before schema check  | Normalize input, attach defaults            |
| `preHandler`       | Before route handler | Authorization, rate limiting, feature flags |
| `preSerialization` | Before serialization | Transform response data, strip fields       |
| `onSend`           | Before sending       | Modify headers, compress response, add ETag |
| `onResponse`       | After response sent  | Logging, metrics, cleanup                   |

| tRPC Procedure | HTTP Method | Use Case                                 |
| -------------- | ----------- | ---------------------------------------- |
| `query`        | GET/POST    | Read data (fetching, listing, searching) |
| `mutation`     | POST        | Write data (create, update, delete)      |
| `subscription` | SSE         | Real-time data streams                   |

| CLI Command                   | What It Generates                                |
| ----------------------------- | ------------------------------------------------ |
| `scratchy make:model <Name>`  | Schema, queries, and mutations for a DB entity   |
| `scratchy make:router <name>` | tRPC router with queries and mutations files     |
| `scratchy make:route <path>`  | Fastify REST route file under `routes/external/` |
| `scratchy make:component <n>` | Qwik component file with TypeScript props        |

---

### Explanations (understanding-oriented)

- **Title pattern:** Frame as a concept — _"How Worker Thread rendering works"_,
  _"Understanding tRPC vs REST in Scratchy"_, _"Why Scratchy uses Drizzle over
  Prisma"_
- **Structure:** Context → Core concept → Alternatives/trade-offs → Higher-level
  perspective
- Avoid step-by-step instruction or technical specification
- **Validation:** After reading, the user can explain the concept in their own
  words and understands the rationale behind design decisions

**Example intro for Scratchy:**

> _"Scratchy uses two API patterns — tRPC for internal communication and REST
> for external consumers. This page explains why both exist, where the boundary
> lies, and how data flows through each path."_

**Scratchy explanation topics (with summaries):**

- **Server-first, not serverless:** Scratchy is designed for long-running
  Node.js processes. Persistent connections to PostgreSQL and Redis reduce cold
  start overhead. Worker Thread pools are pre-warmed. In-memory caching via LRU
  and `async-cache-dedupe` is effective with long-lived processes.

- **Worker Threads for rendering:** SSR is CPU-intensive. Blocking the main
  thread would delay API responses. Piscina manages thread lifecycle, queuing,
  and resource limits. Each worker has its own V8 isolate.

- **Qwik over React:** Qwik's resumability means zero JavaScript shipped until
  interaction. Fine-grained lazy loading at the component level. React interop
  via `qwikify$()` provides escape hatches.

- **tRPC for internal, REST for external:** tRPC provides end-to-end type safety
  without code generation. External consumers need standard REST with OpenAPI
  docs. CORS is enabled only on `/external/api` routes.

- **Drizzle over Prisma:** SQL-first approach with predictable queries. No
  runtime engine or binary. Schema definitions are plain TypeScript. Prepared
  statements are first-class.

- **SharedArrayBuffer vs Redis:** SharedArrayBuffer for zero-copy low-latency
  within a single process. Redis for distributed state across multiple servers.
  Start with Redis for simplicity, add SharedArrayBuffer when profiling shows
  serialization bottlenecks.

---

## Step 3 — Maintain Separation and Integration

- **Keep each document a single type** — don't mix tutorial steps with reference
  tables or conceptual digressions.
- **Cross-link between types:** a tutorial can link to the relevant reference
  page; a how-to guide can link to an explanation for background.
- Use **consistent headings and terminology** across all types so users can
  navigate the full documentation system.

### Scratchy Cross-Reference Map

| Document               | Primary Type  | Links To                                        |
| ---------------------- | ------------- | ----------------------------------------------- |
| `getting-started.md`   | Tutorial      | `project-structure.md`, `architecture.md`       |
| `api-design.md`        | How-to / Ref  | `error-handling.md`, `middleware.md`            |
| `data-layer.md`        | How-to / Ref  | `cli.md`, `testing.md`                          |
| `data-loading.md`      | How-to        | `api-design.md`, `streaming.md`                 |
| `error-handling.md`    | How-to / Ref  | `api-design.md`, `security.md`                  |
| `forms-and-actions.md` | How-to        | `api-design.md`, `security.md`                  |
| `middleware.md`        | How-to / Ref  | `security.md`, `sessions.md`                    |
| `rendering.md`         | How-to / Expl | `streaming.md`, `worker-communication.md`       |
| `sessions.md`          | How-to / Ref  | `security.md`, `middleware.md`                  |
| `security.md`          | Reference     | `sessions.md`, `middleware.md`, `api-design.md` |
| `streaming.md`         | How-to / Expl | `rendering.md`, `worker-communication.md`       |
| `testing.md`           | How-to        | `api-design.md`, `data-layer.md`                |
| `cli.md`               | Reference     | `data-layer.md`, `project-structure.md`         |
| `worker-communication` | How-to / Expl | `rendering.md`, `streaming.md`                  |
| `project-structure.md` | Reference     | `getting-started.md`                            |
| `architecture.md`      | Explanation   | All other docs                                  |
| `nitro-inspiration.md` | Explanation   | `architecture.md`                               |
| `references.md`        | Reference     | External links only                             |

---

## Step 4 — Validate Before Delivering

| Type         | Validation check                                                   |
| ------------ | ------------------------------------------------------------------ |
| Tutorial     | Can a beginner complete it end-to-end without external help?       |
| How-to guide | Does it solve the stated problem for an experienced Scratchy user? |
| Reference    | Can the user find a specific fact in under 30 seconds?             |
| Explanation  | Does the user understand the _why_, not just the _what_?           |

---

## Scratchy Technology Stack Context

When writing documentation, use the correct libraries, APIs, and patterns. The
Scratchy stack consists of:

### Core Runtime & Server

| Technology            | Role                          | Import Pattern                                               |
| --------------------- | ----------------------------- | ------------------------------------------------------------ |
| **Node.js >= 22**     | Runtime with type stripping   | Use `import type` for type-only imports                      |
| **Fastify 5**         | HTTP server framework         | `import Fastify from "fastify"`                              |
| **fastify-plugin**    | Plugin wrapper (shared scope) | `import fp from "fastify-plugin"`                            |
| **@fastify/autoload** | Auto-load plugins and routes  | `import autoload from "@fastify/autoload"`                   |
| **Piscina**           | Worker Thread pool            | `import { resolve } from "node:path"`; via `fastify-piscina` |
| **close-with-grace**  | Graceful shutdown             | `import closeWithGrace from "close-with-grace"`              |
| **Pino**              | Structured logging            | Via `fastify.log` / `request.log`                            |

### API Layer

| Technology                    | Role                           | Import Pattern                                                                      |
| ----------------------------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| **tRPC 11**                   | Internal type-safe RPC         | `import { initTRPC } from "@trpc/server"`                                           |
| **superjson**                 | tRPC transformer               | `import superjson from "superjson"`                                                 |
| **Zod**                       | Input validation (tRPC + REST) | `import { z } from "zod"`                                                           |
| **fastify-type-provider-zod** | Fastify + Zod integration      | `import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod"` |

### Data Layer

| Technology              | Role                     | Import Pattern                                        |
| ----------------------- | ------------------------ | ----------------------------------------------------- |
| **Drizzle ORM**         | Type-safe SQL ORM        | `import { drizzle } from "drizzle-orm/node-postgres"` |
| **pg (node-postgres)**  | PostgreSQL driver        | `import { Pool } from "pg"`                           |
| **Drizzle Kit**         | Migrations CLI           | `pnpm drizzle-kit generate` / `migrate` / `studio`    |
| **Redis / DragonflyDB** | Caching and sessions     | `import Redis from "ioredis"`                         |
| **async-cache-dedupe**  | Cache with request dedup | `import { createCache } from "async-cache-dedupe"`    |
| **ULID**                | ID generation            | `import { ulid } from "ulid"`                         |

### Rendering & Client

| Technology       | Role                         | Import Pattern                                         |
| ---------------- | ---------------------------- | ------------------------------------------------------ |
| **Qwik**         | Primary UI framework         | `import { component$ } from "@builder.io/qwik"`        |
| **Qwik City**    | File-based routing + loaders | `import { routeLoader$ } from "@builder.io/qwik-city"` |
| **qwik-react**   | React interop                | `import { qwikify$ } from "@builder.io/qwik-react"`    |
| **Vite**         | Bundler and dev server       | `vite.config.ts`                                       |
| **Tailwind CSS** | Utility-first styling        | Class names in JSX                                     |

### Security Plugins

| Technology                   | Role                         |
| ---------------------------- | ---------------------------- |
| **@fastify/helmet**          | Security headers (CSP, HSTS) |
| **@fastify/cors**            | Cross-origin requests        |
| **@fastify/rate-limit**      | Rate limiting                |
| **@fastify/csrf-protection** | CSRF tokens                  |
| **@fastify/cookie**          | Cookie parsing/signing       |
| **@fastify/secure-session**  | Encrypted sessions           |

### Testing

| Technology           | Role                         |
| -------------------- | ---------------------------- |
| **Vitest**           | Unit, integration, component |
| **Cypress**          | End-to-end browser testing   |
| **fastify.inject()** | In-process HTTP testing      |
| **@qwik/testing**    | Qwik component testing       |
| **Testing Library**  | DOM assertions               |

---

## Code Example Conventions

When including code examples in documentation, follow these rules:

1. **Always use TypeScript** with strict mode patterns (no `any`, use `unknown`
   and type guards).

2. **Server imports use `.js` extensions** (ESM resolution):

   ```typescript
   import { db } from "~/db/index.js";
   import { findUserById } from "~/db/queries/users.js";
   ```

3. **Use path aliases** (`~/`) for clean imports:

   ```typescript
   import { protectedProcedure } from "~/router.js";
   ```

4. **Zod schemas for all input validation:**

   ```typescript
   const createPostSchema = z.object({
     title: z.string().min(1).max(200),
     content: z.string().min(10),
     published: z.boolean().default(false),
   });
   ```

5. **Drizzle schemas use custom schema namespace:**

   ```typescript
   import { mySchema } from "~/db/my-schema.js";

   export const post = mySchema.table("post", {
     /* columns */
   });
   ```

6. **Prepared statements are module-scoped:**

   ```typescript
   // ✅ Top-level — correct
   export const findPostById = db.select().from(post)
     .where(eq(post.id, sql.placeholder("id")))
     .prepare("find_post_by_id");

   // ❌ Inside a function — wrong
   function getPost(id: string) {
     const query = db.select()... // This re-prepares on every call
   }
   ```

7. **Fastify plugins use `fastify-plugin` wrapper and type augmentation:**

   ```typescript
   import fp from "fastify-plugin";

   export default fp(async function myPlugin(fastify) {
     fastify.decorate("myService", new MyService());
   });

   declare module "fastify" {
     interface FastifyInstance {
       myService: MyService;
     }
   }
   ```

8. **Structured logging with `request.log`:**

   ```typescript
   request.log.info({ userId, action: "login" }, "User authenticated");
   ```

9. **IDs use ULID:**

   ```typescript
   import { ulid } from "ulid";

   const id = ulid();
   ```

10. **File and folder names use kebab-case:**
    ```
    ✅ worker-pool.ts, api-router.ts, columns.helpers.ts
    ❌ workerPool.ts, ApiRouter.ts
    ```

---

## Project Structure Reference

When documenting file locations or directing users to specific areas of the
codebase, use this canonical structure:

```
src/
├── server.ts              # Fastify server setup and plugin registration
├── index.ts               # Application entry point
├── config.ts              # Environment and configuration loading
├── router.ts              # tRPC initialization, middleware, procedures
├── context.ts             # tRPC context creation
├── db/                    # Database layer
│   ├── index.ts           # Drizzle instance and connection pool
│   ├── my-schema.ts       # PostgreSQL schema namespace
│   ├── schema/            # Table definitions (one file per entity)
│   ├── queries/           # Module-scoped prepared statements
│   └── mutations/         # Write operations
├── routers/               # tRPC routers (internal API)
│   └── <domain>/
│       ├── queries.ts     # Read procedures
│       └── mutations.ts   # Write procedures
├── routes/                # Fastify REST routes (external API)
│   ├── health/
│   └── external/api/v1/
├── plugins/               # Fastify plugins
│   ├── external/          # Third-party (helmet, CORS, rate-limit)
│   └── app/               # Application (database, cache, auth, worker-pool)
├── hooks/                 # Fastify lifecycle hooks
├── renderer/              # Worker Thread rendering (Piscina)
│   ├── worker.ts          # Worker entry point
│   └── templates/         # HTML shell templates
├── client/                # Client-side code (bundled by Vite)
│   ├── components/        # UI components (qwik/, react/, shared/)
│   ├── routes/            # Qwik City file-based routing
│   └── styles/            # Tailwind CSS
└── lib/                   # Shared utilities (errors, cookies, etc.)
```

---

## Documentation File Organization

All documentation lives in the `docs/` directory. When creating new
documentation, place it in the correct category:

| File                      | Diátaxis Type        | Audience                |
| ------------------------- | -------------------- | ----------------------- |
| `getting-started.md`      | Tutorial             | New Scratchy developers |
| `api-design.md`           | How-to + Reference   | Backend developers      |
| `data-layer.md`           | How-to + Reference   | Backend developers      |
| `data-loading.md`         | How-to               | Full-stack developers   |
| `error-handling.md`       | How-to + Reference   | All developers          |
| `forms-and-actions.md`    | How-to               | Full-stack developers   |
| `middleware.md`           | How-to + Reference   | Backend developers      |
| `rendering.md`            | How-to + Explanation | Full-stack developers   |
| `sessions.md`             | How-to + Reference   | Backend developers      |
| `security.md`             | Reference            | All developers          |
| `streaming.md`            | How-to + Explanation | Advanced developers     |
| `testing.md`              | How-to               | All developers          |
| `cli.md`                  | Reference            | All developers          |
| `worker-communication.md` | How-to + Explanation | Advanced developers     |
| `project-structure.md`    | Reference            | New Scratchy developers |
| `architecture.md`         | Explanation          | All developers          |
| `nitro-inspiration.md`    | Explanation          | Framework contributors  |
| `references.md`           | Reference            | All developers          |

---

## Writing Style Rules

1. **Use present tense** — "Scratchy uses Fastify" not "Scratchy will use."
2. **Use active voice** — "The worker renders HTML" not "HTML is rendered by the
   worker."
3. **Be direct** — "Add the plugin" not "You should consider adding."
4. **Use ASCII diagrams** for architecture and flow illustrations (the existing
   docs use this pattern extensively).
5. **Include a Table of Contents** for documents longer than 3 sections.
6. **Use tables** for option/parameter references (name, type, default,
   description).
7. **Include Best Practices and Anti-Patterns sections** at the bottom of how-to
   guides.
8. **Mark code examples with file paths** as comments:
   ```typescript
   // src/plugins/app/auth.ts
   import fp from "fastify-plugin";
   ```
9. **Use `✅` and `❌` markers** to distinguish correct from incorrect patterns.
10. **Cross-reference related docs** using relative Markdown links:
    ```markdown
    See [middleware.md](./middleware.md) for the full middleware architecture.
    ```
