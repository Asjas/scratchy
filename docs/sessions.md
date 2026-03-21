# Sessions & Cookie Management

Scratchy provides a layered session and cookie system built on top of Fastify 5.
Cookies handle low-level signed values; sessions build on cookies to provide
server-side state with multiple storage backends.

---

## Table of Contents

- [Cookie Management](#cookie-management)
  - [Creating Cookies](#creating-cookies)
  - [Secret Rotation](#secret-rotation)
  - [Reading and Writing Cookies](#reading-and-writing-cookies)
  - [Cookie Options Reference](#cookie-options-reference)
  - [Cookie Serialization](#cookie-serialization)
- [Session Storage Strategies](#session-storage-strategies)
  - [Cookie-Based Storage](#cookie-based-storage)
  - [Redis / DragonflyDB Storage](#redis--dragonflydb-storage)
  - [PostgreSQL Storage](#postgresql-storage)
  - [Memory Storage](#memory-storage)
- [Session API](#session-api)
  - [Reading and Writing Data](#reading-and-writing-data)
  - [Flash Messages](#flash-messages)
  - [Session Lifecycle](#session-lifecycle)
- [Session Middleware](#session-middleware)
  - [Fastify Plugin Registration](#fastify-plugin-registration)
  - [Populating the Request Context](#populating-the-request-context)
  - [tRPC Context Integration](#trpc-context-integration)
- [CSRF Protection](#csrf-protection)
- [Authentication Flow](#authentication-flow)
  - [Login](#login)
  - [Logout](#logout)
  - [Multi-Session and Remember-Me](#multi-session-and-remember-me)
- [Session Cleanup and Garbage Collection](#session-cleanup-and-garbage-collection)
- [Security Best Practices](#security-best-practices)
- [Anti-Patterns](#anti-patterns)
- [Reference Links](#reference-links)

---

## Cookie Management

### Creating Cookies

`createCookie()` returns a cookie descriptor that knows how to sign, parse, and
serialize values. It does not set the cookie on a response by itself — you pass
the descriptor to a session storage factory or use it directly in a route.

```typescript
// lib/cookies.ts
import { createCookie } from "~/session/cookie.js";

export const themeCookie = createCookie("theme", {
  httpOnly: false, // client JS may read the theme
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 365, // 1 year in seconds
  secrets: [
    process.env.COOKIE_SECRET_CURRENT!,
    process.env.COOKIE_SECRET_PREVIOUS!,
  ],
});

export const sessionCookie = createCookie("__session", {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 7, // 1 week
  secrets: [
    process.env.COOKIE_SECRET_CURRENT!,
    process.env.COOKIE_SECRET_PREVIOUS!,
  ],
});
```

Under the hood `createCookie()` returns an object conforming to the `Cookie`
interface:

```typescript
interface Cookie {
  readonly name: string;
  readonly options: CookieOptions;
  parse(cookieHeader: string | null): Promise<unknown>;
  serialize(value: unknown): Promise<string>;
}
```

### Secret Rotation

Scratchy signs cookies with **HMAC-SHA256**. The `secrets` array supports
rotation: the **first** secret signs new cookies; all secrets are tried when
verifying an incoming cookie. This lets you rotate secrets without invalidating
every active session at once.

```typescript
// Rotation flow:
// 1. Generate a new secret.
// 2. Prepend it to the array so it becomes the signing key.
// 3. Keep the old secret in the array so existing cookies still verify.
// 4. After the cookie maxAge has elapsed, remove the old secret.

export const sessionCookie = createCookie("__session", {
  secrets: [
    process.env.COOKIE_SECRET_NEW!, // signs outgoing cookies
    process.env.COOKIE_SECRET_PREVIOUS!, // still verifies incoming cookies
  ],
  // ...other options
});
```

The signing and verification implementation:

```typescript
// session/crypto.ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function sign(value: string, secret: string): string {
  const signature = createHmac("sha256", secret)
    .update(value)
    .digest("base64url");
  return `${value}.${signature}`;
}

export function unsign(
  signed: string,
  secrets: readonly string[],
): string | null {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return null;

  const value = signed.slice(0, lastDot);
  const providedSig = signed.slice(lastDot + 1);

  for (const secret of secrets) {
    const expected = createHmac("sha256", secret)
      .update(value)
      .digest("base64url");
    if (
      providedSig.length === expected.length &&
      timingSafeEqual(Buffer.from(providedSig), Buffer.from(expected))
    ) {
      return value;
    }
  }

  return null;
}
```

### Reading and Writing Cookies

Inside a Fastify route handler or hook you work with the `RequestEvent`-style
cookie helpers that wrap `@fastify/cookie`:

```typescript
// routes/preferences/index.ts
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { themeCookie } from "~/lib/cookies.js";

const routes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/preferences", async (request, reply) => {
    // Read — parse() extracts and verifies the signed value
    const theme = await themeCookie.parse(request.headers.cookie ?? null);
    return { theme: theme ?? "system" };
  });

  fastify.post(
    "/preferences",
    {
      schema: {
        body: z.object({ theme: z.string() }),
      },
    },
    async (request, reply) => {
      const { theme } = request.body;

      // Write — serialize() signs the value and returns a Set-Cookie string
      const header = await themeCookie.serialize(theme);
      reply.header("set-cookie", header);
      return { ok: true };
    },
  );
};

export default routes;
```

### Cookie Options Reference

| Option     | Type                          | Default     | Description                                                   |
| ---------- | ----------------------------- | ----------- | ------------------------------------------------------------- |
| `httpOnly` | `boolean`                     | `true`      | Prevent client-side JavaScript from reading the cookie.       |
| `secure`   | `boolean`                     | `true`      | Send cookie only over HTTPS.                                  |
| `sameSite` | `"strict" \| "lax" \| "none"` | `"lax"`     | CSRF mitigation. Use `"strict"` for sensitive cookies.        |
| `maxAge`   | `number`                      | `undefined` | Lifetime in seconds. Omit for session (browser-close) cookie. |
| `path`     | `string`                      | `"/"`       | URL path scope.                                               |
| `domain`   | `string`                      | `undefined` | Cookie domain scope. Omit to default to the request host.     |
| `secrets`  | `string[]`                    | `[]`        | HMAC-SHA256 signing secrets; first signs, all verify.         |

### Cookie Serialization

By default cookies are JSON-serialized then Base64url-encoded before signing.
For simple string values you can opt out of JSON to save bytes:

```typescript
export const langCookie = createCookie("lang", {
  serialize: "raw", // store the string as-is; no JSON wrapping
  httpOnly: false,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  secrets: [process.env.COOKIE_SECRET_CURRENT!],
});
```

---

## Session Storage Strategies

All storage strategies implement the same `SessionStorage` interface so you can
swap backends without changing application code:

```typescript
interface SessionStorage {
  getSession(cookieHeader: string | null): Promise<Session>;
  commitSession(session: Session): Promise<string>; // returns Set-Cookie header
  destroySession(session: Session): Promise<string>; // returns Set-Cookie header
}
```

### Cookie-Based Storage

Stores session data directly in a signed cookie. Simple to deploy — no external
dependencies — but limited to **~4 KB** of data.

```typescript
// lib/session.ts
import { sessionCookie } from "~/lib/cookies.js";
import { createCookieSessionStorage } from "~/session/cookie-storage.js";

export const { getSession, commitSession, destroySession } =
  createCookieSessionStorage({
    cookie: sessionCookie,
  });
```

> **When to use:** prototyping, tiny payloads like a user ID and a flash
> message. Avoid when session data may grow unpredictably.

### Redis / DragonflyDB Storage

**Recommended for production.** Sessions are stored in Redis (or DragonflyDB)
keyed by a random session ID. Only the ID travels in the cookie.

```typescript
// lib/session.ts
import { Redis } from "ioredis";
import { sessionCookie } from "~/lib/cookies.js";
import { createRedisSessionStorage } from "~/session/redis-storage.js";

const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

export const { getSession, commitSession, destroySession } =
  createRedisSessionStorage({
    cookie: sessionCookie,
    redis,
    prefix: "sess:",
    ttl: 60 * 60 * 24 * 7, // 7 days in seconds
  });
```

Implementation sketch:

```typescript
// session/redis-storage.ts
import type { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { createSession } from "~/session/session.js";
import type { Cookie, Session, SessionStorage } from "~/session/types.js";

interface RedisSessionStorageOptions {
  cookie: Cookie;
  redis: Redis;
  prefix?: string;
  ttl: number;
}

export function createRedisSessionStorage(
  opts: RedisSessionStorageOptions,
): SessionStorage {
  const { cookie, redis, prefix = "sess:", ttl } = opts;

  return {
    async getSession(cookieHeader) {
      const id = (await cookie.parse(cookieHeader)) as string | null;
      if (id) {
        const raw = await redis.get(`${prefix}${id}`);
        if (raw) {
          const data = JSON.parse(raw) as Record<string, unknown>;
          return createSession(data, id);
        }
      }
      return createSession({}, randomUUID());
    },

    async commitSession(session) {
      await redis.set(
        `${prefix}${session.id}`,
        JSON.stringify(session.data),
        "EX",
        ttl,
      );
      return cookie.serialize(session.id);
    },

    async destroySession(session) {
      await redis.del(`${prefix}${session.id}`);
      return cookie.serialize("", { maxAge: 0 });
    },
  };
}
```

### PostgreSQL Storage

Use when you need an **audit trail** or when session data participates in
relational queries (e.g., admin dashboards listing active sessions).

```typescript
// db/schema/session-store.ts
import { jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { mySchema } from "~/db/my-schema.js";
import { timestamps } from "~/db/schema/columns.helpers.js";

export const sessionStore = mySchema.table("session_store", {
  id: text().primaryKey(),
  data: jsonb().notNull().default({}),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  ...timestamps,
});
```

```typescript
// lib/session.ts
import { db } from "~/db/index.js";
import { sessionCookie } from "~/lib/cookies.js";
import { createPostgresSessionStorage } from "~/session/pg-storage.js";

export const { getSession, commitSession, destroySession } =
  createPostgresSessionStorage({
    cookie: sessionCookie,
    db,
    table: "session_store",
    ttl: 60 * 60 * 24 * 7,
  });
```

Implementation sketch:

```typescript
// session/pg-storage.ts
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";
import { sessionStore } from "~/db/schema/session-store.js";
import { createSession } from "~/session/session.js";
import type { Cookie, Session, SessionStorage } from "~/session/types.js";

interface PgSessionStorageOptions {
  cookie: Cookie;
  db: NodePgDatabase;
  table: string;
  ttl: number;
}

export function createPostgresSessionStorage(
  opts: PgSessionStorageOptions,
): SessionStorage {
  const { cookie, db, ttl } = opts;

  return {
    async getSession(cookieHeader) {
      const id = (await cookie.parse(cookieHeader)) as string | null;
      if (id) {
        const [row] = await db
          .select()
          .from(sessionStore)
          .where(eq(sessionStore.id, id));
        if (row && row.expiresAt > new Date()) {
          return createSession(row.data as Record<string, unknown>, id);
        }
      }
      return createSession({}, randomUUID());
    },

    async commitSession(session) {
      const expiresAt = new Date(Date.now() + ttl * 1000);
      await db
        .insert(sessionStore)
        .values({ id: session.id, data: session.data, expiresAt })
        .onConflictDoUpdate({
          target: sessionStore.id,
          set: { data: session.data, expiresAt },
        });
      return cookie.serialize(session.id);
    },

    async destroySession(session) {
      await db.delete(sessionStore).where(eq(sessionStore.id, session.id));
      return cookie.serialize("", { maxAge: 0 });
    },
  };
}
```

### Memory Storage

For **development and tests only**. Data lives in a `Map` and is lost on
restart.

```typescript
// lib/session.dev.ts
import { sessionCookie } from "~/lib/cookies.js";
import { createMemorySessionStorage } from "~/session/memory-storage.js";

export const { getSession, commitSession, destroySession } =
  createMemorySessionStorage({
    cookie: sessionCookie,
  });
```

```typescript
// session/memory-storage.ts
import { randomUUID } from "node:crypto";
import { createSession } from "~/session/session.js";
import type { Cookie, Session, SessionStorage } from "~/session/types.js";

interface MemorySessionStorageOptions {
  cookie: Cookie;
}

export function createMemorySessionStorage(
  opts: MemorySessionStorageOptions,
): SessionStorage {
  const { cookie } = opts;
  const store = new Map<
    string,
    { data: Record<string, unknown>; expiresAt: number }
  >();

  return {
    async getSession(cookieHeader) {
      const id = (await cookie.parse(cookieHeader)) as string | null;
      if (id) {
        const entry = store.get(id);
        if (entry && entry.expiresAt > Date.now()) {
          return createSession(entry.data, id);
        }
        if (entry) store.delete(id);
      }
      return createSession({}, randomUUID());
    },

    async commitSession(session) {
      store.set(session.id, {
        data: session.data,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      return cookie.serialize(session.id);
    },

    async destroySession(session) {
      store.delete(session.id);
      return cookie.serialize("", { maxAge: 0 });
    },
  };
}
```

---

## Session API

The `Session` object is the main interface your application code interacts with.

```typescript
interface Session {
  readonly id: string;
  readonly data: Record<string, unknown>;
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  unset(key: string): void;
  has(key: string): boolean;
  flash(key: string, value: unknown): void;
  regenerateId(): void;
  readonly dirty: boolean;
}
```

### Reading and Writing Data

```typescript
fastify.get("/dashboard", async (request, reply) => {
  const session = await getSession(request.headers.cookie ?? null);

  // Read
  const userId = session.get<string>("userId");
  if (!userId) {
    return reply.redirect("/login");
  }

  // Write
  session.set("lastSeen", new Date().toISOString());

  // Check
  if (session.has("onboardingComplete")) {
    // skip onboarding
  }

  // Remove a single key
  session.unset("temporaryFlag");

  // Commit changes back to storage
  reply.header("set-cookie", await commitSession(session));
  return { userId };
});
```

### Flash Messages

Flash data is available for **exactly one read**. After `session.get()` reads a
flash key, it is automatically removed from the session. This is ideal for
one-time notifications such as "Profile updated" or form error summaries.

```typescript
// POST /settings — set a flash message after saving
fastify.post("/settings", async (request, reply) => {
  const session = await getSession(request.headers.cookie ?? null);

  await saveSettings(request.body);
  session.flash("success", "Settings saved successfully.");

  reply.header("set-cookie", await commitSession(session));
  return reply.redirect("/settings");
});

// GET /settings — read (and consume) the flash message
fastify.get("/settings", async (request, reply) => {
  const session = await getSession(request.headers.cookie ?? null);

  // Reading a flash key removes it from the session
  const success = session.get<string>("__flash_success");

  reply.header("set-cookie", await commitSession(session));
  return { success, settings: await loadSettings() };
});
```

Implementation detail: `session.flash(key, value)` stores the value under the
key `__flash_${key}`. When `session.get()` encounters a key prefixed with
`__flash_`, it deletes the entry after returning the value.

```typescript
// session/session.ts
import { randomUUID } from "node:crypto";

const FLASH_PREFIX = "__flash_";

export function createSession(
  initialData: Record<string, unknown>,
  id: string,
): Session {
  const data = { ...initialData };
  let dirty = false;
  let currentId = id;

  return {
    get id() {
      return currentId;
    },
    get data() {
      return data;
    },
    get dirty() {
      return dirty;
    },

    get<T = unknown>(key: string): T | undefined {
      // Auto-consume flash values
      const flashKey = `${FLASH_PREFIX}${key}`;
      if (flashKey in data) {
        const value = data[flashKey] as T;
        delete data[flashKey];
        dirty = true;
        return value;
      }
      return data[key] as T | undefined;
    },

    set(key: string, value: unknown) {
      data[key] = value;
      dirty = true;
    },

    unset(key: string) {
      delete data[key];
      dirty = true;
    },

    has(key: string) {
      return key in data || `${FLASH_PREFIX}${key}` in data;
    },

    flash(key: string, value: unknown) {
      data[`${FLASH_PREFIX}${key}`] = value;
      dirty = true;
    },

    regenerateId() {
      currentId = randomUUID();
      dirty = true;
    },
  };
}
```

### Session Lifecycle

| Method             | Purpose                                             |
| ------------------ | --------------------------------------------------- |
| `getSession()`     | Parse the cookie header, load or create a session.  |
| `commitSession()`  | Persist changes and return a `Set-Cookie` header.   |
| `destroySession()` | Delete server-side data, return an expiring cookie. |
| `regenerateId()`   | Replace the session ID (fixation prevention).       |

---

## Session Middleware

### Fastify Plugin Registration

Register `@fastify/cookie` first, then the session plugin:

```typescript
// plugins/external/cookies.ts
import fp from "fastify-plugin";

export default fp(async function cookiePlugin(fastify) {
  await fastify.register(import("@fastify/cookie"), {
    // Signing is handled by createCookie(); @fastify/cookie only parses.
    parseOptions: {},
  });
});
```

```typescript
// plugins/app/session.ts
import fp from "fastify-plugin";
import { commitSession, getSession } from "~/lib/session.js";

export default fp(async function sessionPlugin(fastify) {
  // Decorate the request with a session getter
  fastify.decorateRequest("session", null);

  // Parse session on every request
  fastify.addHook("onRequest", async (request) => {
    request.session = await getSession(request.headers.cookie ?? null);
  });

  // Auto-commit dirty sessions before sending the response
  fastify.addHook("onSend", async (request, reply) => {
    if (request.session?.dirty) {
      const header = await commitSession(request.session);
      reply.header("set-cookie", header);
    }
  });
});
```

TypeScript augmentation:

```typescript
// types/fastify.d.ts
import type { Session } from "~/session/types.js";

declare module "fastify" {
  interface FastifyRequest {
    session: Session;
  }
}
```

### Populating the Request Context

With the plugin above, every route handler receives `request.session`
automatically:

```typescript
fastify.get("/me", async (request) => {
  const userId = request.session.get<string>("userId");
  if (!userId) {
    throw fastify.httpErrors.unauthorized("Not logged in");
  }
  return { userId };
});
```

### tRPC Context Integration

Pass the session into the tRPC context so all procedures can access it:

```typescript
// context.ts
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import type { Session } from "~/session/types.js";

export interface Context {
  request: CreateFastifyContextOptions["req"];
  reply: CreateFastifyContextOptions["res"];
  session: Session;
  user: User | null;
}

export async function createContext({
  req,
  res,
}: CreateFastifyContextOptions): Promise<Context> {
  const session = req.session; // populated by the session plugin
  const userId = session.get<string>("userId");
  const user = userId ? await findUserById(userId) : null;

  return { request: req, reply: res, session, user };
}
```

Now any tRPC procedure can read or write session data:

```typescript
// routers/auth/mutations.ts
export const authMutations = {
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    ctx.session.flash("info", "You have been logged out.");
    const header = await destroySession(ctx.session);
    ctx.reply.header("set-cookie", header);
    return { ok: true };
  }),
};
```

---

## CSRF Protection

Generate a per-session CSRF token and validate it on state-changing requests.

### Token Generation

```typescript
// lib/csrf.ts
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Session } from "~/session/types.js";

const CSRF_KEY = "_csrf";

export function getCsrfToken(session: Session): string {
  let token = session.get<string>(CSRF_KEY);
  if (!token) {
    token = randomBytes(32).toString("base64url");
    session.set(CSRF_KEY, token);
  }
  return token;
}

export function validateCsrfToken(session: Session, token: string): boolean {
  const expected = session.get<string>(CSRF_KEY);
  if (!expected || !token) return false;

  return (
    expected.length === token.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(token))
  );
}
```

### Fastify Hook

```typescript
// hooks/csrf.ts
import fp from "fastify-plugin";
import { validateCsrfToken } from "~/lib/csrf.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export default fp(async function csrfHook(fastify) {
  fastify.addHook("preHandler", async (request, reply) => {
    if (SAFE_METHODS.has(request.method)) return;

    const token =
      (request.headers["x-csrf-token"] as string) ??
      ((request.body as Record<string, unknown>)?._csrf as string | undefined);

    if (!token || !validateCsrfToken(request.session, token)) {
      return reply.status(403).send({ error: "Invalid CSRF token" });
    }
  });
});
```

### Client Usage

Render the token into the page during SSR, then include it with every
state-changing request:

```typescript
// In Qwik routeLoader$
export const useCsrfToken = routeLoader$(({ cookie, sharedMap }) => {
  const session = sharedMap.get("session") as Session;
  return getCsrfToken(session);
});
```

```typescript
// In a Qwik component
const csrf = useCsrfToken();
const handleSubmit = $(() => {
  fetch("/trpc/settings.update", {
    method: "POST",
    headers: { "x-csrf-token": csrf.value },
    body: JSON.stringify({ theme: "dark" }),
  });
});
```

---

## Authentication Flow

### Login

Always regenerate the session ID after a successful login to prevent session
fixation attacks:

```typescript
// routers/auth/mutations.ts
import { z } from "zod";
import { commitSession } from "~/lib/session.js";
import { publicProcedure } from "~/router.js";

export const authMutations = {
  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = await verifyCredentials(input.email, input.password);
      if (!user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      // Regenerate session ID to prevent fixation
      ctx.session.regenerateId();

      ctx.session.set("userId", user.id);
      ctx.session.set("role", user.role);
      ctx.session.flash("success", "Welcome back!");

      const header = await commitSession(ctx.session);
      ctx.reply.header("set-cookie", header);

      return { id: user.id, name: user.name };
    }),
};
```

### Logout

Destroy the session entirely — don't just unset the user ID:

```typescript
export const authMutations = {
  // ...login above

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    const header = await destroySession(ctx.session);
    ctx.reply.header("set-cookie", header);
    return { ok: true };
  }),
};
```

### Multi-Session and Remember-Me

For "remember me" functionality, issue a second long-lived cookie containing a
one-time token. When the short-lived session expires, the remember-me token can
start a new session.

```typescript
// lib/cookies.ts
export const rememberMeCookie = createCookie("__remember", {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 days
  secrets: [process.env.COOKIE_SECRET_CURRENT!],
});
```

```typescript
// db/schema/remember-token.ts
import { text, timestamp } from "drizzle-orm/pg-core";
import { mySchema } from "~/db/my-schema.js";

export const rememberToken = mySchema.table("remember_token", {
  id: text().primaryKey(), // ULID
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  tokenHash: text().notNull(), // SHA-256 of the raw token
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});
```

```typescript
// lib/remember-me.ts
import { eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { ulid } from "ulid";
import { db } from "~/db/index.js";
import { rememberToken } from "~/db/schema/remember-token.js";
import { rememberMeCookie } from "~/lib/cookies.js";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("base64url");
}

export async function issueRememberMeToken(
  userId: string,
  reply: { header(name: string, value: string): void },
): Promise<void> {
  const raw = randomBytes(32).toString("base64url");
  const id = ulid();

  await db.insert(rememberToken).values({
    id,
    userId,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  const header = await rememberMeCookie.serialize(`${id}:${raw}`);
  reply.header("set-cookie", header);
}

export async function consumeRememberMeToken(
  cookieHeader: string | null,
): Promise<string | null> {
  const value = (await rememberMeCookie.parse(cookieHeader)) as string | null;
  if (!value) return null;

  const [id, raw] = value.split(":");
  if (!id || !raw) return null;

  const [row] = await db
    .select()
    .from(rememberToken)
    .where(eq(rememberToken.id, id));

  if (!row || row.expiresAt < new Date()) return null;

  const expectedHash = hashToken(raw);
  if (row.tokenHash !== expectedHash) return null;

  // One-time use: delete after consumption
  await db.delete(rememberToken).where(eq(rememberToken.id, id));

  return row.userId;
}
```

Middleware that checks the remember-me token when no active session exists:

```typescript
// hooks/remember-me.ts
import fp from "fastify-plugin";
import {
  consumeRememberMeToken,
  issueRememberMeToken,
} from "~/lib/remember-me.js";
import { commitSession, getSession } from "~/lib/session.js";

export default fp(async function rememberMeHook(fastify) {
  fastify.addHook("onRequest", async (request, reply) => {
    const userId = request.session.get<string>("userId");
    if (userId) return; // already logged in

    const rememberedUserId = await consumeRememberMeToken(
      request.headers.cookie ?? null,
    );
    if (!rememberedUserId) return;

    // Start a new session for the remembered user
    request.session.regenerateId();
    request.session.set("userId", rememberedUserId);

    const sessionHeader = await commitSession(request.session);
    reply.header("set-cookie", sessionHeader);

    // Rotate the remember-me token (issue a fresh one)
    await issueRememberMeToken(rememberedUserId, reply);
  });
});
```

---

## Session Cleanup and Garbage Collection

### Redis / DragonflyDB

Redis handles expiration natively via the `EX` flag set during `commitSession`.
No additional cleanup is needed.

### PostgreSQL

Schedule a periodic cleanup to delete expired rows. Run it as a lightweight
Piscina worker task or a cron job:

```typescript
// tasks/session-cleanup.ts
import { lt } from "drizzle-orm";
import { db } from "~/db/index.js";
import { rememberToken } from "~/db/schema/remember-token.js";
import { sessionStore } from "~/db/schema/session-store.js";

export async function cleanupExpiredSessions(): Promise<{ deleted: number }> {
  const now = new Date();

  const sessionsResult = await db
    .delete(sessionStore)
    .where(lt(sessionStore.expiresAt, now))
    .returning({ id: sessionStore.id });

  const tokensResult = await db
    .delete(rememberToken)
    .where(lt(rememberToken.expiresAt, now))
    .returning({ id: rememberToken.id });

  const deleted = sessionsResult.length + tokensResult.length;
  return { deleted };
}
```

Register the cleanup on a timer in the server startup:

```typescript
// server.ts
import { cleanupExpiredSessions } from "~/tasks/session-cleanup.js";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const cleanupTimer = setInterval(async () => {
  try {
    const result = await cleanupExpiredSessions();
    server.log.info({ deleted: result.deleted }, "session cleanup completed");
  } catch (err) {
    server.log.error(err, "session cleanup failed");
  }
}, CLEANUP_INTERVAL_MS);

// Clear the timer on shutdown
server.addHook("onClose", async () => {
  clearInterval(cleanupTimer);
});
```

---

## Security Best Practices

1. **Regenerate the session ID after login** — call `session.regenerateId()`
   immediately after successful authentication. This prevents session fixation
   attacks where an attacker pre-sets a session ID.

2. **Destroy — don't just unset — on logout** — use `destroySession()` to wipe
   server-side data and expire the cookie. Unsetting keys leaves the session ID
   valid.

3. **Always set `httpOnly: true`** on session cookies. Client JavaScript should
   never read a session cookie.

4. **Always set `secure: true`** in production. Session cookies must only travel
   over HTTPS.

5. **Use `sameSite: "lax"` or `"strict"`** — `"lax"` is the recommended default;
   use `"strict"` for highly sensitive operations.

6. **Sign every cookie** — pass at least one secret to `createCookie()`. Never
   store unsigned session IDs.

7. **Rotate secrets** — keep the previous secret in the `secrets` array while
   rolling out a new one. Remove the old secret after one full `maxAge` cycle.

8. **Set reasonable `maxAge` values** — short-lived sessions (hours) for
   sensitive apps, longer (days/weeks) for low-risk apps. Pair with remember-me
   tokens for convenience.

9. **Store minimal data in sessions** — keep sessions small. Store a user ID and
   look up the rest from the database. Large sessions hurt performance and
   create stale-data risks.

10. **Use CSRF tokens on state-changing requests** — even with `sameSite`
    cookies, include a CSRF token for defense in depth.

11. **Hash remember-me tokens before storing** — store `SHA-256(token)` in the
    database, not the raw token. If the database leaks, raw tokens are not
    exposed.

12. **One-time remember-me tokens** — delete and reissue on every use. This
    limits the window for token theft.

13. **Run session cleanup periodically** — expired rows in PostgreSQL do not
    delete themselves. Schedule garbage collection.

---

## Anti-Patterns

### ❌ Don't store secrets in session data

```typescript
// BAD — API keys, passwords, tokens with broad scope
session.set("apiKey", "sk_live_...");
session.set("accessToken", longLivedOAuthToken);

// GOOD — Store references, not secrets
session.set("userId", user.id);
// Look up permissions from the database at request time
```

### ❌ Don't skip session ID regeneration on login

```typescript
// BAD — Session fixation vulnerability
session.set("userId", user.id);
const header = await commitSession(session);

// GOOD — Regenerate first
session.regenerateId();
session.set("userId", user.id);
const header = await commitSession(session);
```

### ❌ Don't rely solely on cookie expiration for logout

```typescript
// BAD — Only clears the cookie; server-side data persists
reply.header("set-cookie", "__session=; Max-Age=0");

// GOOD — Destroy the server-side session
const header = await destroySession(session);
reply.header("set-cookie", header);
```

### ❌ Don't use memory storage in production

```typescript
// BAD — Data is lost on every restart and not shared across instances
import { createMemorySessionStorage } from "~/session/memory-storage.js";
// GOOD — Use Redis or PostgreSQL
import { createRedisSessionStorage } from "~/session/redis-storage.js";
```

### ❌ Don't disable `httpOnly` on session cookies

```typescript
// BAD — Exposes session cookie to XSS attacks
export const sessionCookie = createCookie("__session", {
  httpOnly: false,
  // ...
});

// GOOD
export const sessionCookie = createCookie("__session", {
  httpOnly: true,
  // ...
});
```

### ❌ Don't store large objects in cookie-based sessions

```typescript
// BAD — Easily exceeds the 4 KB cookie size limit
session.set("cart", largeShoppingCartObject);

// GOOD — Store in the database, reference by ID
session.set("cartId", cart.id);
```

### ❌ Don't compare CSRF tokens with `===`

```typescript
// GOOD — Constant-time comparison
import { timingSafeEqual } from "node:crypto";

// BAD — Vulnerable to timing attacks
if (expectedToken === providedToken) {
  /* ... */
}

const safe =
  expected.length === provided.length &&
  timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
```

---

## Reference Links

- [@fastify/cookie](https://github.com/fastify/fastify-cookie)
- [@fastify/session](https://github.com/fastify/session)
- [@fastify/secure-session](https://github.com/fastify/fastify-secure-session)
- [Remix Session API](https://remix.run/docs/en/main/utils/sessions)
- [Qwik City Cookie API](https://qwik.dev/docs/cookbook/re-exporting-loaders/#extracting-cookie)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [Node.js crypto — HMAC](https://nodejs.org/api/crypto.html#class-hmac)
- [DragonflyDB](https://www.dragonflydb.io/)
