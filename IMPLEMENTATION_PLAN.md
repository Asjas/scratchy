# Scratchy Framework — Implementation Plan

This document describes a phased plan for building the Scratchy framework from
the existing documentation and architecture specifications into working code.
Each phase builds on the previous one, with clear deliverables and acceptance
criteria.

## Dependency Graph

```
Phase 0: Project Bootstrap
    │
    ├──► Phase 1: Core (Fastify server, plugins, config)
    │        │
    │        ├──► Phase 2: Data Layer (Drizzle ORM, schema helpers)
    │        │        │
    │        │        └──► Phase 3: tRPC Integration (routers, middleware)
    │        │                 │
    │        └──► Phase 4: Renderer (Piscina, Worker Threads, Qwik SSR)
    │                         │
    │                         └──► Phase 5: Vite Plugin (bundling, dev server)
    │                                  │
    └──► Phase 6: CLI (scaffolding, templates)
             │
             └──► Phase 7: Example Application & Integration Tests
```

---

## Phase 0 — Project Bootstrap

**Goal:** Set up the monorepo, tooling, and CI pipeline so all subsequent phases
have a consistent development environment.

### Tasks

- [x] Initialize pnpm workspace with `pnpm-workspace.yaml`

  ```yaml
  packages:
    - "packages/*"
    - "examples/*"
  ```

- [x] Create root `package.json` with workspace scripts

  ```jsonc
  {
    "name": "scratchyjs",
    "private": true,
    "type": "module",
    "engines": { "node": ">=22" },
    "packageManager": "pnpm@10.32.1",
    "scripts": {
      "dev": "pnpm run --parallel --filter \"./examples/**\" dev",
      "build": "pnpm -r build",
      "test": "vitest run",
      "lint": "eslint --cache --cache-location .cache/eslint --cache-strategy content .",
      "format": "prettier \"**/*.+(ts|tsx|json|md|yaml|yml)\" --write --cache --cache-location .cache/prettier",
      "check-format": "prettier \"**/*.+(ts|tsx|json|md|yaml|yml)\" --list-different --cache --cache-location .cache/prettier",
      "typecheck": "tsc --noEmit",
      "validate": "pnpm check-format && pnpm lint && pnpm typecheck",
      "prepare": "husky",
    },
  }
  ```

- [x] Create root `tsconfig.json` (base configuration shared by all packages)

  ```jsonc
  {
    "compilerOptions": {
      "target": "ES2024",
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "strict": true,
      "noEmit": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true,
      "resolveJsonModule": true,
      "isolatedModules": true,
      "verbatimModuleSyntax": true,
      "noUncheckedIndexedAccess": true,
      "noUnusedLocals": true,
      "noUnusedParameters": true,
      "declaration": true,
      "declarationMap": true,
      "sourceMap": true,
    },
  }
  ```

- [x] Set up ESLint for linting (`eslint.config.mjs` — flat config with
      `typescript-eslint`, `eslint-plugin-n`, `eslint-plugin-promise`,
      `eslint-plugin-security`, `eslint-plugin-unused-imports`)
- [x] Set up Prettier for formatting (`.prettierrc` with
      `@trivago/prettier-plugin-sort-imports` and `prettier-plugin-tailwindcss`)
- [x] Set up Vitest as the test runner (root `vitest.config.ts`)
- [x] Create GitHub Actions CI workflow (`.github/workflows/ci.yml`)
  - Lint, format check, typecheck, and test on every push/PR
  - Matrix: Node.js 22.x, 24.x
  - Cache ESLint and Prettier results
- [x] Add `.npmrc` with `audit=false`, `fund=false`, `save-exact=true`
- [x] Add `.editorconfig` and `.gitattributes` for consistent formatting
- [x] Add `.prettierignore` for files Prettier should skip
- [x] Set up Husky + lint-staged for pre-commit hooks
- [x] Add `.github/copilot-setup-steps.yml` for Copilot coding agent
- [x] Update `.gitignore` for monorepo (node_modules, dist, coverage, .cache,
      etc.)
- [x] Create initial directory structure

  ```
  packages/
  ├── core/
  ├── cli/
  ├── renderer/
  ├── trpc/
  ├── drizzle/
  └── vite-plugin/
  examples/
  └── starter/
  ```

### Acceptance Criteria

- `pnpm install` succeeds with no errors
- `pnpm check-format` passes (Prettier finds no formatting issues)
- `pnpm lint` passes (ESLint finds no errors)
- `pnpm typecheck` passes (no TypeScript errors)
- `pnpm test` runs Vitest and passes
- GitHub Actions CI pipeline is green

---

## Phase 1 — Core Package (`packages/core`)

**Goal:** Build the Fastify server factory with plugin loading, configuration,
logging, error handling, and graceful shutdown. This is the backbone every other
package registers into.

### Package Identity

```jsonc
{
  "name": "@scratchyjs/core",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./plugins/*": "./src/plugins/*.ts",
  },
}
```

### Tasks

- [x] Create the Fastify server factory (`src/server.ts`)
  - Accept a configuration object (port, host, logging level, trust proxy)
  - Register `fastify-type-provider-zod` for Zod-based schema validation
  - Set up Pino structured logging
  - Configure `routerOptions` (ignore trailing slash, max param length)
- [x] Create configuration loader (`src/config.ts`)
  - Load from environment variables with Zod validation
  - Provide defaults for development
  - Export typed `Config` interface
- [x] Create plugin autoloading setup
  - `src/plugins/external/` for third-party plugins (CORS, Helmet, Rate Limit)
  - `src/plugins/app/` for application plugins
  - Use `@fastify/autoload` with `encapsulate: false` for shared scope
- [x] Implement built-in plugins
  - `src/plugins/external/helmet.ts` — `@fastify/helmet` with CSP
  - `src/plugins/external/rate-limit.ts` — `@fastify/rate-limit`
  - `src/plugins/external/sensible.ts` — `@fastify/sensible` for error helpers
- [x] Create error handler (`src/error-handler.ts`)
  - Handle Zod validation errors with structured messages
  - Handle Fastify HTTP errors
  - Log unexpected errors and return 500
  - 404 handler with rate limiting
- [x] Create health check route (`src/routes/health.ts`)
  - `GET /health` returning `{ status: "ok", timestamp: "<ISO>" }`
- [x] Set up graceful shutdown (`src/shutdown.ts`)
  - Use `close-with-grace` for SIGTERM/SIGINT
  - Drain connections before exit
- [x] Create Fastify type augmentation file (`src/types/fastify.d.ts`)
  - Declare `config` decorator on `FastifyInstance`
- [x] Export public API from `src/index.ts`
  - `createServer(config)` — the main factory
  - `definePlugin(fn)` — helper wrapping `fastify-plugin`
  - Re-export key types
- [x] Write unit tests
  - Server starts and responds to `/health`
  - Error handler returns proper error shapes
  - Config validation rejects invalid values
  - Graceful shutdown drains before closing

### Key Dependencies

```
fastify
@fastify/autoload
@fastify/cors
@fastify/helmet
@fastify/rate-limit
@fastify/sensible
fastify-plugin
fastify-type-provider-zod
close-with-grace
pino
zod
```

### Acceptance Criteria

- `createServer()` returns a Fastify instance that listens on the configured
  port
- Health check responds with `200 { status: "ok" }`
- Structured JSON logging via Pino
- Graceful shutdown on SIGTERM
- All tests pass

---

## Phase 2 — Data Layer Package (`packages/drizzle`)

**Goal:** Provide database connection pooling, schema namespace helpers, column
helpers, and patterns for prepared statements and migrations.

### Package Identity

```jsonc
{
  "name": "@scratchyjs/drizzle",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./helpers": "./src/helpers.ts",
    "./plugin": "./src/plugin.ts",
  },
}
```

### Tasks

- [x] Create connection pool factory (`src/pool.ts`)
  - Accept `DATABASE_URL` and pool sizing options
  - Append libpq keepalive parameters automatically
  - Set up TCP keepalive on new connections
  - Handle pool-level errors gracefully (log, don't crash)
  - Verify connection on startup with `SELECT 1`
- [x] Create schema namespace helper (`src/schema.ts`)
  - `createSchema(name)` returning a `pgSchema` instance
  - Default to `"app"` schema (configurable via `DATABASE_SCHEMA` env var)
- [x] Create column helpers (`src/helpers.ts`)
  - `timestamps` object with `createdAt` and `updatedAt` columns
  - `withTimezone: true` on all timestamp columns
  - `$onUpdateFn(() => new Date())` on `updatedAt`
- [x] Create Fastify plugin (`src/plugin.ts`)
  - Register as a Fastify plugin via `fastify-plugin`
  - Decorate `fastify.db` with the Drizzle instance
  - Decorate `fastify.pool` with the underlying `pg.Pool`
  - Clean up pool on `onClose` hook
  - Provide `declare module "fastify"` augmentation
- [x] Create `drizzle.config.ts` factory (`src/drizzle-config.ts`)
  - Export a helper function that generates the Drizzle Kit config
  - Enforce `casing: "snake_case"` and the custom schema
- [x] Document the prepared-statement pattern (module-scoped
      `db.select().prepare()`)
  - Provide example in the package README
- [x] Write unit tests
  - Pool factory creates a pool with correct options
  - Schema helper returns a valid `pgSchema`
  - Column helpers produce the correct Drizzle column definitions
  - Plugin decorates Fastify instance correctly (mock DB)

### Key Dependencies

```
drizzle-orm
pg
drizzle-kit (devDependency)
fastify-plugin
```

### Acceptance Criteria

- `createPool(url)` returns a configured `pg.Pool`
- `createSchema("app")` returns a Drizzle `pgSchema`
- `timestamps` spread object adds `createdAt`/`updatedAt` to any table
- Fastify plugin makes `fastify.db` and `fastify.pool` available
- All tests pass

---

## Phase 3 — tRPC Integration Package (`packages/trpc`)

**Goal:** Provide tRPC initialization, context creation, authentication and
authorization middleware, and Fastify adapter registration.

### Package Identity

```jsonc
{
  "name": "@scratchyjs/trpc",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./middleware": "./src/middleware.ts",
    "./plugin": "./src/plugin.ts",
    "./client": "./src/client.ts",
  },
}
```

### Tasks

- [x] Create tRPC initialization (`src/trpc.ts`)
  - `initTRPC.context<Context>().create()` with `superjson` transformer
  - Enable SSE with configurable `maxDurationMs` and ping interval
  - Export `router`, `publicProcedure`, `middleware` from the `t` instance
- [x] Create context factory (`src/context.ts`)
  - Accept `CreateFastifyContextOptions`
  - Extract user from request (delegate to auth plugin)
  - Provide `hasRole(role)` helper on the context
  - Export `Context` type
- [x] Create authentication middleware (`src/middleware.ts`)
  - `isAuthenticated` — rejects if `ctx.user` is null
  - `isAdmin` — rejects if user role is not `"admin"`
  - `isOwner` — checks `input.id` or `input.userId` against `ctx.user.id`
  - `isOwnerOrAdmin` — combines ownership and admin checks
  - Export `protectedProcedure` (public + `isAuthenticated`)
- [x] Create Fastify plugin (`src/plugin.ts`)
  - Register `@trpc/server/adapters/fastify` on `/trpc` prefix
  - Wire up `createContext`, `appRouter`, and `onError` handler
  - Set `responseMeta` for cache control headers
- [x] Create tRPC client factory (`src/client.ts`)
  - Export `createClient<AppRouter>()` using `httpBatchStreamLink`
  - Configure `superjson` transformer
  - Default to `POST` method override for E2E testing compatibility
- [x] Write unit tests
  - Context creation extracts user correctly
  - `isAuthenticated` middleware rejects unauthenticated requests
  - `isAdmin` middleware rejects non-admin users
  - `publicProcedure` works without auth
  - tRPC plugin registers on `/trpc` prefix

### Key Dependencies

```
@trpc/server
@trpc/client (for client export)
superjson
zod
fastify-plugin
```

### Acceptance Criteria

- `publicProcedure` and `protectedProcedure` are exported and usable
- Context provides `user` and `hasRole()` from the Fastify request
- Middleware chain correctly blocks unauthorized access
- tRPC Fastify plugin registers at `/trpc` and handles queries/mutations
- All tests pass

---

## Phase 4 — Renderer Package (`packages/renderer`)

**Goal:** Implement the Piscina worker pool for SSR and SSG, the worker entry
point, HTML shell templates, and SharedArrayBuffer/Redis communication
utilities.

### Package Identity

```jsonc
{
  "name": "@scratchyjs/renderer",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./worker": "./src/worker.ts",
    "./plugin": "./src/plugin.ts",
    "./shared-buffer": "./src/shared-buffer.ts",
  },
}
```

### Tasks

- [x] Create Piscina worker pool Fastify plugin (`src/plugin.ts`)
  - Register `fastify-piscina` with configurable thread counts
  - Default: `minThreads: 2`,
    `maxThreads: Math.max(4, os.availableParallelism())`
  - Set `idleTimeout`, `taskTimeout`, and `resourceLimits`
  - Provide `declare module "fastify"` augmentation for `fastify.runTask`
  - Drain pool on `onClose` hook
- [x] Create worker entry point (`src/worker.ts`)
  - Accept `RenderTask` with `type: "ssr" | "ssg"`, `route`, `props`, `headers`
  - Return `RenderResult` with `html`, `head`, `statusCode`, `headers`
  - Route to `renderSSR()` or `renderSSG()` based on task type
  - Wrap rendered HTML in the shell template
- [x] Create HTML shell template (`src/templates/shell.ts`)
  - Minimal `<!DOCTYPE html>` with head/body slots
  - Include viewport meta tag
  - Provide function `wrapInShell(body, head, options)` for composition
- [x] Implement SharedArrayBuffer utilities (`src/shared-buffer.ts`)
  - `createSharedBuffer(dataSize)` — allocate header + data region
  - `writeToBuffer(shared, payload)` — encode JSON, set data, notify
  - `readFromBuffer(shared, timeoutMs)` — wait, decode JSON, acknowledge
  - `BufferStatus` const object (IDLE, DATA_READY, CONSUMED, ERROR)
- [x] Implement Redis communication utilities (`src/redis-comm.ts`)
  - `storeRenderContext(redis, requestId, context, ttl)`
  - `getRenderContext(redis, requestId)`
  - `storeRenderResult(redis, requestId, html, ttl)`
  - `cleanupRenderContext(redis, requestId)`
- [x] Create SSR route handler helper (`src/ssr-handler.ts`)
  - Utility function that creates a Fastify route handler for SSR pages
  - Fetches data, dispatches to worker pool, returns HTML response
- [x] Write unit tests
  - SharedArrayBuffer write/read round-trip preserves data
  - Worker entry point dispatches to correct renderer based on task type
  - Shell template produces valid HTML
  - Plugin decorates Fastify with `runTask`

### Key Dependencies

```
piscina
fastify-plugin
ioredis (optional peerDependency — for Redis communication)
```

### Acceptance Criteria

- Worker pool starts with configured thread count
- `fastify.runTask({ type: "ssr", route: "/about" })` returns HTML
- SharedArrayBuffer round-trip works correctly across simulated threads
- SSG results can be cached and returned on subsequent requests
- All tests pass

---

## Phase 5 — Vite Plugin Package (`packages/vite-plugin`)

**Goal:** Provide a Vite plugin and config factory for bundling Scratchy client
code with Qwik, React interop, and Tailwind CSS.

### Package Identity

```jsonc
{
  "name": "@scratchyjs/vite-plugin",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
  },
}
```

### Tasks

- [x] Create Vite config factory (`src/index.ts`)
  - Export `scratchyVite(options)` plugin that composes:
    - `qwikVite()` from `@builder.io/qwik/optimizer`
    - `qwikCity()` from `@builder.io/qwik-city/vite`
    - `tsconfigPaths()` from `vite-tsconfig-paths`
    - `tailwindcss()` from `@tailwindcss/vite`
  - Configure `server.proxy` to forward `/trpc` and `/external/api` to the
    Fastify backend
  - Set `build.target` to `es2022`
  - Enable source maps for builds
- [x] Support optional React interop
  - If the user opts in, include `qwikReact()` from
    `@builder.io/qwik-react/vite`
- [x] Support manual chunk splitting
  - Separate `vendor-qwik`, `vendor-react` (if applicable), and `vendor` chunks
- [x] Create default Tailwind CSS configuration helper
  - Export a function that generates a `tailwind.config.ts` with sensible
    defaults (content paths, dark mode, font families)
- [x] Write unit tests
  - Plugin composition returns a valid Vite config
  - Proxy rules are correctly configured
  - React plugin is conditionally included

### Key Dependencies

```
vite (peerDependency)
@builder.io/qwik (peerDependency)
@builder.io/qwik-city (peerDependency)
@builder.io/qwik-react (optional peerDependency)
@tailwindcss/vite (peerDependency)
vite-tsconfig-paths
```

### Acceptance Criteria

- `scratchyVite()` returns an array of Vite plugins
- `vite dev` starts with proxying to the Fastify backend
- `vite build` produces optimized output with code splitting
- Tailwind CSS classes are processed correctly
- All tests pass

---

## Phase 6 — CLI Package (`packages/cli`)

**Goal:** Build the `scratchyjs` CLI with scaffolding commands for models,
routers, routes, components, pages, plugins, and full feature scaffolds.

### Package Identity

```jsonc
{
  "name": "@scratchyjs/cli",
  "type": "module",
  "bin": {
    "scratchy": "./src/index.ts",
  },
}
```

### Tasks

- [x] Set up CLI framework
  - Use [Citty](https://github.com/unjs/citty) for command parsing (lightweight,
    ESM-first, aligns with unjs ecosystem)
  - Use [Handlebars](https://handlebarsjs.com/) for template rendering
  - Use [Consola](https://github.com/unjs/consola) for console output
- [x] Create template files (`templates/`)
  - `model.ts.hbs` — Drizzle schema + type exports + relations
  - `queries.ts.hbs` — module-scoped prepared statements
  - `mutations.ts.hbs` — CRUD mutation functions
  - `router-queries.ts.hbs` — tRPC query procedures
  - `router-mutations.ts.hbs` — tRPC mutation procedures
  - `route.ts.hbs` — Fastify REST route with CORS
  - `component-qwik.tsx.hbs` — Qwik component
  - `component-react.tsx.hbs` — React component with `qwikify$` wrapper
  - `page.tsx.hbs` — Qwik page with `routeLoader$`
  - `plugin.ts.hbs` — Fastify plugin with `fp()`
- [x] Implement `make:model <Name>` command
  - Generate schema, queries, and mutations files
  - Support `--columns "title:text,published:boolean"` option
  - Support `--with-router` to also generate the tRPC router
- [x] Implement `make:router <name>` command
  - Generate tRPC queries and mutations files
  - Print instructions for registering in `src/routers/index.ts`
- [x] Implement `make:route <path>` command
  - Generate Fastify REST route with CORS
  - Create nested directories matching the path
- [x] Implement `make:component <name>` command
  - Default: Qwik component in `src/client/components/qwik/`
  - `--react` flag: React component in `src/client/components/react/`
- [x] Implement `make:page <path>` command
  - Generate Qwik page with `routeLoader$` in `src/client/routes/`
  - Support dynamic segments like `[slug]`
- [x] Implement `make:plugin <name>` command
  - Generate Fastify plugin in `src/plugins/app/`
  - Include `onClose` cleanup hook template
- [x] Implement `make:scaffold <Name>` command
  - Run `make:model`, `make:router`, create list and detail pages, create card
    and form components — all at once
- [x] Write unit tests
  - Each command generates files with the correct content
  - Handlebars templates render correctly with given context
  - `--columns` flag parses column definitions into the template
  - File paths follow kebab-case convention

### Key Dependencies

```
citty
consola
handlebars
```

### Acceptance Criteria

- `pnpm scratchy make:model Post` creates 3 files in the correct locations
- `pnpm scratchy make:scaffold Product` creates the full feature set (~9 files)
- Generated code follows all framework conventions (kebab-case files, ULID IDs,
  module-scoped prepared statements, custom schema namespace)
- All commands have `--help` output
- All tests pass

---

## Phase 7 — Example Application & Integration Tests

**Goal:** Build a working starter application that exercises every framework
package, and write integration and E2E tests to verify the entire stack.

### Application Identity

```jsonc
{
  "name": "@scratchyjs/example",
  "private": true,
  "type": "module",
}
```

### Tasks

- [x] Create the example application structure

  ```
  examples/starter/
  ├── src/
  │   ├── index.ts              # Entry point
  │   ├── server.ts             # Server setup using @scratchyjs/core
  │   ├── config.ts             # App config
  │   ├── auth.ts               # Better Auth instance using @scratchyjs/auth
  │   ├── router.ts             # tRPC init using @scratchyjs/trpc
  │   ├── context.ts            # tRPC context
  │   ├── db/
  │   │   ├── index.ts          # Drizzle instance using @scratchyjs/drizzle
  │   │   ├── my-schema.ts      # App schema namespace
  │   │   └── schema/
  │   │       ├── columns.helpers.ts
  │   │       ├── user.ts        # Users table (Better Auth compatible)
  │   │       ├── auth-tables.ts # Better Auth tables (session, account, verification)
  │   │       └── post.ts
  │   ├── routers/
  │   │   ├── index.ts
  │   │   └── posts/
  │   │       ├── queries.ts
  │   │       └── mutations.ts
  │   ├── renderer/
  │   │   └── worker.ts
  │   └── client/
  │       ├── routes/
  │       │   ├── layout.tsx
  │       │   └── index.tsx
  │       └── styles/
  │           └── global.css
  ├── public/
  ├── tsconfig.json
  ├── vite.config.ts
  ├── drizzle.config.ts
  └── package.json
  ```

- [x] Wire up all framework packages together
  - `@scratchyjs/core` for server
  - `@scratchyjs/auth` for authentication
  - `@scratchyjs/drizzle` for database
  - `@scratchyjs/trpc` for API
  - `@scratchyjs/renderer` for SSR
  - `@scratchyjs/vite-plugin` for client bundling
- [x] Create Docker Compose file for local infrastructure
  - PostgreSQL 16
  - DragonflyDB (Redis-compatible)
- [x] Create `.env.example` with all required environment variables
- [x] Integrate `@scratchyjs/auth` into the example application
  - Add `src/auth.ts` — configures Better Auth instance with `createAuth()`

    ```
    examples/starter/
    └── src/
        ├── auth.ts               # Better Auth instance (emailAndPassword + drizzle adapter)
        └── db/
            └── schema/
                ├── user.ts       # Updated: adds emailVerified + image fields
                └── auth-tables.ts# Better Auth tables: session, account, verification
    ```

  - Update `src/db/schema/user.ts` — add `emailVerified` and `image` fields
    required by Better Auth
  - Create `src/db/schema/auth-tables.ts` — session, account, and verification
    tables needed by the Better Auth drizzle adapter
  - Register `authPlugin` in `src/server.ts` when `BETTER_AUTH_SECRET` is set
  - Add `BETTER_AUTH_SECRET` to `src/config.ts` and `.env.example`
  - Use `requireAuth` preHandler hook on routes that need authentication
  - Extend `src/types/fastify.d.ts` to include auth type augmentation
  - See `.github/instructions/auth.instructions.md` for the full coding
    reference for `@scratchyjs/auth`

- [x] Write integration tests
  - Server starts and health check works
  - tRPC queries and mutations succeed
  - REST external routes respond with CORS headers
  - Database CRUD operations via tRPC
  - Worker pool renders SSR HTML
  - Auth plugin decorators (`request.session`, `request.user`) are registered
  - Auth routes are mounted at `/api/auth`
  - `requireAuth` returns 401 for unauthenticated requests
- [ ] Write E2E tests (optional, Playwright or Cypress)
  - Navigate to home page, verify SSR HTML
  - Interact with client-side component, verify Qwik resumability
- [x] Create README for the example app with getting started instructions

### Key Dependencies

All `@scratchyjs/*` packages plus:

```
vitest (devDependency)
@playwright/test (optional devDependency)
docker-compose (infrastructure)
```

### Acceptance Criteria

- `pnpm dev` starts the full stack (Fastify + Vite + Workers)
- Health check returns 200
- tRPC `posts.list` and `posts.create` work
- SSR renders a Qwik page via worker thread
- Integration tests pass in CI
- Docker Compose spins up Postgres and Redis
- Auth plugin registers and mounts Better Auth handler at `/api/auth`
- `request.user` is `null` for unauthenticated requests and typed as `AuthUser`
- `requireAuth` preHandler blocks unauthenticated requests with HTTP 401

---

## Milestones

| Milestone | Phases    | Description                             | Target     |
| --------- | --------- | --------------------------------------- | ---------- |
| **M0**    | Phase 0   | Monorepo bootstrapped, CI green         | Week 1     |
| **M1**    | Phase 1   | Fastify server factory working          | Week 2–3   |
| **M2**    | Phase 2–3 | Data layer + tRPC integrated            | Week 4–6   |
| **M3**    | Phase 4   | SSR rendering via Worker Threads        | Week 7–8   |
| **M4**    | Phase 5   | Vite bundling for client code           | Week 9     |
| **M5**    | Phase 6   | CLI scaffolding commands                | Week 10–11 |
| **M6**    | Phase 7   | Example app with integration tests      | Week 12–13 |
| **M7**    | —         | Documentation review and v0.1.0 release | Week 14    |

---

## Cross-Cutting Concerns

These apply to every phase and should be addressed continuously:

### Testing Strategy

| Layer       | Tool       | Scope                                   |
| ----------- | ---------- | --------------------------------------- |
| Unit        | Vitest     | Individual functions, helpers, utils    |
| Integration | Vitest     | Package interactions, Fastify injection |
| E2E         | Playwright | Full browser-based user flows           |

- Use `fastify.inject()` for integration testing HTTP endpoints without a
  running server
- Mock external services (database, Redis) in unit tests
- Use real infrastructure (Docker Compose) for integration tests
- Target **>80% code coverage** on core packages

### TypeScript Conventions

- Strict mode everywhere (`strict: true`)
- No `any` types — use `unknown` with type guards
- `import type` for type-only imports (enforced by `verbatimModuleSyntax: true`)
- `.js` extensions on all server-side imports
- Const objects instead of enums
- Every Fastify decorator gets a `declare module "fastify"` augmentation

### Documentation

- Each package gets a `README.md` with usage examples
- JSDoc comments on all exported functions and types
- The `docs/` directory remains the canonical reference
- Update `docs/getting-started.md` as packages mature

### Security

- `@fastify/helmet` on all responses
- `@fastify/rate-limit` on all routes (stricter on external APIs)
- CORS enabled **only** on `/external/api` routes
- Zod validation on every input (tRPC and REST)
- Drizzle parameterized queries prevent SQL injection
- `close-with-grace` for graceful shutdown (never double-register)
- All dependencies vetted for known vulnerabilities before adding

### Naming Conventions

- Files and folders: `kebab-case`
- Components: `PascalCase`
- Variables and functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Database tables and columns: `snake_case`
- IDs: ULID (via `ulid` package)

---

## Future Work (Post v0.1.0)

These are explicitly **out of scope** for the initial implementation but should
be planned for:

- [x] Authentication plugin (Better Auth integration)
- [x] `make:migration`, `make:seed`, `make:test` CLI commands
- [x] `db:seed`, `db:fresh`, `routes:list`, `cache:clear` CLI commands
- [x] OpenAPI/Swagger documentation generation for REST endpoints
- [x] SSG build-time pre-rendering pipeline
- [x] Streaming SSR (send HTML chunks as they render)
- [x] Turborepo or Nx for optimized monorepo task execution
- [x] `create-scratchy-app` initializer package
- [x] Lock-free ring buffer for high-throughput SharedArrayBuffer communication
- [ ] Multi-server cache invalidation via Redis Pub/Sub
- [ ] Plugin marketplace / community plugin conventions
- [ ] Performance benchmarking suite
