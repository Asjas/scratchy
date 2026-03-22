# @scratchy/example — Starter Application

A minimal but complete example application demonstrating how to wire up all
Scratchy framework packages together.

## What It Shows

| Layer           | Package                 | Role                                      |
| --------------- | ----------------------- | ----------------------------------------- |
| HTTP server     | `@scratchy/core`        | Fastify with CORS, helmet, rate-limiting  |
| Authentication  | `@scratchy/auth`        | Better Auth with email/password           |
| Database        | `@scratchy/drizzle`     | Drizzle ORM with PostgreSQL               |
| API             | `@scratchy/trpc`        | Type-safe tRPC router for `posts`         |
| Rendering       | `@scratchy/renderer`    | Piscina SSR worker pool                   |
| Client bundling | `@scratchy/vite-plugin` | Vite + Qwik + Tailwind CSS                |
| Utilities       | `@scratchy/utils`       | Request helpers (IP, locale, prefetch, …) |

## Getting Started

### Prerequisites

- Node.js >= 24
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

Generate a `BETTER_AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **Note:** `pnpm dev` uses Node's `--env-file=.env` flag to load environment
> variables automatically. No additional dotenv loader is required.

### 3. Install dependencies

```bash
# From the monorepo root
pnpm install
```

### 4. Run database migrations

```bash
# From examples/starter/
pnpm dlx drizzle-kit migrate --config drizzle.config.ts
```

### 5. Start the server

```bash
# From examples/starter/
pnpm dev
```

The server starts on `http://localhost:3000`.

## API Endpoints

| Method | URL                       | Description                               |
| ------ | ------------------------- | ----------------------------------------- |
| GET    | `/health`                 | Health check — returns `{ status: "ok" }` |
| POST   | `/api/auth/sign-up/email` | Register a new user (Better Auth)         |
| POST   | `/api/auth/sign-in/email` | Sign in with email and password           |
| POST   | `/api/auth/sign-out`      | Sign out the current user                 |
| GET    | `/api/auth/session`       | Get the current session                   |
| GET    | `/trpc/posts.list`        | List posts (tRPC query)                   |
| POST   | `/trpc/posts.create`      | Create a post (tRPC mutation)             |
| GET    | `/trpc/posts.getById`     | Get a post by ID (tRPC query)             |
| POST   | `/trpc/posts.update`      | Update a post (tRPC mutation)             |
| POST   | `/trpc/posts.delete`      | Delete a post (tRPC mutation)             |
| GET    | `/*`                      | Server-side rendered page                 |

## Authentication

Authentication is handled by [Better Auth](https://www.better-auth.com/) via
`@scratchy/auth`. The auth instance is created in `src/auth.ts` and registered
as a Fastify plugin in `src/server.ts`.

### How it works

1. **`src/auth.ts`** — creates the Better Auth instance with email/password
   support and a Drizzle ORM adapter for persistent session storage.
2. **`src/server.ts`** — registers `authPlugin` from `@scratchy/auth/plugin`
   after the database plugin (so `server.db` is available).
3. Every request gets `request.session` and `request.user` decorators set by the
   auth plugin's `onRequest` hook (both `null` when unauthenticated).

### Protecting routes

```typescript
import { requireAdmin, requireAuth } from "@scratchy/auth/hooks";

// Authenticated users only
fastify.get("/profile", { preHandler: requireAuth }, (request) => {
  return { user: request.user };
});

// Admin users only
fastify.delete("/users/:id", { preHandler: requireAdmin }, async (request) => {
  // ...
});
```

### Database schema

Better Auth requires four tables managed in `src/db/schema/`:

| File             | Tables                                 |
| ---------------- | -------------------------------------- |
| `user.ts`        | `user` (with `emailVerified`, `image`) |
| `auth-tables.ts` | `session`, `account`, `verification`   |

### Environment variables

| Variable             | Description                           |
| -------------------- | ------------------------------------- |
| `BETTER_AUTH_SECRET` | Secret key for signing tokens/cookies |
| `ORIGIN`             | App base URL for trusted-origin check |

## Project Structure

```
src/
├── index.ts              # Server entry point
├── server.ts             # Server factory (wires all packages)
├── config.ts             # App config (extends @scratchy/core)
├── auth.ts               # Better Auth instance (createAppAuth)
├── router.ts             # tRPC re-exports
├── context.ts            # tRPC context re-export
├── db/
│   ├── index.ts          # Schema exports
│   ├── my-schema.ts      # PostgreSQL schema namespace
│   └── schema/
│       ├── columns.helpers.ts  # Shared timestamp columns
│       ├── user.ts             # User table + Better Auth fields
│       ├── auth-tables.ts      # session, account, verification tables
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

Integration tests use an in-memory tRPC router and an in-memory Better Auth
instance so they run in CI without a real database. Auth endpoint reachability
is verified (the routes are mounted) but actual sign-up/sign-in flows require a
connected database.

## Adding a New Domain

1. Create `src/db/schema/thing.ts` with your table definition
2. Export it from `src/db/schema/index.ts`
3. Create `src/routers/things/queries.ts` and `mutations.ts`
4. Add `things: router({ ...thingQueries, ...thingMutations })` to
   `src/routers/index.ts`
5. Run `pnpm drizzle-kit generate` to create the migration
