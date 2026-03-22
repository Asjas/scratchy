---
name: fastify-server
description:
  "Guides development of Fastify server configuration, plugins, routes, hooks,
  and production deployment within the Scratchy framework. Use when setting up
  the Fastify server, creating plugins, defining REST routes, implementing
  lifecycle hooks, configuring CORS, rate limiting, or error handling. Trigger
  terms: Fastify, server, plugin, route, hook, middleware, CORS, rate limit,
  helmet, autoload, decorator, error handler."
metadata:
  tags: fastify, server, plugins, routes, hooks, rest-api, backend
applyTo: "**/server.ts,**/plugins/**/*.ts,**/routes/**/*.ts,**/hooks/**/*.ts"
---

# Fastify in Scratchy

## When to Use

Fastify is the **HTTP server framework** powering Scratchy. Use these patterns
when:

- Configuring the Fastify server instance
- Creating Fastify plugins
- Defining RESTful routes (especially external APIs)
- Implementing lifecycle hooks
- Setting up CORS, rate limiting, and security headers
- Integrating with tRPC, Piscina, and other subsystems

## Server Setup

### Basic Server Configuration

```typescript
// server.ts
import Fastify, { type FastifyHttpOptions } from "fastify";
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type http from "node:http";

async function createServer(config: Config) {
  const opts: FastifyHttpOptions<http.Server> = {
    trustProxy: true,
    disableRequestLogging: true,
    loggerInstance: pinoLogger,
    requestTimeout: 60_000,
    keepAliveTimeout: 10_000,
    bodyLimit: 10 * 1024 * 1024, // 10MB
    routerOptions: {
      ignoreTrailingSlash: true,
      maxParamLength: 5000,
    },
  };

  const server = Fastify(opts).withTypeProvider<ZodTypeProvider>();

  // Store config as a decorator
  server.decorate("config", config);

  // Use Zod for validation and serialization
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  return server;
}
```

## Plugin System

### Plugin Registration Pattern

Use `@fastify/autoload` for automatic plugin loading:

```typescript
import { fastifyAutoload } from "@fastify/autoload";
import { join } from "node:path";

// External plugins (CORS, helmet, rate-limit, etc.)
await server.register(fastifyAutoload, {
  dir: join(import.meta.dirname, "plugins", "external"),
  encapsulate: false,
});

// Application plugins (database, cache, auth, etc.)
await server.register(fastifyAutoload, {
  dir: join(import.meta.dirname, "plugins", "app"),
  encapsulate: false,
});

// Routes (auto-loaded with file-based routing)
await server.register(fastifyAutoload, {
  dir: join(import.meta.dirname, "routes"),
  dirNameRoutePrefix: false,
  matchFilter: /index\.(?:ts|js)$/,
});
```

### Creating a Plugin

```typescript
// plugins/app/database.ts
import fp from "fastify-plugin";
import { db, pool } from "~/db/index.js";

export default fp(
  async function databasePlugin(fastify) {
    fastify.decorate("db", db);
    fastify.decorate("pool", pool);

    fastify.addHook("onClose", async () => {
      await pool.end();
    });
  },
  {
    name: "database",
  },
);
```

### TypeScript Augmentation for Decorators

When adding decorators to Fastify, declare them in a type augmentation file:

```typescript
// types/fastify.d.ts
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

declare module "fastify" {
  interface FastifyInstance {
    db: NodePgDatabase;
    pool: Pool;
    config: Config;
    cache: CacheInstance;
  }

  interface FastifyRequest {
    user: User | null;
  }
}
```

**Critical:** Every `fastify.decorate()` or `fastify.decorateRequest()` must
have a corresponding `declare module "fastify"` augmentation, or TypeScript
won't recognize the properties.

## Route Definitions

### Internal Routes (tRPC)

Internal routes are handled by tRPC (see `trpc.instructions.md`). Don't create
Fastify routes for internal API calls.

### External RESTful Routes

For APIs consumed by third parties, use Fastify routes with CORS:

```typescript
// routes/external/api/v1/products/index.ts
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
});

const routes: FastifyPluginAsync = async function (fastify) {
  // Enable CORS for this route scope
  await fastify.register(import("@fastify/cors"), {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  });

  fastify.get(
    "/",
    {
      schema: {
        querystring: z.object({
          page: z.coerce.number().min(1).default(1),
          limit: z.coerce.number().min(1).max(100).default(20),
        }),
        response: {
          200: z.array(productSchema),
        },
      },
    },
    async (request, reply) => {
      const { page, limit } = request.query;
      const products = await fastify.db
        .select()
        .from(product)
        .limit(limit)
        .offset((page - 1) * limit);
      return products;
    },
  );

  fastify.get(
    "/:id",
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: {
          200: productSchema,
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const result = await findProductById.execute({ id: request.params.id });
      if (!result.length) {
        return reply.status(404).send({ error: "Product not found" });
      }
      return result[0];
    },
  );
};

export default routes;
```

### Health Check Route

```typescript
// routes/health/index.ts
import type { FastifyPluginAsync } from "fastify";

const routes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });
};

export default routes;
```

## Hooks and Lifecycle

### Request Lifecycle Order

```
1. onRequest        — Authentication, early rejection
2. preParsing       — Modify raw request body
3. preValidation    — Transform before validation
4. preHandler       — Authorization, rate limiting
5. handler          — Route handler execution
6. preSerialization — Transform response before serialization
7. onSend           — Modify response headers/body
8. onResponse       — Logging, metrics
```

### Hook Example

```typescript
// hooks/request-timer.ts
import fp from "fastify-plugin";

export default fp(async function requestTimer(fastify) {
  fastify.addHook("onRequest", async (request) => {
    request.startTime = performance.now();
  });

  fastify.addHook("onResponse", async (request, reply) => {
    const duration = performance.now() - request.startTime;
    request.log.info(
      { duration, statusCode: reply.statusCode, url: request.url },
      "request completed",
    );
  });
});
```

## Error Handling

### Custom Error Handler

```typescript
server.setErrorHandler((error, request, reply) => {
  // Handle Zod validation errors
  if (hasZodFastifySchemaValidationErrors(error)) {
    return reply.status(400).send({
      error: "Validation Error",
      message: "Request doesn't match the schema",
      details: error.validation,
    });
  }

  // Handle known errors
  if (error.statusCode) {
    return reply.status(error.statusCode).send({
      error: error.name,
      message: error.message,
    });
  }

  // Log unexpected errors
  request.log.error(error, "unhandled error");
  return reply.status(500).send({
    error: "Internal Server Error",
    message: "An unexpected error occurred",
  });
});

// 404 handler with rate limiting
server.setNotFoundHandler(
  {
    preHandler: server.rateLimit({ max: 60, timeWindow: "1 hour" }),
  },
  (request, reply) => {
    return reply.status(404).send({
      error: "Not Found",
      message: "The requested resource was not found",
    });
  },
);
```

### Error Tuple Pattern

Use `fastify.to()` from `@fastify/sensible` for clean error handling:

```typescript
const [err, result] = await fastify.to(someAsyncOperation());
if (err) {
  request.log.error(err, "operation failed");
  return reply.internalServerError();
}
return result;
```

## Security

### Essential Security Plugins

```typescript
// plugins/external/security.ts
import fp from "fastify-plugin";

export default fp(async function security(fastify) {
  // Security headers
  await fastify.register(import("@fastify/helmet"), {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
      },
    },
  });

  // Rate limiting
  await fastify.register(import("@fastify/rate-limit"), {
    max: 100,
    timeWindow: "1 minute",
  });
});
```

### Strip internal-routing and framework headers

The `@scratchyjs/core` package auto-loads a `strip-internal-headers` plugin that
removes generic internal-routing request headers and the Fastify `server`
response header.

**Request headers stripped:** `x-internal-request`, `x-internal-token`
**Response headers stripped:** `server` (hides `"Fastify"` from clients)

```typescript
// ✅ Already handled by @scratchyjs/core — do NOT remove the plugin
// If you need to add more headers to strip in your application:
import fp from "fastify-plugin";

export default fp(function stripAppInternalHeaders(fastify, _opts, done) {
  fastify.addHook("onRequest", (request, _reply, hookDone) => {
    delete request.headers["x-my-app-internal"];
    hookDone();
  });
  done();
});

// ❌ NEVER trust internal headers for auth decisions
// if (request.headers["x-internal-request"] === "true") { /* skip auth */ }
```

### CORS production hardening

Set `ALLOWED_ORIGINS` to restrict cross-origin access in production. The
`@scratchyjs/core` CORS plugin reads `process.env.NODE_ENV` at startup and
automatically switches to a deny-all policy when `NODE_ENV=production` and
`ALLOWED_ORIGINS` is not set:

```bash
# .env.production — required for cross-origin browser clients
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
```

```typescript
// ❌ NEVER set origin: true with credentials: true in production
// This allows any website to make authenticated cross-origin requests
// and read the response — a credential exfiltration vector.

// ✅ @scratchyjs/core cors.ts handles this automatically:
//   NODE_ENV=production + no ALLOWED_ORIGINS → origin: false (deny all)
//   NODE_ENV=production + ALLOWED_ORIGINS set → explicit allowlist
//   NODE_ENV=development                      → origin: true
```

### Cache-Control for SSR and authenticated responses

Prevent cache-poisoning attacks (Remix CVE-2025-43864 pattern) by ensuring
authenticated and personalised responses are never stored by CDN/proxy caches:

```typescript
// ✅ Add to a plugin or hook in your application
fastify.addHook("onSend", (request, reply, _payload, done) => {
  if (request.user) {
    reply.header("Cache-Control", "private, no-store");
    reply.header("Vary", "Cookie, Authorization");
  }
  done();
});
```

tRPC responses already include
`cache-control: no-store, no-cache, must-revalidate, private` via the
`responseMeta()` in `@scratchyjs/trpc`.

## Logging

### Structured Logging with Pino

```typescript
// Inside route handlers — use request.log
fastify.get("/users/:id", async (request, reply) => {
  request.log.info({ userId: request.params.id }, "fetching user");
  // ...
});

// Inside plugins — use fastify.log
export default fp(async function myPlugin(fastify) {
  fastify.log.info("plugin initialized");
});
```

**Rules:**

- Use `request.log` inside route handlers (includes request context)
- Use `fastify.log` only in plugin-level code
- Always pass an object first: `request.log.info({ key: value }, "message")`
- Never use string interpolation in log messages

## Graceful Shutdown

```typescript
import closeWithGrace from "close-with-grace";

closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
  if (err) {
    server.log.error(err, "server closing due to error");
  }
  server.log.info({ signal }, "shutting down gracefully");
  await server.close();
});
```

**Critical:** Never re-call `closeWithGrace()` inside
`process.on('uncaughtException')`.

## Anti-Patterns

### ❌ Don't mix async/await with done() callbacks

```typescript
// BAD
fastify.addHook("onRequest", async (request, reply, done) => {
  done(); // Never use done() with async
});

// GOOD — async without done
fastify.addHook("onRequest", async (request, reply) => {
  // ...
});

// GOOD — done without async (for synchronous hooks)
fastify.addHook("onRequest", (request, reply, done) => {
  done();
});
```

### ❌ Don't use `async` when `await` is not needed

```typescript
// BAD — unnecessary async wrapper
fastify.get("/health", async () => {
  return { status: "ok" };
});

// GOOD — synchronous return
fastify.get("/health", () => {
  return { status: "ok" };
});
```

## Reference Links

- [Fastify Documentation](https://fastify.dev/docs/latest/)
- [Fastify Plugins](https://fastify.dev/docs/latest/Reference/Plugins/)
- [Fastify Hooks](https://fastify.dev/docs/latest/Reference/Hooks/)
- [Fastify TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/)
- [@fastify/autoload](https://github.com/fastify/fastify-autoload)
- [@fastify/cors](https://github.com/fastify/fastify-cors)
- [@fastify/helmet](https://github.com/fastify/fastify-helmet)
- [@fastify/rate-limit](https://github.com/fastify/fastify-rate-limit)
- [@fastify/sensible](https://github.com/fastify/fastify-sensible)
- [fastify-type-provider-zod](https://github.com/turkerdev/fastify-type-provider-zod)
