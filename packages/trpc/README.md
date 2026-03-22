# @scratchyjs/trpc

tRPC integration for the Scratchy framework. Exports a pre-configured tRPC
instance (with superjson transformer and SSE support), auth middleware, a
Fastify plugin, and a typed client factory.

## Installation

```bash
pnpm add @scratchyjs/trpc
```

## Usage

### Define your router

```typescript
import { protectedProcedure, publicProcedure, router } from "@scratchyjs/trpc";
import { z } from "zod";

export const appRouter = router({
  hello: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => `Hello, ${input.name}!`),

  me: protectedProcedure.query(({ ctx }) => ctx.user),
});

export type AppRouter = typeof appRouter;
```

### Register the Fastify plugin

```typescript
import trpcPlugin from "@scratchyjs/trpc/plugin";

await server.register(trpcPlugin, {
  router: appRouter,
  prefix: "/trpc", // default
});
```

### Create a typed client

```typescript
import type { AppRouter } from "./router.js";
import { createClient } from "@scratchyjs/trpc";

const client = createClient<AppRouter>({ url: "/trpc" });

const greeting = await client.hello.query({ name: "World" });
const me = await client.me.query();
```

## API

### `router`

Create a tRPC router. Alias for `t.router`.

### `publicProcedure`

A procedure with no authentication requirement. Use for publicly accessible
endpoints.

### `protectedProcedure`

Procedure that rejects unauthenticated requests (tRPC `UNAUTHORIZED` error).
Uses the `isAuthenticated` middleware internally; `ctx.user` is non-null in the
handler.

### `middleware`

Create a custom tRPC middleware. Alias for `t.middleware`.

### `TRPCError`

Re-exported from `@trpc/server`. Use to throw structured errors:

```typescript
throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
```

### Auth middleware

| Export            | Rejects                     | Passes when                |
| ----------------- | --------------------------- | -------------------------- |
| `isAuthenticated` | unauthenticated             | any logged-in user         |
| `isAdmin`         | unauthenticated, non-admin  | `ctx.hasRole("admin")`     |
| `isOwner`         | unauthenticated, wrong user | `ctx.user.id === input.id` |
| `isOwnerOrAdmin`  | unauthenticated, neither    | owner **or** admin         |

### `createContext({ req, res }): Context`

Creates the tRPC context from a Fastify request/reply pair. Reads `request.user`
set by the auth plugin.

### `createClient<TRouter>(options): TRPCClient`

Creates a `@trpc/client` instance using `httpBatchStreamLink` with the superjson
transformer.

**Options**

| Option    | Description                                      |
| --------- | ------------------------------------------------ |
| `url`     | URL of the tRPC endpoint (e.g. `"/trpc"`)        |
| `headers` | Static or dynamic headers added to every request |

### `trpcPlugin` (Fastify plugin)

Registers the tRPC Fastify adapter and sets `cache-control: no-store` response
headers.

**Options** (`TrpcPluginOptions`)

| Option   | Default   | Description                 |
| -------- | --------- | --------------------------- |
| `router` | —         | The tRPC app router         |
| `prefix` | `"/trpc"` | URL prefix for the endpoint |

## Documentation

[https://scratchyjs.com/api-design](https://scratchyjs.com/api-design)
