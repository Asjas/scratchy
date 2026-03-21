---
name: trpc-patterns
description: "Guides development of tRPC routers, procedures, middleware, and client integration within the Scratchy framework. Use when creating API endpoints, defining tRPC routers, implementing authentication middleware, setting up the tRPC client, or working with tRPC SSE subscriptions. Trigger terms: tRPC, router, procedure, query, mutation, subscription, middleware, publicProcedure, protectedProcedure, superjson, context."
metadata:
  tags: trpc, api, rpc, router, middleware, typescript, fastify
applyTo: "**/routers/**/*.ts,**/router.ts,**/context.ts,**/trpc.client.ts"
---

# tRPC in Scratchy

## When to Use

tRPC is the **primary API layer** for internal communication in Scratchy. Use it
for:

- All internal API endpoints between the client and server
- Type-safe RPC calls without code generation
- Real-time features via SSE subscriptions
- Authentication and authorization middleware

**For external/third-party APIs**, use RESTful Fastify routes under
`/external/api` with CORS enabled instead.

## Server Setup

### tRPC Initialization

```typescript
// router.ts
import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "~/context.js";

export const t = initTRPC.context<Context>().create({
  transformer: superjson,
  sse: {
    enabled: true,
    maxDurationMs: 5 * 60 * 1000, // 5 minutes
    ping: { enabled: true, intervalMs: 30 * 1000 },
    client: { reconnectAfterInactivityMs: 2 * 60 * 1000 },
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
```

### Context Creation

```typescript
// context.ts
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

export interface Context {
  request: CreateFastifyContextOptions["req"];
  reply: CreateFastifyContextOptions["res"];
  user: User | null;
  hasRole: (role: string) => boolean;
}

export async function createContext({ req, res }: CreateFastifyContextOptions): Promise<Context> {
  const user = req.user ?? null;

  return {
    request: req,
    reply: res,
    user,
    hasRole: (role: string) => user?.role === role,
  };
}
```

### Fastify Integration

```typescript
// server.ts
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { createContext } from "~/context.js";
import { appRouter } from "~/routers/index.js";

await server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: {
    router: appRouter,
    createContext,
    onError({ path, error }) {
      console.error(`Error in tRPC handler on path '${path}':`, error);
    },
    responseMeta: () => ({
      headers: new Headers([
        ["cache-control", "no-store, no-cache, must-revalidate, private"],
      ]),
    }),
  },
});
```

## Middleware

### Authentication Middleware

```typescript
// router.ts
export const isAuthenticated = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this endpoint",
    });
  }

  return next({
    ctx: {
      user: ctx.user, // Narrows type from User | null to User
    },
  });
});

export const protectedProcedure = t.procedure.use(isAuthenticated);
```

### Authorization Middleware

```typescript
export const isAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this endpoint",
    });
  }

  if (!ctx.hasRole("admin")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return next({ ctx: { user: ctx.user } });
});

export const isOwner = t.middleware(({ ctx, next, input }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "You must be logged in" });
  }

  const userId =
    (input as Record<"userId", string>)?.userId ||
    (input as Record<"id", string>)?.id;

  if (ctx.user.id !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not authorized to access this resource",
    });
  }

  return next({ ctx: { user: ctx.user } });
});

export const isOwnerOrAdmin = t.middleware(({ ctx, next, input }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "You must be logged in" });
  }

  const userId =
    (input as Record<"userId", string>)?.userId ||
    (input as Record<"id", string>)?.id;

  const isOwner = ctx.user.id === userId;
  const isAdmin = ctx.hasRole("admin");

  if (!isOwner && !isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only access your own data or must be an admin",
    });
  }

  return next({ ctx: { user: ctx.user } });
});
```

## Router Organization

### Domain-Based Router Pattern

Each domain has its own directory with `queries.ts` and `mutations.ts`:

```
src/routers/
├── index.ts               # Aggregates all routers into appRouter
├── users/
│   ├── queries.ts         # User query procedures
│   └── mutations.ts       # User mutation procedures
├── courses/
│   ├── queries.ts
│   └── mutations.ts
└── posts/
    ├── queries.ts
    └── mutations.ts
```

### Router Aggregation

```typescript
// routers/index.ts
import { router } from "~/router.js";
import { userQueries } from "~/routers/users/queries.js";
import { userMutations } from "~/routers/users/mutations.js";
import { courseQueries } from "~/routers/courses/queries.js";
import { courseMutations } from "~/routers/courses/mutations.js";

export const appRouter = router({
  users: router({
    ...userQueries,
    ...userMutations,
  }),
  courses: router({
    ...courseQueries,
    ...courseMutations,
  }),
});

export type AppRouter = typeof appRouter;
```

### Query Procedures

```typescript
// routers/users/queries.ts
import { z } from "zod";
import { publicProcedure, protectedProcedure } from "~/router.js";
import { findUserById, findAllUsers } from "~/db/queries/users.js";

export const userQueries = {
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const [user] = await findUserById.execute({ id: input.id });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      return user;
    }),

  list: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      const users = await findAllUsers.execute();
      const start = (input.page - 1) * input.limit;
      return users.slice(start, start + input.limit);
    }),
};
```

### Mutation Procedures

```typescript
// routers/users/mutations.ts
import { z } from "zod";
import { protectedProcedure } from "~/router.js";
import { createUser, updateUser, deleteUser } from "~/db/mutations/users.js";

export const userMutations = {
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        email: z.string().email(),
      }),
    )
    .mutation(async ({ input }) => {
      return createUser(input);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        email: z.string().email().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateUser(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await deleteUser(input.id);
      return { success: true };
    }),
};
```

## Client Setup

### tRPC Client Configuration

```typescript
// lib/trpc.client.ts
import { createTRPCClient, httpBatchStreamLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@apps/server/routers/index.js";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchStreamLink({
      url: "/trpc",
      transformer: superjson,
      // Use POST for all requests (important for E2E testing)
      methodOverride: "POST",
    }),
  ],
});
```

### Client Usage

```typescript
// Queries
const user = await trpc.users.getById.query({ id: "user-123" });
const users = await trpc.users.list.query({ page: 1, limit: 20 });

// Mutations
const newUser = await trpc.users.create.mutate({
  name: "John",
  email: "john@example.com",
});

await trpc.users.update.mutate({
  id: "user-123",
  name: "John Updated",
});

await trpc.users.delete.mutate({ id: "user-123" });
```

## Error Handling

```typescript
import { TRPCError } from "@trpc/server";

// Standard tRPC error codes
throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid input" });
throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Something went wrong" });
throw new TRPCError({ code: "CONFLICT", message: "Resource already exists" });
throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
```

## Input Validation with Zod

```typescript
import { z } from "zod";

// Common input schemas
const paginationInput = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "updatedAt", "name"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const idInput = z.object({
  id: z.string().min(1),
});

// Usage in a procedure
export const listPosts = publicProcedure
  .input(paginationInput)
  .query(async ({ input }) => {
    // input is fully typed
  });
```

## Anti-Patterns

### ❌ Don't use tRPC for external APIs

```typescript
// BAD — External clients can't use tRPC
// Use Fastify REST routes for external APIs instead

// GOOD — RESTful route for external consumers
server.get("/external/api/v1/products", async (request, reply) => {
  return reply.send(await getProducts());
});
```

### ❌ Don't put business logic in procedures

```typescript
// BAD — Business logic inside the procedure
.mutation(async ({ input }) => {
  const user = await db.select().from(users).where(eq(users.id, input.id));
  // ... complex business logic ...
})

// GOOD — Business logic in a service/mutation module
.mutation(async ({ input }) => {
  return updateUser(input.id, input);
})
```

## Reference Links

- [tRPC Documentation](https://trpc.io/docs)
- [tRPC Fastify Adapter](https://trpc.io/docs/server/adapters/fastify)
- [tRPC Client](https://trpc.io/docs/client/vanilla)
- [tRPC Error Handling](https://trpc.io/docs/server/error-handling)
- [tRPC Middleware](https://trpc.io/docs/server/middlewares)
- [Zod Validation](https://zod.dev/)
- [SuperJSON](https://github.com/flightcontrolhq/superjson)
