# @scratchy/example — Starter Application

A minimal but complete example application demonstrating how to wire up all
Scratchy framework packages together.

## What It Shows

| Layer           | Package                 | Role                                      |
| --------------- | ----------------------- | ----------------------------------------- |
| HTTP server     | `@scratchy/core`        | Fastify with CORS, helmet, rate-limiting  |
| Database        | `@scratchy/drizzle`     | Drizzle ORM with PostgreSQL               |
| API             | `@scratchy/trpc`        | Type-safe tRPC router for `posts`         |
| Rendering       | `@scratchy/renderer`    | Piscina SSR worker pool                   |
| Client bundling | `@scratchy/vite-plugin` | Vite + Qwik + Tailwind CSS                |
| Utilities       | `@scratchy/utils`       | Request helpers (IP, locale, prefetch, …) |

## Getting Started

### Prerequisites

- Node.js >= 22
- pnpm >= 10
- Docker + Docker Compose (for local infrastructure)

### 1. Start infrastructure

```bash
# From examples/starter/
docker compose up -d
```

This starts:

- **PostgreSQL 16** on `localhost:5432`
- **DragonflyDB** (Redis-compatible) on `localhost:6379`

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env if you changed any credentials in docker-compose.yml
```

### 3. Install dependencies

```bash
# From the monorepo root
pnpm install
```

### 4. Run database migrations

```bash
# From examples/starter/
pnpm drizzle-kit migrate --config drizzle.config.ts
```

### 5. Start the server

```bash
# From examples/starter/
pnpm dev
```

The server starts on `http://localhost:3000`.

## API Endpoints

| Method | URL                   | Description                               |
| ------ | --------------------- | ----------------------------------------- |
| GET    | `/health`             | Health check — returns `{ status: "ok" }` |
| GET    | `/trpc/posts.list`    | List posts (tRPC query)                   |
| POST   | `/trpc/posts.create`  | Create a post (tRPC mutation)             |
| GET    | `/trpc/posts.getById` | Get a post by ID (tRPC query)             |
| POST   | `/trpc/posts.update`  | Update a post (tRPC mutation)             |
| POST   | `/trpc/posts.delete`  | Delete a post (tRPC mutation)             |
| GET    | `/*`                  | Server-side rendered page                 |

## Project Structure

```
src/
├── index.ts              # Server entry point
├── server.ts             # Server factory (wires all packages)
├── config.ts             # App config (extends @scratchy/core)
├── router.ts             # tRPC re-exports
├── context.ts            # tRPC context re-export
├── db/
│   ├── index.ts          # Schema exports
│   ├── my-schema.ts      # PostgreSQL schema namespace
│   └── schema/
│       ├── columns.helpers.ts  # Shared timestamp columns
│       ├── user.ts             # User table + relations
│       └── post.ts             # Post table + relations
├── routers/
│   ├── index.ts          # Root tRPC router (appRouter)
│   └── posts/
│       ├── queries.ts    # posts.list, posts.getById
│       └── mutations.ts  # posts.create, posts.update, posts.delete
├── renderer/
│   └── worker.ts         # Piscina SSR worker (delegates to @scratchy/renderer)
├── client/
│   ├── routes/
│   │   ├── layout.tsx    # Qwik root layout
│   │   └── index.tsx     # Qwik home page
│   └── styles/
│       └── global.css    # Tailwind CSS entry point
└── server.test.ts        # Integration tests
```

## Running Tests

```bash
# From the monorepo root
pnpm test
```

Integration tests use an in-memory tRPC router so they run in CI without a real
database. To test against a live database, set `DATABASE_URL` and the tests will
use the real Drizzle plugin.

## Adding a New Domain

1. Create `src/db/schema/thing.ts` with your table definition
2. Export it from `src/db/schema/index.ts`
3. Create `src/routers/things/queries.ts` and `mutations.ts`
4. Add `things: router({ ...thingQueries, ...thingMutations })` to
   `src/routers/index.ts`
5. Run `pnpm drizzle-kit generate` to create the migration
