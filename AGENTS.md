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

# Validation (run ALL four steps before every commit — CI will reject failures)
pnpm format                        # Prettier — fix code formatting
pnpm lint                          # ESLint — catch lint errors
pnpm typecheck                     # tsc --noEmit — catch type errors across all packages
pnpm build                         # Build all packages

# Or as a single command chain:
pnpm format && pnpm lint && pnpm typecheck && pnpm build

# Testing
pnpm test                          # Run all tests (Vitest)

# Documentation site (VitePress)
pnpm docs:dev                      # Start the VitePress dev server (http://localhost:5173)
pnpm docs:build                    # Build the static docs site to docs/.vitepress/dist/
pnpm docs:preview                  # Preview the built docs locally (http://localhost:4173)

# Docs E2E tests (Cypress) — requires the docs to be built and preview running
pnpm docs:build && pnpm docs:preview &
pnpm cy:run:docs                   # Run all Cypress e2e specs against the docs site
pnpm cy:open                       # Open the Cypress interactive test runner
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
18. **Always run the full validation chain before committing** —
    `pnpm format && pnpm lint && pnpm typecheck && pnpm build`. All four steps
    are mandatory; CI rejects on any failure. `pnpm typecheck` runs
    `tsc --noEmit` across all packages via Turbo and catches type errors that
    tests and linting miss.

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
- **Function style**: Only add `async` when `await` is used inside the function.
  Otherwise, use a regular (ES5) function declaration. `async` wraps the return
  in a Promise — an unnecessary allocation when no `await` is present.
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

## Documentation Website

The public documentation site lives at **https://scratchyjs.com** and is built
with [VitePress](https://vitepress.dev). The Markdown source files are the same
`/docs/*.md` files used for AI instruction context — no separate copies.

### Structure

```
docs/
├── .vitepress/
│   ├── config.ts               # VitePress config — nav, sidebar, search
│   ├── components/
│   │   └── GitHubReleases.vue  # Fetches GitHub releases API at runtime
│   └── theme/
│       ├── index.ts            # Extends DefaultTheme, registers global components
│       └── style.css           # Brand colours + navbar layout overrides
├── changelog.md                # Includes root CHANGELOG.md via <!--@include: -->
├── releases.md                 # Renders the GitHubReleases Vue component
├── index.md                    # Client-side redirect to /getting-started
└── *.md                        # All existing framework documentation pages
```

### Deployment

| Event                                                 | Target                 | URL / How to Access                                  |
| ----------------------------------------------------- | ---------------------- | ---------------------------------------------------- |
| Push to `main` (docs/\*\* or CHANGELOG.md changed)    | Production Worker      | https://scratchyjs.com                               |
| PR opened/updated (docs/\*\* or CHANGELOG.md changed) | Preview Worker         | Cloudflare `workers.dev` preview URL (see PR checks) |
| PR closed                                             | Preview Worker deleted | —                                                    |

Deployment uses Cloudflare Workers Static Assets (`wrangler.toml` at repo root).

**Preview URL discovery:** This repository does not configure
`preview-{pr}.scratchyjs.com` routes or DNS records. When a PR touches `docs/**`
or `CHANGELOG.md`, CI deploys a named Worker for that PR. Cloudflare exposes it
on a `workers.dev` subdomain derived from the Worker name and account (for
example, `https://<worker-name>.<account>.workers.dev`). The exact preview URL
is shown in the GitHub Actions "Deploy docs preview" job summary and in the
Cloudflare Workers dashboard for the corresponding Worker.

### Required GitHub Secrets

| Secret                  | Description                                                                 |
| ----------------------- | --------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API token with **Workers:Edit** and **Account:Read** permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID (found in the Cloudflare dashboard)              |

### Docs E2E Tests

Cypress e2e tests for the docs site live in `cypress/e2e/`. They run
automatically in CI when `docs/**`, `CHANGELOG.md`, or `cypress/**` changes.
Specs are intentionally broad — they verify page existence, nav links, sidebar
sections, layout elements, and theme switching. Do **not** add fine-grained
unit-style assertions to the Cypress specs.

## Keeping `create-scratchy-app` Template in Sync

The `packages/create-scratchy-app/src/template/` directory contains the starter
template that end users receive when they scaffold a new Scratchy application.
It includes its own `AGENTS.md` and `.github/instructions/` files.

**When updating this root `AGENTS.md` or any file in `.github/instructions/`**,
check whether the corresponding template files should also be updated:

| Primary file                             | Template counterpart                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `AGENTS.md`                              | `packages/create-scratchy-app/src/template/AGENTS.md`                              |
| `.github/instructions/*.instructions.md` | `packages/create-scratchy-app/src/template/.github/instructions/*.instructions.md` |

The template files are **condensed** versions focused on app development (not
framework contribution). When a critical rule, convention, or security pattern
changes here, propagate the relevant parts to the template so new Scratchy apps
start with up-to-date AI guidance.
