---
name: auth-better-auth
description: "Guides development of authentication and authorization within the Scratchy framework using @scratchy/auth and Better Auth. Use when setting up authentication, creating protected routes, managing sessions, configuring the Better Auth instance, registering the Fastify plugin, or using requireAuth/requireAdmin preHandler hooks. Trigger terms: auth, authentication, authorization, Better Auth, session, login, sign-in, sign-up, requireAuth, requireAdmin, authPlugin, createAuth, protected route, BETTER_AUTH_SECRET."
metadata:
  tags: auth, better-auth, authentication, authorization, sessions, fastify, hooks
applyTo: "**/auth.ts,**/auth/**/*.ts,**/plugins/**/*.ts,**/routes/**/*.ts,**/routers/**/*.ts"
---

# Authentication in Scratchy (`@scratchy/auth`)

## When to Use

Use `@scratchy/auth` when:

- Adding user sign-up and sign-in to a Scratchy application
- Protecting routes so only authenticated users can access them
- Reading the current session or user inside route handlers
- Restricting routes to admin users only
- Integrating Better Auth's email/password, OAuth providers, or plugins

## Architecture

```
┌──────────────────────────────────┐
│      @scratchy/auth              │
│                                  │
│  createAuth()      ─► BetterAuth │  ← server factory (auth.ts)
│  createAuthClient() ─► Client    │  ← client factory (browser)
│  authPlugin         ─► Fastify   │  ← Fastify plugin (server.ts)
│  requireAuth        ─► preHandler│  ← route guard hook
│  requireAdmin       ─► preHandler│  ← admin-only route guard
└──────────────────────────────────┘
         │
         ▼
  request.session (AuthSession | null)
  request.user    (AuthUser | null)
```

## Package Exports

```typescript
// Server factory
import { createAuth } from "@scratchy/auth";

// Browser client factory
import { createAuthClient } from "@scratchy/auth/client";

// Fastify plugin
import authPlugin from "@scratchy/auth/plugin";
import type { AuthPluginOptions, AuthSession, AuthUser } from "@scratchy/auth/plugin";

// Prehandler hooks
import { requireAuth, requireAdmin } from "@scratchy/auth/hooks";
```

## Server Setup

### 1. Create the Auth Instance (`src/auth.ts`)

Create the Better Auth instance once at module scope and export it for reuse:

```typescript
// src/auth.ts
import { createAuth } from "@scratchy/auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { AppConfig } from "./config.js";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * Creates and configures the Better Auth instance for this application.
 * Wire this into the Fastify server with `authPlugin` from `@scratchy/auth/plugin`.
 *
 * @param config - Application configuration (must include BETTER_AUTH_SECRET).
 * @param db     - Drizzle database instance for session/user persistence.
 */
export function createAppAuth(config: AppConfig, db: NodePgDatabase) {
  return createAuth({
    basePath: "/api/auth",
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: config.ORIGIN ? [config.ORIGIN] : [],
    emailAndPassword: {
      enabled: true,
    },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        // Map Better Auth table names to your Drizzle table definitions.
        // Adjust imports to match your schema file paths.
        user: userTable,
        session: sessionTable,
        account: accountTable,
        verification: verificationTable,
      },
    }),
    advanced: {
      database: {
        // Use ULID for all Better Auth-generated IDs to stay consistent
        // with the rest of the Scratchy data layer.
        generateId: () => ulid(),
      },
    },
  });
}
```

### 2. Register `authPlugin` in the Server (`src/server.ts`)

```typescript
// src/server.ts
import authPlugin from "@scratchy/auth/plugin";
import { createAppAuth } from "./auth.js";

export async function buildServer(opts: ServerOpts = {}) {
  const config = opts.config ?? loadAppConfig();
  const server = await createServer(config);

  // ── Database ──────────────────────────────────────────────────────────
  if (config.DATABASE_URL) {
    const { default: drizzlePlugin } = await import("@scratchy/drizzle/plugin");
    await server.register(drizzlePlugin, {
      connectionString: config.DATABASE_URL,
      schemas: dbSchemas,
    });
  }

  // ── Auth ──────────────────────────────────────────────────────────────
  // Register after the database plugin so `server.db` is available.
  if (config.BETTER_AUTH_SECRET) {
    const auth = createAppAuth(config, server.db);
    await server.register(authPlugin, { auth });
  }

  // ── tRPC API ──────────────────────────────────────────────────────────
  // ...
}
```

**Critical registration order:** `authPlugin` must be registered **after**
`@scratchy/drizzle/plugin` so that `server.db` is decorated and available
before Better Auth's drizzle adapter is initialised.

## Request Decorators

After `authPlugin` is registered, every request has two decorators set by
the `onRequest` lifecycle hook:

| Decorator         | Type                  | Populated when              |
| ----------------- | --------------------- | --------------------------- |
| `request.session` | `AuthSession \| null` | A valid session cookie is present |
| `request.user`    | `AuthUser \| null`    | Same — convenience shorthand of `request.session.user` |

```typescript
interface AuthUser {
  id: string;
  name: string;
  email: string;
  role?: string;
  [key: string]: unknown;
}

interface AuthSession {
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    [key: string]: unknown;
  };
  user: AuthUser;
}
```

## Protecting Routes

### With `requireAuth` (preHandler hook)

```typescript
import { requireAuth } from "@scratchy/auth/hooks";

fastify.get("/profile", { preHandler: requireAuth }, (request, reply) => {
  // request.session and request.user are non-null here
  return { user: request.user };
});

fastify.put(
  "/posts/:id",
  { preHandler: requireAuth },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    // Only authenticated users reach this handler
    return updatePost(id, request.body);
  },
);
```

`requireAuth` sends `{ error: "Unauthorized", message: "..." }` with HTTP 401
when no valid session is found.

### With `requireAdmin` (admin-only)

```typescript
import { requireAdmin } from "@scratchy/auth/hooks";

fastify.delete(
  "/users/:id",
  { preHandler: requireAdmin },
  async (request) => {
    // Only users with role === "admin" reach this handler
    const { id } = request.params as { id: string };
    await deleteUser(id);
    return { success: true };
  },
);
```

`requireAdmin` sends HTTP 401 for unauthenticated requests and HTTP 403 for
authenticated non-admin users.

### With tRPC `protectedProcedure`

```typescript
// routers/posts/mutations.ts
import { protectedProcedure } from "../../router.js";

export const postMutations = {
  create: protectedProcedure
    .input(z.object({ title: z.string(), content: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx.request.server;
      // ctx.user is AuthUser here (non-null — enforced by protectedProcedure)
      return db.insert(post).values({
        id: ulid(),
        authorId: ctx.user.id,
        ...input,
      }).returning();
    }),
};
```

`@scratchy/trpc` re-exports `protectedProcedure` which throws a tRPC
`UNAUTHORIZED` error when the session is missing.

## Database Schema for Better Auth

Better Auth requires four tables when using the drizzle adapter. Create them
in your schema directory:

### `src/db/schema/user.ts` (updated)

```typescript
import { appSchema } from "../my-schema.js";
import { timestamps } from "./columns.helpers.js";
import { boolean, index, text } from "drizzle-orm/pg-core";

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export const userRole = appSchema.enum("user_role", ["member", "admin"]);

export const user = appSchema.table(
  "user",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    // Required by Better Auth
    emailVerified: boolean().default(false).notNull(),
    image: text(),
    role: userRole().default("member").notNull(),
    banned: boolean().default(false),
    ...timestamps,
  },
  (table) => [index("user_email_idx").on(table.email)],
);
```

### `src/db/schema/auth-tables.ts` (new)

```typescript
import { appSchema } from "../my-schema.js";
import { timestamps } from "./columns.helpers.js";
import { user } from "./user.js";
import { index, text, timestamp } from "drizzle-orm/pg-core";

// ── session ──────────────────────────────────────────────────────────────────

export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;

export const session = appSchema.table(
  "session",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    ...timestamps,
  },
  (table) => [
    index("session_user_id_idx").on(table.userId),
    index("session_token_idx").on(table.token),
  ],
);

// ── account ───────────────────────────────────────────────────────────────────

export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;

export const account = appSchema.table(
  "account",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    expiresAt: timestamp({ withTimezone: true }),
    password: text(),
    ...timestamps,
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    index("account_provider_idx").on(table.providerId, table.accountId),
  ],
);

// ── verification ──────────────────────────────────────────────────────────────

export type Verification = typeof verification.$inferSelect;
export type NewVerification = typeof verification.$inferInsert;

export const verification = appSchema.table(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);
```

## Auth Endpoints (HTTP)

Once `authPlugin` is registered, Better Auth mounts the following HTTP routes
under `basePath` (default `/api/auth`):

| Method | Path                             | Description           |
| ------ | -------------------------------- | --------------------- |
| POST   | `/api/auth/sign-up/email`        | Register a new user   |
| POST   | `/api/auth/sign-in/email`        | Sign in with email    |
| POST   | `/api/auth/sign-out`             | Sign out              |
| GET    | `/api/auth/get-session`          | Get current session   |
| POST   | `/api/auth/forgot-password`      | Request password reset|
| POST   | `/api/auth/reset-password`       | Reset password        |

```typescript
// Sign up (fetch example)
await fetch("/api/auth/sign-up/email", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Jane Doe",
    email: "jane@example.com",
    password: "my-secure-password",
  }),
});

// Sign in
await fetch("/api/auth/sign-in/email", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "jane@example.com",
    password: "my-secure-password",
  }),
});
```

## Browser Client (`createAuthClient`)

Use `createAuthClient()` from `@scratchy/auth/client` in browser code
(e.g., Qwik components):

```typescript
// src/client/lib/auth.ts
import { createAuthClient } from "@scratchy/auth/client";

export const authClient = createAuthClient({
  baseURL: "/api/auth",
});

// Usage in a Qwik component:
// const { data } = await authClient.signIn.email({ email, password });
// await authClient.signOut();
// const session = await authClient.getSession();
```

## TypeScript Augmentation

When `authPlugin` is registered, `request.session` and `request.user` are
already typed via the plugin's `declare module "fastify"` augmentation. No
additional augmentation is required in application code.

If you need to import the `AuthUser` type in application files:

```typescript
import type { AuthUser } from "@scratchy/auth/plugin";
```

## Environment Variables

| Variable            | Description                                   | Required |
| ------------------- | --------------------------------------------- | -------- |
| `BETTER_AUTH_SECRET`| Secret key for signing auth tokens/cookies.   | Yes      |
| `ORIGIN`            | The application's base URL (for CORS check).  | Recommended |

```bash
# .env
BETTER_AUTH_SECRET=a-random-32+-character-secret-string
ORIGIN=http://localhost:3000
```

Generate a secure secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Anti-Patterns

### ❌ Don't register `authPlugin` before the database plugin

```typescript
// BAD — server.db is not yet available
await server.register(authPlugin, { auth });
await server.register(drizzlePlugin, { ... });

// GOOD — database first, then auth
await server.register(drizzlePlugin, { ... });
await server.register(authPlugin, { auth });
```

### ❌ Don't create auth instances inside route handlers

```typescript
// BAD — new Better Auth instance on every request
fastify.get("/me", async (request) => {
  const auth = createAuth({ secret: "..." }); // Never do this
  return request.user;
});

// GOOD — create once at module scope, pass to plugin
// auth.ts
export const auth = createAppAuth(config, db);
// server.ts
await server.register(authPlugin, { auth });
```

### ❌ Don't access `request.user` before `authPlugin` is registered

If `authPlugin` is not registered, `request.user` will be `undefined` (not
`null`) because the decorator is never added. Always guard with an auth
existence check or ensure the plugin is always registered when auth is needed.

### ❌ Don't hardcode the secret

```typescript
// BAD
secret: "my-secret"

// GOOD — load from config/environment
secret: config.BETTER_AUTH_SECRET
```

## Reference Links

- <a href="https://www.better-auth.com/docs">Better Auth Documentation</a>
- <a href="https://www.better-auth.com/docs/integrations/fastify">Better Auth Fastify Integration</a>
- <a href="https://github.com/johannschopplich/fastify-better-auth">fastify-better-auth Plugin</a>
- <a href="https://www.better-auth.com/docs/adapters/drizzle">Better Auth Drizzle Adapter</a>
- <a href="https://www.better-auth.com/docs/concepts/session-management">Session Management</a>
- <a href="https://www.better-auth.com/docs/plugins/admin">Better Auth Admin Plugin</a>
