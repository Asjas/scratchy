# SCRATCHY_PROJECT_NAME

A new [Scratchy](https://scratchyjs.com) application — full-stack TypeScript, powered by Fastify, tRPC, Qwik & Drizzle.

## Stack

| Layer           | Package                   | Role                                      |
| --------------- | ------------------------- | ----------------------------------------- |
| HTTP server     | `@scratchyjs/core`        | Fastify with CORS, helmet, rate-limiting  |
| Authentication  | `@scratchyjs/auth`        | Better Auth with email/password           |
| Database        | `@scratchyjs/drizzle`     | Drizzle ORM with PostgreSQL               |
| API             | `@scratchyjs/trpc`        | Type-safe tRPC router                     |
| Rendering       | `@scratchyjs/renderer`    | Piscina SSR worker pool                   |
| Client bundling | `@scratchyjs/vite-plugin` | Vite + Qwik + Tailwind CSS                |
| Utilities       | `@scratchyjs/utils`       | Request helpers (IP, locale, prefetch, …) |

## Getting Started

### Prerequisites

- Node.js >= 24
- pnpm >= 10
- Docker + Docker Compose (for local infrastructure)

### 1. Start infrastructure

```bash
docker compose up -d
```

This starts:

- **PostgreSQL 16** on `localhost:5432`
- **DragonflyDB** (Redis-compatible) on `localhost:6379`

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and update the values as needed. Particularly:

- `BETTER_AUTH_SECRET` — generate with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

### 3. Install dependencies

```bash
pnpm install
```

### 4. Run database migrations

```bash
pnpm db:generate
pnpm db:migrate
```

### 5. Start the development server

```bash
pnpm dev
```

The server starts on [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── server.ts         # Fastify server setup and plugin registration
├── index.ts          # Application entry point
├── config.ts         # Environment and configuration loading
├── router.ts         # tRPC initialisation and middleware
├── context.ts        # tRPC context factory
├── auth.ts           # Better Auth instance
├── db/               # Database layer (Drizzle ORM)
│   ├── index.ts      # Drizzle instance + connection pool
│   ├── my-schema.ts  # PostgreSQL schema namespace
│   └── schema/       # Table definitions (one file per entity)
├── routers/          # tRPC routers (internal API)
│   └── posts/
│       ├── queries.ts
│       └── mutations.ts
├── renderer/         # Piscina worker thread (SSR)
│   └── worker.ts
└── client/           # Client-side code (bundled by Vite)
    ├── routes/       # Qwik City file-based routing
    └── styles/       # Tailwind CSS
```

## Scripts

| Script                | Description                          |
| --------------------- | ------------------------------------ |
| `pnpm dev`            | Start the development server         |
| `pnpm typecheck`      | Type-check with TypeScript           |
| `pnpm db:generate`    | Generate Drizzle migration files     |
| `pnpm db:migrate`     | Apply pending migrations             |
| `pnpm db:studio`      | Open Drizzle Studio                  |

## Learn More

- [Scratchy Documentation](https://scratchyjs.com)
- [Fastify](https://fastify.dev)
- [tRPC](https://trpc.io)
- [Qwik](https://qwik.dev)
- [Drizzle ORM](https://orm.drizzle.team)
- [Better Auth](https://www.better-auth.com)
