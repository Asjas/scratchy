# API Design Guide

## Overview

Scratchy uses a **dual API approach**:

1. **tRPC** — for internal communication between the Scratchy client and server
2. **REST** — for external consumers (third-party integrations, mobile apps, webhooks)

```
┌─────────────────┐     tRPC (type-safe)      ┌─────────────────┐
│  Scratchy Client │ ──────────────────────── │  Fastify Server  │
│  (Qwik/React)    │    /trpc/*               │                  │
└─────────────────┘                            │  ┌────────────┐ │
                                               │  │ tRPC Router│ │
┌─────────────────┐     REST (JSON/HTTP)       │  └────────────┘ │
│  External Client │ ──────────────────────── │                  │
│  (Any language)  │    /external/api/v1/*     │  ┌────────────┐ │
└─────────────────┘                            │  │ REST Routes│ │
                                               │  └────────────┘ │
                                               └─────────────────┘
```

## tRPC (Internal API)

### When to Use tRPC

- All communication between the Scratchy frontend and backend
- Any endpoint consumed exclusively by the Scratchy client
- Real-time features using SSE subscriptions
- Authenticated operations requiring session context

### Router Structure

```
src/routers/
├── index.ts           # Aggregates all domain routers
├── users/
│   ├── queries.ts     # Read operations
│   └── mutations.ts   # Write operations
├── posts/
│   ├── queries.ts
│   └── mutations.ts
└── notifications/
    ├── queries.ts
    ├── mutations.ts
    └── subscriptions.ts  # SSE subscriptions
```

### Procedure Types

| Type           | HTTP Method | Use Case                                  |
| -------------- | ----------- | ----------------------------------------- |
| `query`        | GET/POST    | Read data (fetching, listing, searching)  |
| `mutation`     | POST        | Write data (create, update, delete)       |
| `subscription` | SSE         | Real-time data streams                    |

### Input Validation Pattern

Always validate inputs with Zod:

```typescript
import { z } from "zod";

// Define reusable schemas
const paginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

const idSchema = z.object({
  id: z.string().min(1),
});

const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(10),
  published: z.boolean().default(false),
});
```

### Error Handling Pattern

```typescript
import { TRPCError } from "@trpc/server";

// Map error codes to HTTP semantics
const errorMap = {
  notFound: (resource: string) =>
    new TRPCError({ code: "NOT_FOUND", message: `${resource} not found` }),
  unauthorized: () =>
    new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" }),
  forbidden: () =>
    new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" }),
  conflict: (resource: string) =>
    new TRPCError({ code: "CONFLICT", message: `${resource} already exists` }),
};
```

### Subscription (SSE) Pattern

```typescript
import { observable } from "@trpc/server/observable";

export const notificationSubscriptions = {
  onNew: protectedProcedure.subscription(({ ctx }) => {
    return observable<Notification>((emit) => {
      const handler = (notification: Notification) => {
        if (notification.userId === ctx.user.id) {
          emit.next(notification);
        }
      };

      // Subscribe to notification events
      eventEmitter.on("notification", handler);

      return () => {
        eventEmitter.off("notification", handler);
      };
    });
  }),
};
```

## REST (External API)

### When to Use REST

- Endpoints consumed by third-party applications
- Webhook receivers and senders
- Public APIs that need to be language-agnostic
- Integration endpoints for mobile apps or partner services
- Any endpoint that needs OpenAPI/Swagger documentation

### Route Convention

External REST routes live under `/external/api/v{version}/`:

```
src/routes/external/api/v1/
├── products/
│   └── index.ts       # GET/POST /external/api/v1/products
├── orders/
│   └── index.ts       # GET/POST /external/api/v1/orders
└── webhooks/
    └── index.ts       # POST /external/api/v1/webhooks
```

### CORS Configuration

CORS is enabled **only** on external routes:

```typescript
// routes/external/api/v1/products/index.ts
import type { FastifyPluginAsync } from "fastify";

const routes: FastifyPluginAsync = async function (fastify) {
  // Enable CORS for this route scope
  await fastify.register(import("@fastify/cors"), {
    origin: ["https://partner.example.com", "https://mobile.example.com"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    credentials: true,
    maxAge: 86400, // 24 hours
  });

  // Routes defined here have CORS enabled
  fastify.get("/", async (request, reply) => {
    // ...
  });
};

export default routes;
```

### Authentication for External APIs

External APIs use API keys or Bearer tokens instead of sessions:

```typescript
// plugins/app/api-auth.ts
import fp from "fastify-plugin";

export default fp(async function apiAuth(fastify) {
  fastify.decorateRequest("apiClient", null);

  fastify.addHook("onRequest", async (request, reply) => {
    // Only apply to external API routes
    if (!request.url.startsWith("/external/api")) return;

    const apiKey = request.headers["x-api-key"];
    if (!apiKey) {
      return reply.status(401).send({ error: "API key required" });
    }

    const client = await validateApiKey(apiKey);
    if (!client) {
      return reply.status(403).send({ error: "Invalid API key" });
    }

    request.apiClient = client;
  });
});
```

### Response Format

External APIs use consistent JSON response envelopes:

```typescript
// Success response
{
  "data": { /* result */ },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150
  }
}

// Error response
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Product not found",
    "details": { /* optional additional context */ }
  }
}
```

### Versioning Strategy

- **URL versioning**: `/external/api/v1/`, `/external/api/v2/`
- **Major version changes**: Breaking changes get a new version
- **Deprecation**: Old versions stay available for at least 6 months
- **Headers**: `X-API-Version` header for version communication

### Rate Limiting for External APIs

```typescript
// Per-route rate limiting
fastify.get(
  "/",
  {
    config: {
      rateLimit: {
        max: 100,
        timeWindow: "1 minute",
        keyGenerator: (request) => request.headers["x-api-key"] || request.ip,
      },
    },
  },
  async (request, reply) => {
    // ...
  },
);
```

## Shared Patterns

### Input/Output Types

Both tRPC and REST endpoints share the same Zod schemas for validation:

```typescript
// lib/schemas/product.ts
import { z } from "zod";

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  price: z.number().positive(),
  description: z.string().optional(),
  createdAt: z.date(),
});

export const CreateProductSchema = ProductSchema.omit({
  id: true,
  createdAt: true,
});

export type Product = z.infer<typeof ProductSchema>;
export type CreateProduct = z.infer<typeof CreateProductSchema>;
```

### Service Layer

Business logic lives in service modules, shared by both tRPC and REST:

```typescript
// services/products.ts
import { createProduct } from "~/db/mutations/products.js";
import { findProductById } from "~/db/queries/products.js";

export async function getProduct(id: string): Promise<Product> {
  const [product] = await findProductById.execute({ id });
  if (!product) throw new Error("Product not found");
  return product;
}

export async function listProducts(page: number, limit: number) {
  // Shared business logic used by both tRPC and REST
}
```

## Guidelines

### Do's

- ✅ Use tRPC for all internal client-server communication
- ✅ Use REST for external/third-party APIs
- ✅ Share Zod schemas between tRPC and REST
- ✅ Put business logic in service modules
- ✅ Enable CORS only on `/external/api` routes
- ✅ Version external APIs (v1, v2, etc.)
- ✅ Rate limit external endpoints per API key
- ✅ Validate all inputs with Zod schemas

### Don'ts

- ❌ Don't create REST endpoints for internal use
- ❌ Don't enable CORS on tRPC endpoints
- ❌ Don't put business logic in tRPC procedures or route handlers
- ❌ Don't skip input validation
- ❌ Don't return raw database objects — map to response schemas
