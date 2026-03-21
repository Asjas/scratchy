# Scratchy Framework — Agent Guidance

This file provides guidance to AI coding agents (Claude Code, Cursor AI, Codex,
Gemini CLI, GitHub Copilot, and other AI coding assistants) when working with
code in this repository.

## What This Repository Is

**Scratchy** is a full-stack TypeScript framework for building APIs and websites
on hosted servers (not serverless). It combines:

| Layer         | Technology                                             |
| ------------- | ------------------------------------------------------ |
| Runtime       | Node.js (>=22) with Worker Threads                     |
| API Framework | Fastify 5                                              |
| RPC Layer     | tRPC 11 (internal APIs) + RESTful endpoints (external) |
| Rendering     | Qwik (primary) with React support via `qwik-react`     |
| Bundling      | Vite                                                   |
| Data Layer    | Drizzle ORM with PostgreSQL                            |
| Styling       | Tailwind CSS                                           |
| Worker Pool   | Piscina (via `fastify-piscina`)                        |
| Language      | TypeScript (strict mode, type stripping for Node.js)   |

**Design principles:**

- Server-first — built for hosted/dedicated servers, not serverless
- Worker-based rendering — SSR and SSG run in Worker Threads via Piscina
- RPC-first, REST-capable — tRPC for internal use, RESTful for external with
  CORS
- Type-safe end-to-end — TypeScript from database schema to client components
- Convention over configuration — CLI scaffolding for models, views, api,
  controllers

## Repository Structure

```
scratchy/
├── .github/
│   └── instructions/      # AI coding assistant instruction files
├── docs/                  # Framework documentation, guides, and references
├── AGENTS.md              # This file — AI agent guidance
├── LICENSE                # MIT License
└── .gitignore
```

As the framework grows, the planned structure is:

```
scratchy/
├── packages/
│   ├── core/              # Core framework runtime (Fastify + Piscina + routing)
│   ├── cli/               # CLI tool for scaffolding
│   ├── renderer/          # Qwik SSR/SSG in Worker Threads
│   ├── trpc/              # tRPC integration layer
│   ├── drizzle/           # Database utilities and schema helpers
│   └── vite-plugin/       # Vite plugin for Scratchy projects
├── templates/             # Project and component templates for the CLI
├── examples/              # Example applications
├── docs/                  # Documentation
└── tests/                 # Integration and E2E tests
```

## Commands

Use **pnpm** as the package manager (never npm or yarn).

```bash
# Setup
pnpm install --frozen-lockfile

# Development
pnpm dev                           # Run the development server
pnpm build                         # Build all packages

# Validation (run before every commit)
pnpm format && pnpm lint && pnpm typecheck && pnpm build

# Testing
pnpm test                          # Run all tests
```

## Critical Rules

1. **Always use pnpm** — never npm or yarn.
2. **TypeScript strict mode** — no `any` types, use `unknown` and type guards.
3. **Node.js type stripping** — use `import type` for type-only imports, avoid
   enums (use const objects), avoid namespaces and parameter properties.
4. **Server imports use `.js` extension** (ESM resolution); client imports omit
   extensions (Vite resolves them).
5. **`async` only when `await` is needed** — `async` wraps the return in a
   Promise (extra allocation per call). Never mix `async` + `done()` callbacks.
6. **Filenames and folder names** must use kebab-case (hyphenated lowercase) —
   e.g. `worker-pool.ts`, `api-router.ts`. Never PascalCase or camelCase for
   file/folder names.
7. **Commit messages** follow Conventional Commits:
   `<type>(<scope>): <subject>`.
8. **Fastify plugins with decorators** require `declare module "fastify"`
   augmentation so TypeScript knows about `fastify.db`, `fastify.cache`, etc.
9. **Structured logging** — use `request.log` inside route handlers (not
   `fastify.log`). Always pass an object first:
   `request.log.info({ userId }, "message")`.
10. **Drizzle schemas** use a custom schema namespace (e.g., `mySchema.table()`)
    — never use the default `public` schema.
11. **Drizzle migration files are immutable** — never edit generated `.sql`
    migration files.
12. **Worker Threads** — heavy synchronous work (SSR, SSG) must run in Worker
    Threads via Piscina. Never block the main event loop.
13. **tRPC for internal APIs** — all internal API communication uses tRPC with
    superjson transformer.
14. **REST for external APIs** — external-facing endpoints use Fastify routes
    under `/external/api` with CORS enabled.
15. **IDs** use ULID (`import { ulid } from "ulid"`).
16. **Prepared statements** must be module-scoped (top-level), never inside
    functions.
17. **Graceful shutdown** — use `close-with-grace` for SIGTERM/SIGINT handling.
    Never re-call `closeWithGrace` inside `process.on('uncaughtException')`.

## Architecture

### API Layer

```
src/
├── server.ts              # Fastify server setup and plugin registration
├── router.ts              # tRPC router initialization with middlewares
├── context.ts             # tRPC context creation (request, user, etc.)
├── routers/               # tRPC domain routers (queries.ts + mutations.ts each)
├── routes/                # RESTful Fastify routes (for external APIs)
├── plugins/
│   ├── external/          # Third-party Fastify plugins (auth, CORS, helmet)
│   └── app/               # Application-specific Fastify plugins
└── hooks/                 # Fastify lifecycle hooks
```

- **tRPC routers**: Domain-based (e.g., `routers/users/`, `routers/courses/`),
  each with `queries.ts` and `mutations.ts`.
- **REST routes**: Under `routes/external/` with CORS enabled for third-party
  consumers.
- **Plugin registration**: Use `@fastify/autoload` with `encapsulate: false` for
  shared scope.

### Data Layer

```
src/db/
├── index.ts               # Drizzle instance and connection pool
├── my-schema.ts           # PostgreSQL schema namespace
├── schema/                # Drizzle table definitions (one file per entity)
│   └── columns.helpers.ts # Shared column helpers (timestamps, etc.)
├── queries/               # Module-scoped prepared statements
└── mutations/             # Write operations
```

- **Schema pattern**:
  `mySchema.table("name", { columns }, (table) => [indexes])`
- **Relations**: Defined alongside tables using `relations()` from Drizzle
- **Column helpers**: Shared timestamp columns via a `timestamps` spread object
- **Casing**: Use `snake_case` in Drizzle config for database columns

### Rendering (Worker Threads)

```
src/renderer/
├── pool.ts                # Piscina worker pool initialization
├── worker.ts              # Worker thread entry point (Qwik SSR/SSG)
└── templates/             # HTML shell templates
```

- **Piscina pool**: Created at startup via `fastify-piscina`, kept alive for the
  entire runtime.
- **Communication**: SharedArrayBuffer + Atomics for zero-copy data sharing, or
  Redis (DragonflyDB) for distributed scenarios.
- **Result**: Workers return rendered HTML to the main thread.

### Client Side

```
src/client/
├── components/            # Qwik components (with optional React via qwik-react)
├── routes/                # File-based routing
├── styles/                # Tailwind CSS styles
└── entry.ts               # Client entry point
```

- **Qwik components**: Use Qwik's fine-grained reactivity and resumability
- **React interop**: Use `qwikify$()` to wrap React components for use in Qwik
- **Styling**: Tailwind CSS for utility-first styling

## Coding Conventions

- **TypeScript**: Strict mode, no `any`, double quotes, semicolons, `const` over
  `let`.
- **Naming**: PascalCase for components, camelCase for variables/functions,
  snake_case for DB tables/columns.
- **Components**: Use Qwik's `component$()` for Qwik components, ES5 function
  declarations for React components.
- **Type exports**: `export type AllItems = Awaited<ReturnType<typeof fn>>`.
- **Error handling**: Use `fastify.to(promise)` for `[err, result]` tuples where
  available. Use `createError()` for structured HTTP errors.
- **Data loading**: Use `routeLoader$()` for server-side data in route
  components. Never fetch data client-side when SSR can provide it.
- **Form handling**: Use `routeAction$()` with `zod$()` validation for form
  submissions. Use the `<Form>` component for progressive enhancement.
- **Middleware**: Export `onRequest`, `onGet`, `onPost` from route files for
  per-route middleware. Use Fastify plugins for global middleware.
- **Sessions**: Use `createCookie()` for signed cookies, Redis-backed session
  storage in production. Regenerate session IDs on auth state changes.
- **Error pages**: Add `error.tsx` in route directories for error boundaries.
  Use `notFound()` to trigger not-found pages.

## Instruction Files

Detailed coding patterns are in `.github/instructions/`, each scoped to specific
file paths or technology areas:

| File                             | Scope                                    |
| -------------------------------- | ---------------------------------------- |
| `react.instructions.md`          | React components in Qwik React interop   |
| `qwik.instructions.md`           | Qwik components, routing, and rendering  |
| `drizzle.instructions.md`        | Drizzle ORM schemas, queries, migrations |
| `trpc.instructions.md`           | tRPC routers, procedures, middleware     |
| `fastify.instructions.md`        | Fastify server, plugins, routes          |
| `typescript.instructions.md`     | TypeScript config and patterns           |
| `worker-threads.instructions.md` | Worker Threads and Piscina patterns      |
| `vite.instructions.md`           | Vite bundling configuration              |
| `tailwindcss.instructions.md`    | Tailwind CSS styling patterns            |

## Reference Documentation

Comprehensive guides are maintained in the `/docs` directory:

| Document                  | Content                                           |
| ------------------------- | ------------------------------------------------- |
| `architecture.md`         | Framework architecture and design decisions       |
| `getting-started.md`      | Setup guide and prerequisites                     |
| `project-structure.md`    | Directory layout and code organization            |
| `api-design.md`           | tRPC and RESTful API patterns                     |
| `data-loading.md`         | routeLoader$, server functions, caching           |
| `forms-and-actions.md`    | routeAction$, Form component, file uploads        |
| `middleware.md`           | Request middleware, onRequest, lifecycle hooks    |
| `error-handling.md`       | Error boundaries, error pages, structured errors  |
| `sessions.md`             | Cookie/session management, flash messages         |
| `security.md`             | CSRF, CSP, auth, rate limiting, input validation  |
| `rendering.md`            | SSR, SSG, and Worker Thread rendering pipeline    |
| `streaming.md`            | Streaming SSR, progressive rendering, defer/Await |
| `testing.md`              | Testing strategy, Vitest, Cypress, test utilities |
| `data-layer.md`           | Drizzle ORM, database patterns, and data flow     |
| `cli.md`                  | CLI scaffolding commands                          |
| `worker-communication.md` | SharedArrayBuffer, Atomics, and Redis patterns    |
| `references.md`           | Links to all external documentation               |
| `nitro-inspiration.md`    | Nitro v3 concepts adapted for Scratchy            |
