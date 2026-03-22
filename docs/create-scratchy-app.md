# create-scratchy-app

> **Diátaxis type: [Reference](https://diataxis.fr/reference/) +
> [How-to Guide](https://diataxis.fr/how-to-guides/)** — installation commands,
> CLI options, feature selection, and generated project structure.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [CLI Options](#cli-options)
- [Interactive Mode](#interactive-mode)
- [Feature Selection](#feature-selection)
  - [Database (Drizzle ORM + PostgreSQL)](#database-drizzle-orm--postgresql)
  - [Authentication (Better Auth)](#authentication-better-auth)
  - [Renderer (Piscina SSR)](#renderer-piscina-ssr)
- [Generated Project Structure](#generated-project-structure)
- [Template Stack](#template-stack)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [Non-Interactive Mode](#non-interactive-mode)
- [Package Manager Detection](#package-manager-detection)
- [Related Documentation](#related-documentation)

---

## Overview

`create-scratchy-app` is the official project scaffolding CLI for the Scratchy
framework. It creates a fully configured, production-ready starter application
with Fastify, tRPC, Drizzle ORM, Better Auth, Qwik, and Tailwind CSS — all wired
up and ready to run.

The CLI is interactive by default, guiding you through project setup with
sensible defaults. It can also be run non-interactively with the `--yes` flag
for CI/automation workflows.

## Quick Start

```bash
# With pnpm (recommended)
pnpm create scratchy-app my-app

# With npm
npx create-scratchy-app my-app

# With yarn
yarn create scratchy-app my-app

# With bun
bun create scratchy-app my-app
```

After scaffolding completes, follow the printed next-steps to configure your
environment and start the dev server.

## Installation

`create-scratchy-app` is designed to be run via your package manager's `create`
command — **no global install is required**.

```bash
# Recommended — runs the latest version without installing globally
pnpm create scratchy-app
npx create-scratchy-app
```

The package is published as
[`@scratchyjs/create-scratchy-app`](https://www.npmjs.com/package/@scratchyjs/create-scratchy-app)
with two bin entries:

| Binary                | Usage                                                                 |
| --------------------- | --------------------------------------------------------------------- |
| `create-scratchy`     | `pnpm create scratchy my-app`                                         |
| `create-scratchy-app` | `pnpm create scratchy-app my-app` or `npx create-scratchy-app my-app` |

Both binaries are identical — use whichever you prefer.

## CLI Options

```
create-scratchy-app [project-name] [options]
```

| Option           | Short | Description                             | Default  |
| ---------------- | ----- | --------------------------------------- | -------- |
| `[project-name]` | —     | Name and directory for the new project  | Prompted |
| `--yes`          | `-y`  | Skip all prompts and use default values | `false`  |
| `--version`      | `-v`  | Print the CLI version and exit          | —        |
| `--help`         | `-h`  | Show usage information and exit         | —        |

### Examples

```bash
# Fully interactive — prompts for everything
pnpm create scratchy-app

# Provide project name, prompted for features
pnpm create scratchy-app my-app

# Skip all prompts — use all defaults
pnpm create scratchy-app my-app --yes

# Check version
npx create-scratchy-app --version

# Show help
npx create-scratchy-app --help
```

## Interactive Mode

When run without `--yes`, the CLI walks you through these prompts:

| Prompt                    | Type    | Default           | Notes                                      |
| ------------------------- | ------- | ----------------- | ------------------------------------------ |
| **Project name**          | Text    | `my-scratchy-app` | Must match `^[a-z0-9][-a-z0-9._]*$`        |
| **Include Drizzle ORM?**  | Confirm | Yes               | PostgreSQL + DragonflyDB                   |
| **Include Better Auth?**  | Confirm | Yes               | Auto-enables DB if selected                |
| **Include Piscina SSR?**  | Confirm | Yes               | Worker thread rendering pool               |
| **Initialise git?**       | Confirm | Yes               | Runs `git init` + initial commit           |
| **Package manager**       | Select  | Auto-detected     | pnpm, npm, yarn, or bun                    |
| **Install dependencies?** | Confirm | Yes               | Runs install with selected package manager |

If the target directory already exists and is not empty, you will be asked
whether to continue and potentially overwrite files.

<!-- prettier-ignore -->
::: tip Auth requires Database
If you select **Better Auth** but deselect **Database**, the CLI automatically
enables the database — auth needs Drizzle ORM for session and account storage.
:::

## Feature Selection

The CLI allows you to opt out of individual framework features. When you
deselect a feature, the corresponding files, imports, server configuration
blocks, and environment variables are cleanly removed from the generated
project.

### Database (Drizzle ORM + PostgreSQL)

**Included by default.** When deselected:

- `src/db/` directory is removed
- `src/auth.ts` is removed (auth depends on DB)
- `drizzle.config.ts` is removed
- `docker-compose.yml` is removed
- `DATABASE_URL`, `DATABASE_SCHEMA`, and `REDIS_URL` are stripped from
  `.env.example`
- Database and auth blocks are removed from `src/server.ts`

### Authentication (Better Auth)

**Included by default.** When deselected:

- `src/auth.ts` is removed
- `src/db/schema/auth-tables.ts` is removed
- Auth table exports are removed from `src/db/schema/index.ts`
- `BETTER_AUTH_SECRET` and `ORIGIN` are stripped from `.env.example`
- Auth blocks are removed from `src/server.ts`

### Renderer (Piscina SSR)

**Included by default.** When deselected:

- `src/renderer/` directory is removed
- Renderer blocks (worker pool setup + SSR catch-all route) are removed from
  `src/server.ts`

## Generated Project Structure

With all features enabled, the scaffolded project looks like this:

```
my-app/
├── .env.example              # Environment variable template
├── .github/
│   └── instructions/         # AI coding assistant guidance
│       ├── scratchy.instructions.md
│       └── security.instructions.md
├── .gitignore
├── AGENTS.md                 # AI agent guidance (Copilot, Claude, etc.)
├── README.md
├── docker-compose.yml        # PostgreSQL + DragonflyDB
├── drizzle.config.ts         # Drizzle Kit configuration
├── package.json
├── tsconfig.json
├── vite.config.ts            # Vite + Qwik + Tailwind
├── public/                   # Static assets
└── src/
    ├── index.ts              # Application entry point
    ├── server.ts             # Fastify server setup + plugin registration
    ├── config.ts             # Zod environment schema
    ├── router.ts             # tRPC initialisation + middleware
    ├── context.ts            # tRPC context factory
    ├── auth.ts               # Better Auth instance
    ├── db/                   # Database layer (Drizzle ORM)
    │   ├── index.ts          # Drizzle instance + connection pool
    │   ├── my-schema.ts      # PostgreSQL schema namespace
    │   └── schema/           # Table definitions (one file per entity)
    │       ├── index.ts      # Barrel export
    │       ├── columns.helpers.ts
    │       ├── user.ts
    │       ├── post.ts
    │       └── auth-tables.ts
    ├── routers/              # tRPC routers (internal API)
    │   ├── index.ts          # Router aggregation
    │   └── posts/
    │       ├── queries.ts    # Post query procedures
    │       └── mutations.ts  # Post mutation procedures
    ├── renderer/             # Piscina worker thread (SSR)
    │   └── worker.ts
    ├── types/                # TypeScript augmentations
    │   └── fastify.d.ts
    └── client/               # Client-side code (bundled by Vite)
        ├── routes/
        │   ├── layout.tsx    # Root Qwik layout
        │   └── index.tsx     # Home page
        └── styles/
            └── global.css    # Tailwind CSS entry point
```

## Template Stack

| Layer           | Package                   | Role                                      |
| --------------- | ------------------------- | ----------------------------------------- |
| HTTP server     | `@scratchyjs/core`        | Fastify with CORS, helmet, rate-limiting  |
| Authentication  | `@scratchyjs/auth`        | Better Auth with email/password           |
| Database        | `@scratchyjs/drizzle`     | Drizzle ORM with PostgreSQL               |
| API             | `@scratchyjs/trpc`        | Type-safe tRPC router                     |
| Rendering       | `@scratchyjs/renderer`    | Piscina SSR worker pool                   |
| Client bundling | `@scratchyjs/vite-plugin` | Vite + Qwik + Tailwind CSS                |
| Utilities       | `@scratchyjs/utils`       | Request helpers (IP, locale, prefetch, …) |

## Environment Variables

The generated `.env.example` includes all variables needed to run the
application:

| Variable             | Default                                                  | Feature  | Description                                        |
| -------------------- | -------------------------------------------------------- | -------- | -------------------------------------------------- |
| `PORT`               | `3000`                                                   | Core     | Server port                                        |
| `HOST`               | `0.0.0.0`                                                | Core     | Server host                                        |
| `NODE_ENV`           | `development`                                            | Core     | Environment mode                                   |
| `LOG_LEVEL`          | `info`                                                   | Core     | Pino log level                                     |
| `TRUST_PROXY`        | `true`                                                   | Core     | Trust `X-Forwarded-*` headers                      |
| `DATABASE_URL`       | `postgresql://scratchy:scratchy@localhost:5432/scratchy` | Database | PostgreSQL connection string                       |
| `DATABASE_SCHEMA`    | `app`                                                    | Database | Custom PostgreSQL schema namespace                 |
| `REDIS_URL`          | `redis://localhost:6379`                                 | Database | DragonflyDB (Redis-compatible) URL                 |
| `BETTER_AUTH_SECRET` | —                                                        | Auth     | Secret key for session signing (min 32 chars)      |
| `ORIGIN`             | `http://localhost:3000`                                  | Auth     | Application base URL for trusted-origin validation |

## Scripts

| Script        | Command                | Description                      |
| ------------- | ---------------------- | -------------------------------- |
| `dev`         | `tsx src/index.ts`     | Start the development server     |
| `typecheck`   | `tsc --noEmit`         | Type-check with TypeScript       |
| `db:generate` | `drizzle-kit generate` | Generate Drizzle migration files |
| `db:migrate`  | `drizzle-kit migrate`  | Apply pending migrations         |
| `db:studio`   | `drizzle-kit studio`   | Open Drizzle Studio              |

## Non-Interactive Mode

Use `--yes` (or `-y`) to skip all prompts and scaffold with defaults:

```bash
pnpm create scratchy-app my-app --yes
```

Default values in non-interactive mode:

| Setting         | Default Value     |
| --------------- | ----------------- |
| Project name    | `my-scratchy-app` |
| Database        | Included          |
| Authentication  | Included          |
| Renderer        | Included          |
| Git init        | Yes               |
| Package manager | Auto-detected     |
| Install deps    | Yes               |

This is useful for CI pipelines, automation scripts, or when you want the full
stack without any questions.

## Package Manager Detection

The CLI auto-detects which package manager you are using by inspecting the
`npm_config_user_agent` environment variable that package managers set when
running `create` commands:

| User agent prefix | Detected as |
| ----------------- | ----------- |
| `pnpm/*`          | pnpm        |
| `yarn/*`          | yarn        |
| `bun/*`           | bun         |
| Other / unset     | npm         |

The detected package manager is used as the default selection in the interactive
prompt and determines the correct install/run commands shown in next-steps.

## Related Documentation

- [Getting Started](./getting-started.md) — Set up a Scratchy development
  environment
- [Project Structure](./project-structure.md) — Where files belong in a Scratchy
  application
- [CLI Scaffolding](./cli.md) — The `scratchy` CLI for scaffolding individual
  components
- [Data Layer](./data-layer.md) — Drizzle ORM schemas, queries, and migrations
- [API Design](./api-design.md) — tRPC and REST API patterns
- [Security](./security.md) — OWASP security patterns for Scratchy applications
