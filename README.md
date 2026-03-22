# Scratchy

[![CI](https://github.com/Asjas/scratchyjs/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Asjas/scratchyjs/actions/workflows/ci.yml)
[![CodeQL Analysis](https://github.com/Asjas/scratchyjs/actions/workflows/codeql-analysis.yml/badge.svg?branch=main)](https://github.com/Asjas/scratchyjs/actions/workflows/codeql-analysis.yml)
[![Deploy Docs](https://github.com/Asjas/scratchyjs/actions/workflows/docs.yml/badge.svg?branch=main)](https://github.com/Asjas/scratchyjs/actions/workflows/docs.yml)
[![Cypress Docs E2E](https://github.com/Asjas/scratchyjs/actions/workflows/docs-cypress.yml/badge.svg?branch=main)](https://github.com/Asjas/scratchyjs/actions/workflows/docs-cypress.yml)
[![Publish](https://github.com/Asjas/scratchyjs/actions/workflows/publish.yml/badge.svg)](https://github.com/Asjas/scratchyjs/actions/workflows/publish.yml)

A full-stack TypeScript framework for building APIs and websites on hosted
servers (not serverless). Built on Fastify, tRPC, Qwik, Drizzle ORM, and Piscina
worker threads.

## Packages

| Package                                                       | Description                                                                                    |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`@scratchyjs/auth`](./packages/auth/README.md)               | Authentication via Better Auth — Fastify plugin, session hooks, preHandler guards              |
| [`@scratchyjs/cli`](./packages/cli/README.md)                 | Code-generation CLI — scaffold models, routers, routes, pages, plugins, and more               |
| [`@scratchyjs/core`](./packages/core/README.md)               | Core framework — Fastify server factory, config loader, error handler, security plugins        |
| [`@scratchyjs/drizzle`](./packages/drizzle/README.md)         | Database layer — Drizzle ORM helpers, connection pooling, schema helpers, Fastify plugin       |
| [`@scratchyjs/renderer`](./packages/renderer/README.md)       | Worker-thread SSR/SSG — Piscina pool plugin, SSR handler, SSG pipeline, SharedArrayBuffer comm |
| [`@scratchyjs/trpc`](./packages/trpc/README.md)               | tRPC integration — router/procedure factories, auth middleware, Fastify plugin, typed client   |
| [`@scratchyjs/utils`](./packages/utils/README.md)             | Server utilities — safe redirect, promise helpers, response helpers, IP/locale/sec-fetch utils |
| [`@scratchyjs/vite-plugin`](./packages/vite-plugin/README.md) | Vite plugin — Qwik + Tailwind preset, build & server config helpers                            |

## Getting Started

```bash
pnpm add @scratchyjs/core @scratchyjs/drizzle @scratchyjs/trpc
```

See the [documentation](https://scratchyjs.com/getting-started) for a full setup
guide.

## Requirements

- Node.js >= 24
- pnpm >= 10

## Turborepo Remote Cache

This repository is configured to use a self-hosted Turbo remote cache:

- `teamSlug`: `codewizard`
- `apiUrl`: `https://turborepo.codewizard.training`

To authenticate cache reads/writes, set `TURBO_TOKEN`:

```bash
export TURBO_TOKEN=your_token_here
```

In GitHub Actions, add `TURBO_TOKEN` as a repository secret so CI jobs can use
the remote cache.

## Documentation

Full documentation is available at **[scratchyjs.com](https://scratchyjs.com)**.

## License

[MIT](./LICENSE)
