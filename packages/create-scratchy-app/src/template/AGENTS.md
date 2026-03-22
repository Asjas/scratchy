# SCRATCHY_PROJECT_NAME — AI Agent Guidance

This file provides guidance to AI coding agents (Claude Code, Cursor AI, Codex,
Gemini CLI, GitHub Copilot, and other AI coding assistants) when working with
code in this Scratchy application.

## What This Application Is

This is a **Scratchy** application — a full-stack TypeScript project for hosted
servers (not serverless), powered by:

| Layer         | Technology                                             |
| ------------- | ------------------------------------------------------ |
| Runtime       | Node.js (>=24) with Worker Threads                     |
| API Framework | Fastify 5                                              |
| RPC Layer     | tRPC 11 (internal APIs) + RESTful endpoints (external) |
| Rendering     | Qwik (primary) with React support via `qwik-react`     |
| Bundling      | Vite                                                   |
| Data Layer    | Drizzle ORM with PostgreSQL                            |
| Styling       | Tailwind CSS                                           |
| Worker Pool   | Piscina (via `fastify-piscina`)                        |
| Auth          | Better Auth (via `@scratchyjs/auth`)                   |
| Language      | TypeScript (strict mode, type stripping for Node.js)   |

**Design principles:**

- Server-first — built for hosted/dedicated servers, not serverless
- Worker-based rendering — SSR and SSG run in Worker Threads via Piscina
- RPC-first, REST-capable — tRPC for internal use, RESTful for external with
  CORS
- Type-safe end-to-end — TypeScript from database schema to client components
- Convention over configuration — CLI scaffolding for models, views, api,
  controllers

## Project Structure

```
SCRATCHY_PROJECT_NAME/
├── .github/
│   └── instructions/          # AI coding assistant instruction files
├── src/
│   ├── index.ts               # Application entry point
│   ├── config.ts              # Environment config (Zod schema)
│   ├── server.ts              # Fastify server setup + plugin registration
│   ├── router.ts              # tRPC router init with middleware
│   ├── context.ts             # tRPC context creation
│   ├── auth.ts                # Better Auth instance factory
│   ├── types/
│   │   └── fastify.d.ts       # TypeScript augmentation for Fastify
│   ├── routers/               # tRPC domain routers
│   │   ├── index.ts           # Aggregates all routers → appRouter
│   │   └── posts/
│   │       ├── queries.ts     # Read procedures
│   │       └── mutations.ts   # Write procedures
│   ├── db/
│   │   ├── index.ts           # Drizzle instance + connection pool
│   │   ├── my-schema.ts       # PostgreSQL schema namespace
│   │   └── schema/
│   │       ├── index.ts       # Re-exports all schemas
│   │       ├── columns.helpers.ts  # Shared timestamp columns
│   │       ├── user.ts        # User table + type exports
│   │       ├── post.ts        # Post table + relations
│   │       └── auth-tables.ts # Better Auth tables (session, account, etc.)
│   ├── renderer/
│   │   └── worker.ts          # Worker thread entry point (SSR/SSG)
│   └── client/
│       ├── routes/
│       │   ├── layout.tsx     # Root layout (wraps all pages)
│       │   └── index.tsx      # Home page
│       └── styles/
│           └── global.css     # Tailwind CSS imports
├── public/                    # Static assets
├── drizzle.config.ts          # Drizzle Kit configuration
├── vite.config.ts             # Vite bundler configuration
├── tsconfig.json              # TypeScript config (~/  path alias)
├── docker-compose.yml         # PostgreSQL + DragonflyDB services
├── .env.example               # Environment variable template
├── AGENTS.md                  # This file
└── package.json
```

## Commands

Use **pnpm** as the package manager (recommended; never npm or yarn in CI).

```bash
# Development
pnpm dev                              # Start the dev server (via tsx)
pnpm build                            # Build all packages

# Validation (run before every commit)
pnpm format && pnpm lint && pnpm typecheck && pnpm build

# Testing
pnpm test                             # Run all tests (Vitest)

# Database
pnpm drizzle-kit generate             # Generate migration from schema changes
pnpm drizzle-kit migrate              # Apply pending migrations
pnpm drizzle-kit studio               # Open visual database browser

# Docker (local PostgreSQL + Redis)
docker compose up -d                   # Start services
docker compose down                    # Stop services
```

### Scratchy CLI (Scaffolding)

The Scratchy CLI (`pnpm scratchy <command>`) generates boilerplate files:

```bash
# Models (Drizzle schema + queries + mutations)
pnpm scratchy make:model Product
pnpm scratchy make:model Product --columns "title:text,price:numeric,published:boolean"
pnpm scratchy make:model Product --columns "title:text" --with-router

# tRPC Routers
pnpm scratchy make:router product

# Fastify REST Routes (for external APIs)
pnpm scratchy make:route external/api/v1/products

# Qwik Components
pnpm scratchy make:component UserCard
pnpm scratchy make:component UserCard --react   # React component with qwikify$ wrapper

# Qwik Pages
pnpm scratchy make:page blog/[slug]

# Fastify Plugins
pnpm scratchy make:plugin cache

# Full CRUD Scaffold (model + router + pages + components)
pnpm scratchy make:scaffold Product --columns "title:text,price:numeric"

# Database
pnpm scratchy make:migration add_role_to_users
pnpm scratchy make:seed Users
pnpm scratchy make:seed Users --model User
pnpm scratchy db:seed                 # Run all seed files
pnpm scratchy db:seed users           # Run a specific seed
pnpm scratchy db:fresh                # Drop all tables + re-apply migrations (dev only!)

# Tests
pnpm scratchy make:test routers/posts/queries

# Utilities
pnpm scratchy routes:list             # List all registered routes
pnpm scratchy cache:clear             # Remove build caches
```

All `make:*` commands accept a `--cwd` flag to specify the working directory.

### create-scratchy-app (Project Scaffolding)

```bash
# Interactive mode — prompts for project name and features
pnpm create scratchy-app
npx create-scratchy-app

# With project name
pnpm create scratchy-app my-app
npx create-scratchy-app my-app

# Skip prompts — use all defaults
npx create-scratchy-app my-app --yes
npx create-scratchy-app my-app -y

# Other flags
npx create-scratchy-app --version     # Print version
npx create-scratchy-app --help        # Show help

# Feature prompts (when not using --yes):
#   - Include Drizzle ORM + PostgreSQL? (default: yes)
#   - Include Better Auth? (default: yes, requires DB)
#   - Include Piscina SSR worker pool? (default: yes)
#   - Initialise git repository? (default: yes)
#   - Package manager? (pnpm/npm/yarn/bun, default: auto-detected)
#   - Install dependencies? (default: yes)
```

## Critical Rules

1. **Always use pnpm** — never npm or yarn.
2. **TypeScript strict mode** — no `any` types, use `unknown` and type guards.
3. **Node.js type stripping** — use `import type` for type-only imports, avoid
   enums (use const objects), avoid namespaces and parameter properties.
4. **Server imports use `.js` extension** (ESM resolution); client imports omit
   extensions (Vite resolves them).
5. **Path alias `~/`** — all imports within `src/` use `~/` prefix (e.g.,
   `import { db } from "~/db/index.js"`). Configured in `tsconfig.json` as
   `"~/*": ["./src/*"]`.
6. **`async` only when `await` is needed** — `async` wraps the return in a
   Promise (extra allocation per call). Never mix `async` + `done()` callbacks.
7. **Filenames and folder names** use kebab-case — e.g., `worker-pool.ts`,
   `api-router.ts`. Never PascalCase or camelCase for file/folder names.
8. **Commit messages** follow Conventional Commits:
   `<type>(<scope>): <subject>`.
9. **Fastify plugins with decorators** require `declare module "fastify"`
   augmentation so TypeScript knows about `fastify.db`, `fastify.config`, etc.
10. **Structured logging** — use `request.log` inside route handlers (not
    `fastify.log`). Always pass an object first:
    `request.log.info({ userId }, "message")`.
11. **Drizzle schemas** use a custom schema namespace (`mySchema.table()`) —
    never use the default `public` schema.
12. **Drizzle migration files are immutable** — never edit generated `.sql`
    files.
13. **Worker Threads** — heavy synchronous work (SSR, SSG) must run in Worker
    Threads via Piscina. Never block the main event loop.
14. **tRPC for internal APIs** — all internal API communication uses tRPC with
    superjson transformer.
15. **REST for external APIs** — external-facing endpoints use Fastify routes
    under `/external/api` with CORS enabled.
16. **IDs** use ULID (`import { ulid } from "ulid"`).
17. **Prepared statements** must be module-scoped (top-level), never inside
    functions.
18. **Graceful shutdown** — use `close-with-grace` for SIGTERM/SIGINT handling.

## Coding Conventions

- **TypeScript**: Strict mode, no `any`, double quotes, semicolons, `const` over
  `let`.
- **Naming**: PascalCase for components, camelCase for variables/functions,
  snake_case for DB tables/columns.
- **Components**: Use Qwik's `component$()` for Qwik components, ES5 function
  declarations for React components.
- **Type exports**: `export type AllItems = Awaited<ReturnType<typeof fn>>`.
- **Function style**: Only add `async` when `await` is used inside the function.
- **Error handling**: Use `fastify.to(promise)` for `[err, result]` tuples. Use
  `TRPCError` for tRPC procedures, `createError()` for REST routes.
- **Data loading**: Use `routeLoader$()` for server-side data in route
  components. Never fetch data client-side when SSR can provide it.
- **Form handling**: Use `routeAction$()` with `zod$()` validation for form
  submissions. Use the `<Form>` component for progressive enhancement.

## Instruction Files

Detailed coding patterns are in `.github/instructions/`:

| File                       | Scope                                                 |
| -------------------------- | ----------------------------------------------------- |
| `scratchy.instructions.md` | Framework patterns, API, auth, imports, tRPC, Drizzle |
| `security.instructions.md` | OWASP Top 10 mapped to Scratchy patterns              |

## Reference Documentation

Full framework documentation: **https://scratchyjs.com**
