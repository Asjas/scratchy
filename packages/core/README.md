# @scratchyjs/core

Core runtime package for the Scratchy framework. Provides the Fastify server
factory with pre-wired security plugins (helmet, CORS, rate-limit, sensible), a
Zod-based config loader, a structured error handler, graceful shutdown, and a
plugin helper.

## Installation

```bash
pnpm add @scratchyjs/core
```

## Usage

### Create the server

```typescript
import { createServer, loadConfig } from "@scratchyjs/core";

const config = loadConfig();
const server = await createServer(config);

await server.listen({ port: config.PORT, host: config.HOST });
```

`createServer` registers the following plugins automatically:

- `@fastify/helmet` — security headers
- `@fastify/cors` — CORS (restricts origins in production via `ALLOWED_ORIGINS`)
- `@fastify/rate-limit` — global rate limiting
- `@fastify/sensible` — HTTP helpers (`fastify.to()`, `reply.badRequest()`, …)
- Internal header stripping (`x-internal-request`, `x-internal-token`)
- Swagger / OpenAPI UI (opt-in)

### Load configuration

```typescript
import { configSchema, loadConfig } from "@scratchyjs/core";

// Parses and validates process.env, throws on missing required fields
const config = loadConfig();
```

**Environment variables**

| Variable          | Default       | Description                                                    |
| ----------------- | ------------- | -------------------------------------------------------------- |
| `PORT`            | `3000`        | HTTP port                                                      |
| `HOST`            | `0.0.0.0`     | Bind address                                                   |
| `NODE_ENV`        | `development` | `development`, `production`, or `test`                         |
| `LOG_LEVEL`       | `info`        | Pino log level                                                 |
| `TRUST_PROXY`     | `true`        | Trust `X-Forwarded-For` headers                                |
| `BODY_LIMIT`      | `10485760`    | Request body size limit in bytes (10 MB)                       |
| `ALLOWED_ORIGINS` | _(empty)_     | Comma-separated CORS origin allowlist (required in production) |

### Graceful shutdown

```typescript
import { setupShutdown } from "@scratchyjs/core";

setupShutdown(server);
```

Listens for `SIGTERM` / `SIGINT` and drains in-flight requests before closing.

### Define a plugin

```typescript
import { definePlugin } from "@scratchyjs/core";

export const myPlugin = definePlugin(async function myPlugin(fastify) {
  fastify.decorate("myService", new MyService());
});
```

`definePlugin` wraps your function with `fastify-plugin` so decorators are
shared across scopes.

## API

### `createServer(config): Promise<FastifyInstance>`

Creates and returns a fully-configured Fastify server with Zod type provider,
security plugins, error handler, and request logging.

### `loadConfig(env?): Config`

Parses environment variables (defaults to `process.env`) against `configSchema`
and returns a typed `Config` object. Throws a `ZodError` on validation failure.

### `configSchema`

The `zod` schema used by `loadConfig`. Extend it to add application-specific
environment variables.

### `setupShutdown(server): void`

Registers `close-with-grace` for graceful SIGTERM / SIGINT shutdown with a
10-second drain timeout.

### `definePlugin<Options>(fn, opts?): FastifyPlugin`

Wraps a Fastify plugin function with `fastify-plugin` to ensure it runs in the
parent scope. Optional `opts.name` sets the plugin name for debugging.

## Documentation

[https://scratchyjs.com/getting-started](https://scratchyjs.com/getting-started)
