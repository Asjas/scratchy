# Middleware Guide

## Overview

Scratchy uses a **layered middleware architecture** that combines Fastify's
hook-based lifecycle with composable, route-aware middleware inspired by Qwik
City, Remix, and RedwoodJS. Middleware runs on the main thread and intercepts
requests before they reach route handlers or tRPC procedures.

```
                         Incoming Request
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Global Middleware                            │
│  (Fastify plugins: helmet, rate-limit, logger, CORS)             │
│  Registered via plugins/external/ and plugins/app/               │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Route Middleware                               │
│  (onRequest, onGet, onPost exports from route files)             │
│  Applied per-route or per-directory layout                       │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Scoped Middleware Arrays                       │
│  (Interruptors: auth, ownership, feature-flags)                  │
│  Defined inline on individual route definitions                  │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Route Handler / tRPC Procedure                 │
│  (Business logic execution)                                      │
└──────────────────────────────────────────────────────────────────┘
```

**Key principles:**

- Global middleware applies to every request (security headers, logging)
- Route middleware is co-located with routes for locality of behavior
- Scoped middleware arrays provide fine-grained per-endpoint control
- Middleware is always `async` only when it uses `await`
- Never mix `async` functions with `done()` callbacks

## Request Lifecycle Hooks

Scratchy inherits Fastify's hook-based request lifecycle. Each hook fires at a
specific phase of request processing:

```
Request ──▶ onRequest
               │
               ▼
          preParsing
               │
               ▼
         preValidation
               │
               ▼
          preHandler
               │
               ▼
           handler        ◀── Route handler or tRPC procedure
               │
               ▼
       preSerialization
               │
               ▼
            onSend
               │
               ▼
          onResponse ──▶ Done
```

### Hook Reference

| Hook               | Phase                | Common Use Cases                            |
| ------------------ | -------------------- | ------------------------------------------- |
| `onRequest`        | Before parsing       | Authentication, early rejection, request ID |
| `preParsing`       | Before body parsing  | Decompress body, transform raw stream       |
| `preValidation`    | Before schema check  | Normalize input, attach defaults            |
| `preHandler`       | Before route handler | Authorization, rate limiting, feature flags |
| `preSerialization` | Before serialization | Transform response data, strip fields       |
| `onSend`           | Before sending       | Modify headers, compress response, add ETag |
| `onResponse`       | After response sent  | Logging, metrics, cleanup                   |

### Registering Lifecycle Hooks

```typescript
// plugins/app/request-id.ts
import fp from "fastify-plugin";
import { ulid } from "ulid";

export default fp(async function requestId(fastify) {
  fastify.addHook("onRequest", async (request, reply) => {
    request.id = request.headers["x-request-id"] ?? ulid();
    reply.header("x-request-id", request.id);
  });
});
```

```typescript
// plugins/app/request-timer.ts
import fp from "fastify-plugin";

export default fp(async function requestTimer(fastify) {
  fastify.addHook("onRequest", async (request) => {
    request.startTime = performance.now();
  });

  fastify.addHook("onResponse", async (request, reply) => {
    const duration = performance.now() - request.startTime;
    request.log.info(
      {
        duration,
        statusCode: reply.statusCode,
        method: request.method,
        url: request.url,
      },
      "request completed",
    );
  });
});
```

## Route-Level Middleware

Inspired by Qwik City, Scratchy supports exporting `onRequest`, `onGet`,
`onPost`, and other HTTP-method handlers directly from route files. These run as
middleware before the route handler.

### RequestEvent

Route-level middleware receives a `RequestEvent` object with methods for
controlling the request:

| Property / Method | Type                                     | Description                                       |
| ----------------- | ---------------------------------------- | ------------------------------------------------- |
| `request`         | `FastifyRequest`                         | The underlying Fastify request                    |
| `reply`           | `FastifyReply`                           | The underlying Fastify reply                      |
| `status()`        | `(code: number) => void`                 | Set the HTTP response status code                 |
| `headers`         | `Headers`                                | Read/write response headers                       |
| `cookie`          | `CookieAPI`                              | Get, set, and delete cookies                      |
| `redirect()`      | `(url: string, status?: number) => void` | Redirect the request                              |
| `next()`          | `() => Promise<void>`                    | Continue to the next middleware or handler        |
| `env`             | `Record<string, string>`                 | Environment variables                             |
| `parseBody()`     | `() => Promise<unknown>`                 | Parse the request body                            |
| `params`          | `Record<string, string>`                 | URL route parameters                              |
| `query`           | `Record<string, string>`                 | URL query parameters                              |
| `url`             | `URL`                                    | Parsed request URL                                |
| `method`          | `string`                                 | HTTP method (GET, POST, etc.)                     |
| `sharedMap`       | `Map<string, unknown>`                   | Share data between middleware in the same request |

### onRequest — Runs on All Methods

```typescript
// routes/dashboard/index.ts
import type { RequestEvent } from "scratchy/server";

// Runs before the handler for ANY HTTP method
export function onRequest(event: RequestEvent) {
  const token = event.cookie.get("session_token");
  if (!token) {
    event.redirect("/login", 302);
    return;
  }

  // Attach user to shared context for downstream middleware and handler
  const user = await verifySession(token.value);
  event.sharedMap.set("user", user);

  await event.next();
}

export default component$(() => {
  // Dashboard page — only renders if onRequest didn't redirect
  return <div>Dashboard</div>;
});
```

### onGet, onPost — Method-Specific Middleware

```typescript
// routes/api/posts/index.ts
import type { RequestEvent } from "scratchy/server";
import { z } from "zod";

// Only runs on GET requests
export function onGet(event: RequestEvent) {
  event.headers.set("cache-control", "public, max-age=60");
  await event.next();
}

// Only runs on POST requests
export async function onPost(event: RequestEvent) {
  const user = event.sharedMap.get("user");
  if (!user) {
    event.status(401);
    return { error: "Authentication required" };
  }

  const body = await event.parseBody();
  const parsed = createPostSchema.safeParse(body);
  if (!parsed.success) {
    event.status(400);
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  event.sharedMap.set("validatedBody", parsed.data);
  await event.next();
}
```

### Middleware in Layout Files

Layout files apply middleware to all routes in that directory subtree:

```
src/routes/
├── layout.ts              # Middleware for ALL routes
├── admin/
│   ├── layout.ts          # Middleware for /admin/* (inherits parent layout)
│   ├── index.ts           # /admin
│   └── users/
│       └── index.ts       # /admin/users
└── public/
    └── index.ts           # /public (only inherits root layout)
```

```typescript
// routes/admin/layout.ts
import type { RequestEvent } from "scratchy/server";

export async function onRequest(event: RequestEvent) {
  const user = event.sharedMap.get("user");
  if (!user || user.role !== "admin") {
    event.status(403);
    return { error: "Admin access required" };
  }
  await event.next();
}
```

## Global Middleware (Fastify Plugins)

Global middleware applies to every request entering the server. Register it as
Fastify plugins loaded via `@fastify/autoload`:

```
src/plugins/
├── external/              # Third-party plugins (loaded first)
│   ├── helmet.ts          # Security headers
│   ├── rate-limit.ts      # Global rate limiting
│   └── cors.ts            # CORS (scoped to external routes)
└── app/                   # Application plugins (loaded second)
    ├── auth.ts            # Authentication
    ├── request-id.ts      # Request ID generation
    └── logger.ts          # Structured logging
```

```typescript
// server.ts
import { fastifyAutoload } from "@fastify/autoload";
import { join } from "node:path";

// External plugins first — order matters
await server.register(fastifyAutoload, {
  dir: join(import.meta.dirname, "plugins", "external"),
  encapsulate: false,
});

// Application plugins second
await server.register(fastifyAutoload, {
  dir: join(import.meta.dirname, "plugins", "app"),
  encapsulate: false,
});
```

### Plugin Ordering

Autoloaded plugins execute in filesystem order (alphabetical). When explicit
ordering is needed, prefix filenames with numbers:

```
src/plugins/external/
├── 01-helmet.ts
├── 02-rate-limit.ts
└── 03-cors.ts
```

## Scoped Middleware Arrays

Inspired by RedwoodJS interruptors, scoped middleware arrays let you attach an
ordered list of middleware functions to individual route definitions. Each
function in the array runs sequentially and can short-circuit the chain.

### Defining Middleware Functions

```typescript
// middleware/require-auth.ts
import type { MiddlewareFn } from "scratchy/server";

export const requireAuth: MiddlewareFn = async (event) => {
  const user = event.sharedMap.get("user");
  if (!user) {
    event.status(401);
    return { error: "Authentication required" };
  }
  await event.next();
};
```

```typescript
// middleware/require-role.ts
import type { MiddlewareFn } from "scratchy/server";

export function requireRole(role: string): MiddlewareFn {
  return async (event) => {
    const user = event.sharedMap.get("user");
    if (!user || user.role !== role) {
      event.status(403);
      return { error: `Role '${role}' required` };
    }
    await event.next();
  };
}
```

```typescript
// middleware/validate-body.ts
import type { MiddlewareFn } from "scratchy/server";
import type { ZodSchema } from "zod";

export function validateBody(schema: ZodSchema): MiddlewareFn {
  return async (event) => {
    const body = await event.parseBody();
    const result = schema.safeParse(body);
    if (!result.success) {
      event.status(400);
      return { error: "Validation failed", details: result.error.flatten() };
    }
    event.sharedMap.set("validatedBody", result.data);
    await event.next();
  };
}
```

### Attaching Middleware Arrays to Routes

```typescript
// routes/api/admin/users/index.ts
import type { RouteConfig } from "scratchy/server";
import { createUserSchema } from "~/lib/schemas/user.js";
import { requireAuth } from "~/middleware/require-auth.js";
import { requireRole } from "~/middleware/require-role.js";
import { validateBody } from "~/middleware/validate-body.js";

export const config: RouteConfig = {
  middleware: [requireAuth, requireRole("admin")],
  POST: {
    middleware: [validateBody(createUserSchema)],
  },
};

// GET handler — requireAuth + requireRole("admin") run first
export async function onGet(event: RequestEvent) {
  const users = await listUsers();
  return { data: users };
}

// POST handler — requireAuth + requireRole("admin") + validateBody run first
export async function onPost(event: RequestEvent) {
  const data = event.sharedMap.get("validatedBody");
  const user = await createUser(data);
  event.status(201);
  return { data: user };
}
```

### Middleware Execution Order

When both route-level exports and scoped arrays are present, execution follows
this order:

```
1. Global middleware (Fastify plugins)
2. Layout onRequest (parent → child)
3. Route config.middleware array (left → right)
4. Route config[METHOD].middleware array (left → right)
5. Method-specific onRequest/onGet/onPost export
6. Route handler
```

## Composable Middleware Packages

Scratchy provides built-in middleware as independent, composable units that can
be configured and combined. Inspired by Remix's middleware approach, each
package is a factory function that returns a configured middleware.

### Available Middleware Packages

| Package                  | Purpose                               | Scope            |
| ------------------------ | ------------------------------------- | ---------------- |
| `auth-middleware`        | Session and token authentication      | Global or route  |
| `cors-middleware`        | Cross-Origin Resource Sharing headers | External routes  |
| `csrf-middleware`        | Cross-Site Request Forgery protection | Form submissions |
| `rate-limit-middleware`  | Request rate limiting                 | Global or route  |
| `logger-middleware`      | Structured request/response logging   | Global           |
| `session-middleware`     | Session management with cookies       | Global           |
| `cache-middleware`       | Response caching with ETags           | Route            |
| `compression-middleware` | Response compression (gzip, brotli)   | Global           |

### Using Composable Middleware

```typescript
// plugins/app/auth.ts
import fp from "fastify-plugin";
import { createAuthMiddleware } from "scratchy/middleware/auth-middleware";

export default fp(async function auth(fastify) {
  const authMiddleware = createAuthMiddleware({
    sessionCookie: "session_token",
    excludePaths: ["/health", "/login", "/public"],
    onUnauthenticated: (request, reply) => {
      reply.status(401).send({ error: "Authentication required" });
    },
  });

  fastify.addHook("onRequest", authMiddleware);
});
```

```typescript
// plugins/external/cors.ts
import fp from "fastify-plugin";
import { createCorsMiddleware } from "scratchy/middleware/cors-middleware";

export default fp(async function cors(fastify) {
  const corsMiddleware = createCorsMiddleware({
    origin: ["https://partner.example.com"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    credentials: true,
    maxAge: 86_400,
    pathPrefix: "/external/api",
  });

  fastify.addHook("onRequest", corsMiddleware);
});
```

## Common Middleware Patterns

### Authentication Middleware

```typescript
// middleware/require-auth.ts
import type { MiddlewareFn } from "scratchy/server";
import { verifySessionToken } from "~/services/auth.js";

export const requireAuth: MiddlewareFn = async (event) => {
  const token =
    event.cookie.get("session_token")?.value ??
    event.request.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    event.status(401);
    return { error: "Authentication required" };
  }

  const session = await verifySessionToken(token);
  if (!session) {
    event.status(401);
    return { error: "Invalid or expired session" };
  }

  event.sharedMap.set("user", session.user);
  event.sharedMap.set("session", session);
  await event.next();
};
```

### CORS Middleware (Plugin)

```typescript
// plugins/external/cors.ts
import fp from "fastify-plugin";

export default fp(async function cors(fastify) {
  await fastify.register(import("@fastify/cors"), {
    origin: (origin, callback) => {
      const allowedOrigins = fastify.config.corsOrigins;
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"), false);
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    credentials: true,
    maxAge: 86_400,
    // Only apply to external API routes
    hook: "onRequest",
    delegator: (req, callback) => {
      if (req.url.startsWith("/external/api")) {
        callback(null, { origin: true });
      } else {
        callback(null, { origin: false });
      }
    },
  });
});
```

### Rate Limiting Middleware

```typescript
// plugins/external/rate-limit.ts
import fp from "fastify-plugin";

export default fp(async function rateLimit(fastify) {
  await fastify.register(import("@fastify/rate-limit"), {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (request) => {
      // Use API key for external routes, IP for others
      return (request.headers["x-api-key"] as string) ?? request.ip;
    },
    errorResponseBuilder: (request, context) => ({
      error: "Too Many Requests",
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      retryAfter: Math.ceil(context.ttl / 1000),
    }),
  });
});
```

Per-route rate limiting:

```typescript
// middleware/strict-rate-limit.ts
import type { MiddlewareFn } from "scratchy/server";

export function strictRateLimit(max: number, windowMs: number): MiddlewareFn {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return async (event) => {
    const key = event.request.ip;
    const now = Date.now();
    const entry = hits.get(key);

    if (entry && entry.resetAt > now) {
      if (entry.count >= max) {
        event.status(429);
        event.headers.set(
          "retry-after",
          String(Math.ceil((entry.resetAt - now) / 1000)),
        );
        return { error: "Too many requests" };
      }
      entry.count++;
    } else {
      hits.set(key, { count: 1, resetAt: now + windowMs });
    }

    await event.next();
  };
}
```

### Logging Middleware (Plugin)

```typescript
// plugins/app/logger.ts
import fp from "fastify-plugin";

export default fp(async function logger(fastify) {
  fastify.addHook("onRequest", async (request) => {
    request.log.info(
      { method: request.method, url: request.url, ip: request.ip },
      "incoming request",
    );
  });

  fastify.addHook("onResponse", async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      "request completed",
    );
  });
});
```

### CSRF Middleware

```typescript
// middleware/csrf-protection.ts
import type { MiddlewareFn } from "scratchy/server";

export const csrfProtection: MiddlewareFn = async (event) => {
  if (["GET", "HEAD", "OPTIONS"].includes(event.method)) {
    await event.next();
    return;
  }

  const csrfToken = event.request.headers["x-csrf-token"];
  const sessionToken = event.cookie.get("csrf_token")?.value;

  if (!csrfToken || !sessionToken || csrfToken !== sessionToken) {
    event.status(403);
    return { error: "Invalid CSRF token" };
  }

  await event.next();
};
```

### Caching Middleware

```typescript
// middleware/cache-response.ts
import type { MiddlewareFn } from "scratchy/server";

export function cacheResponse(maxAge: number): MiddlewareFn {
  return async (event) => {
    event.headers.set("cache-control", `public, max-age=${maxAge}`);
    await event.next();
  };
}
```

## Middleware Ordering and Chaining

### Execution Flow

Middleware executes as a chain. Each middleware calls `event.next()` to pass
control to the next middleware. If a middleware does not call `next()`, the
chain stops and the response is sent.

```typescript
// Middleware A runs first
export const middlewareA: MiddlewareFn = async (event) => {
  console.log("A: before");
  await event.next(); // Pass to B
  console.log("A: after"); // Runs after B completes
};

// Middleware B runs second
export const middlewareB: MiddlewareFn = async (event) => {
  console.log("B: before");
  await event.next(); // Pass to handler
  console.log("B: after"); // Runs after handler completes
};

// Output order: A:before → B:before → handler → B:after → A:after
```

### Short-Circuiting

Return a response without calling `next()` to stop the chain:

```typescript
export const requireAuth: MiddlewareFn = async (event) => {
  const user = event.sharedMap.get("user");
  if (!user) {
    event.status(401);
    return { error: "Authentication required" }; // Chain stops here
  }
  await event.next(); // Chain continues
};
```

### Sharing Data Between Middleware

Use `event.sharedMap` to pass data from one middleware to the next within a
single request:

```typescript
// First middleware: authenticate
export const authenticate: MiddlewareFn = async (event) => {
  const user = await getUser(event.cookie.get("session")?.value);
  event.sharedMap.set("user", user);
  await event.next();
};

// Second middleware: authorize
export const authorize: MiddlewareFn = async (event) => {
  const user = event.sharedMap.get("user");
  if (!user) {
    event.status(401);
    return { error: "Not authenticated" };
  }
  await event.next();
};

// Handler: use the authenticated user
export async function onGet(event: RequestEvent) {
  const user = event.sharedMap.get("user");
  return { data: { greeting: `Hello, ${user.name}` } };
}
```

## Error Handling in Middleware

### Catching Errors from Downstream

Wrap `event.next()` in a try/catch to handle errors from downstream middleware
or the route handler:

```typescript
// middleware/error-boundary.ts
import type { MiddlewareFn } from "scratchy/server";

export const errorBoundary: MiddlewareFn = async (event) => {
  try {
    await event.next();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    event.request.log.error(
      { err: error, url: event.url.pathname },
      "middleware error",
    );
    event.status(500);
    return { error: "Internal Server Error", message };
  }
};
```

### Fastify Error Handler Integration

For global error handling, use Fastify's `setErrorHandler` rather than
middleware. This catches errors from all sources including middleware:

```typescript
// server.ts
server.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "unhandled error");

  if (error.statusCode) {
    return reply.status(error.statusCode).send({
      error: error.name,
      message: error.message,
    });
  }

  return reply.status(500).send({
    error: "Internal Server Error",
    message: "An unexpected error occurred",
  });
});
```

### Typed Errors in Middleware

```typescript
// lib/middleware-error.ts
export class MiddlewareError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "MiddlewareError";
  }
}

// Usage in middleware
export const requireSubscription: MiddlewareFn = async (event) => {
  const user = event.sharedMap.get("user");
  if (!user?.subscription?.active) {
    throw new MiddlewareError(
      402,
      "Active subscription required",
      "SUBSCRIPTION_REQUIRED",
    );
  }
  await event.next();
};
```

## Best Practices

### Do's

- ✅ Keep middleware focused on a single responsibility
- ✅ Use `request.log` for logging inside hooks (includes request context)
- ✅ Return early on failure — don't call `next()` after sending a response
- ✅ Use `event.sharedMap` to pass data between middleware
- ✅ Put global middleware in `plugins/` and route middleware in `middleware/`
- ✅ Use factory functions (like `requireRole("admin")`) for configurable
  middleware
- ✅ Set timeouts on external calls made inside middleware
- ✅ Use number-prefixed filenames for explicit plugin ordering
- ✅ Register security middleware (helmet, CORS) before application middleware

### Don'ts

- ❌ Never mix `async` with `done()` callbacks in Fastify hooks
- ❌ Never use `async` when the function body has no `await`
- ❌ Never perform heavy computation in middleware — offload to worker threads
- ❌ Never modify the response after calling `next()` returns (race condition)
- ❌ Never rely on middleware execution order across auto-loaded files without
  number prefixes
- ❌ Never put database writes in `onResponse` hooks (response already sent, no
  way to report errors to the client)

## Anti-Patterns

### ❌ Don't perform blocking work in middleware

```typescript
// BAD — Blocks the event loop
export const badMiddleware: MiddlewareFn = async (event) => {
  const html = renderToStringSync(App); // Synchronous SSR blocks!
  event.sharedMap.set("html", html);
  await event.next();
};

// GOOD — Offload to worker threads
export const goodMiddleware: MiddlewareFn = async (event) => {
  const result = await event.request.server.runTask({
    type: "ssr",
    route: event.url.pathname,
  });
  event.sharedMap.set("html", result.html);
  await event.next();
};
```

### ❌ Don't mix async and done callbacks

```typescript
// BAD — Will cause unpredictable behavior
fastify.addHook("onRequest", async (request, reply, done) => {
  await someAsyncWork();
  done(); // Never use done() with async!
});

// GOOD — Use async/await without done
fastify.addHook("onRequest", async (request, reply) => {
  await someAsyncWork();
});
```

### ❌ Don't create middleware with hidden state mutations

```typescript
// BAD — Mutating shared state across requests
let requestCount = 0;
export const badCounter: MiddlewareFn = async (event) => {
  requestCount++; // Shared mutable state — race conditions!
  await event.next();
};

// GOOD — Use per-request state or atomic counters
export const goodCounter: MiddlewareFn = async (event) => {
  event.sharedMap.set("requestReceivedAt", Date.now());
  await event.next();
};
```

### ❌ Don't catch errors silently

```typescript
// BAD — Swallows errors
export const badErrorHandler: MiddlewareFn = async (event) => {
  try {
    await event.next();
  } catch {
    // Silent failure — nobody knows what happened
  }
};

// GOOD — Log and respond
export const goodErrorHandler: MiddlewareFn = async (event) => {
  try {
    await event.next();
  } catch (error: unknown) {
    event.request.log.error({ err: error }, "middleware caught error");
    event.status(500);
    return { error: "Internal Server Error" };
  }
};
```
