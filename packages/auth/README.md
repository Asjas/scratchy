# @scratchyjs/auth

Authentication for the Scratchy framework, powered by
[Better Auth](https://www.better-auth.com). Provides a server-side auth factory,
a Fastify plugin that resolves sessions on every request, typed
`request.session` / `request.user` decorators, and preHandler hooks for
protecting routes.

## Installation

```bash
pnpm add @scratchyjs/auth
```

## Usage

### 1. Create the auth instance

```typescript
// src/auth.ts
import { createAuth } from "@scratchyjs/auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = createAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: ["http://localhost:3000"],
  emailAndPassword: { enabled: true },
  database: drizzleAdapter(db, { provider: "pg" }),
});
```

### 2. Register the Fastify plugin

Register **after** the database plugin so `fastify.db` is available.

```typescript
import { auth } from "./auth.js";
import authPlugin from "@scratchyjs/auth/plugin";

await server.register(authPlugin, { auth });

// Every request now has:
//   request.session  — AuthSession | null
//   request.user     — AuthUser    | null
```

### 3. Protect routes

```typescript
import { requireAdmin, requireAuth } from "@scratchyjs/auth/hooks";

// Authenticated users only (HTTP 401 otherwise)
fastify.get("/profile", { preHandler: requireAuth }, (request) => {
  return request.user;
});

// Admin users only (HTTP 401 / 403 otherwise)
fastify.delete("/users/:id", { preHandler: requireAdmin }, async (request) => {
  const { id } = request.params as { id: string };
  await deleteUser(id);
  return { success: true };
});
```

### 4. Browser client

```typescript
import { createAuthClient } from "@scratchyjs/auth/client";

const authClient = createAuthClient({ baseURL: "/api/auth" });

await authClient.signIn.email({ email, password });
await authClient.signOut();
const session = await authClient.getSession();
```

## API

### `createAuth(options)`

Thin wrapper around `betterAuth()`. Accepts any valid
[Better Auth options](https://www.better-auth.com/docs). Returns an
`AuthInstance`.

### `createAuthClient(options)`

Creates a browser-side Better Auth client. `options.baseURL` should point to
your auth endpoint (default `/api/auth`).

### `authPlugin` (Fastify plugin)

Registers
[fastify-better-auth](https://github.com/johannschopplich/fastify-better-auth)
and adds an `onRequest` hook that resolves the session and sets
`request.session` (`AuthSession | null`) and `request.user` (`AuthUser | null`).

**Options**

| Option | Type           | Description                              |
| ------ | -------------- | ---------------------------------------- |
| `auth` | `AuthInstance` | The instance returned by `createAuth()`. |

### `requireAuth(request, reply, done)`

Fastify `preHandler` hook. Sends HTTP 401 when `request.session` is `null`.

### `requireAdmin(request, reply, done)`

Fastify `preHandler` hook. Sends HTTP 401 when unauthenticated; HTTP 403 when
`request.session.user.role !== "admin"`.

## Auth Endpoints

Once the plugin is registered, Better Auth mounts these routes under
`/api/auth`:

| Method | Path                        | Description                 |
| ------ | --------------------------- | --------------------------- |
| POST   | `/api/auth/sign-up/email`   | Register a new user         |
| POST   | `/api/auth/sign-in/email`   | Sign in with email/password |
| POST   | `/api/auth/sign-out`        | Sign out                    |
| GET    | `/api/auth/get-session`     | Get current session         |
| POST   | `/api/auth/forgot-password` | Request password reset      |
| POST   | `/api/auth/reset-password`  | Reset password              |

## Documentation

[https://scratchyjs.com/sessions](https://scratchyjs.com/sessions)
