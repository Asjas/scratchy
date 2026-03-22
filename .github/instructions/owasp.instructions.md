---
name: owasp-security
description: "Maps the OWASP Top 10 (2021) web application security risks to safe-coding patterns using the exact libraries that ship with Scratchy. Use when writing authentication, authorisation, input validation, database queries, session handling, HTTP headers, CORS, rate limiting, error handling, or any security-sensitive code. Trigger terms: OWASP, security, vulnerability, injection, XSS, CSRF, access control, auth, rate limit, secret, sensitive data, logging, SSRF."
metadata:
  tags: owasp, security, authentication, authorisation, injection, xss, csrf, rate-limit, headers
applyTo: "**/*.ts,**/*.tsx"
---

# OWASP Top 10 — Scratchy Secure-Coding Reference

This document maps every **OWASP Top 10 (2021)** risk to the specific
libraries, packages, and patterns used in Scratchy. Every code example
uses the real packages from this repository — no generic pseudocode.

> **Companion reading:** [docs/security.md](../../docs/security.md) — the
> production security reference. This file is the AI-focused cheat-sheet
> version.

---

## A01 — Broken Access Control

Access control failures are the **#1 risk** in the OWASP Top 10. They occur
when users can act outside their intended permissions.

### tRPC — protect every state-changing procedure

```typescript
// routers/posts/mutations.ts
import { protectedProcedure } from "../../router.js";
import { isOwnerOrAdmin } from "@scratchyjs/trpc";
import { post } from "../../db/schema/post.js";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const postMutations = {
  // ✅ protectedProcedure — rejects unauthenticated requests
  // ✅ ownership check — user can only delete their own posts (or admin)
  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx.request.server;

      const [existing] = await db
        .select()
        .from(post)
        .where(eq(post.id, input.id));

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      // Reject if the caller is neither the owner nor an admin
      if (existing.authorId !== ctx.user.id && !ctx.hasRole("admin")) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await db.delete(post).where(eq(post.id, input.id));
      return { success: true };
    }),
};
```

### Fastify REST routes — use `requireAuth` / `requireAdmin`

```typescript
// routes/users/index.ts
import { requireAuth, requireAdmin } from "@scratchyjs/auth/hooks";
import type { FastifyPluginAsync } from "fastify";

const routes: FastifyPluginAsync = async function (fastify) {
  // ✅ Only authenticated users can reach GET /users/me
  fastify.get("/me", { preHandler: requireAuth }, (request) => {
    return request.user;
  });

  // ✅ Only admins can delete any user
  fastify.delete("/:id", { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    // ...
  });
};
```

### Available tRPC middleware

Import from `@scratchyjs/trpc`:

| Export             | Rejects                          | Passes when                    |
| ------------------ | -------------------------------- | ------------------------------ |
| `isAuthenticated`  | unauthenticated                  | any logged-in user             |
| `isAdmin`          | unauthenticated, non-admin       | `role === "admin"`             |
| `isOwner`          | unauthenticated, wrong user      | `ctx.user.id === input.id`     |
| `isOwnerOrAdmin`   | unauthenticated, neither         | owner **or** admin             |
| `protectedProcedure`| unauthenticated                 | any logged-in user             |

### Anti-patterns

```typescript
// ❌ BAD — publicProcedure allows anyone to delete any post
export const deletePost = publicProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    await ctx.request.server.db.delete(post).where(eq(post.id, input.id));
  });

// ❌ BAD — authorId accepted from untrusted input with no ownership check
export const createPost = publicProcedure
  .input(z.object({ title: z.string(), authorId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // Anyone can create a post as any user
  });
```

---

## A02 — Cryptographic Failures

Failures occur when sensitive data (passwords, tokens, PII) is exposed or
transmitted without adequate protection.

### Session secrets — use `BETTER_AUTH_SECRET`

Better Auth signs session tokens with the secret from your config. Keep it
out of source code:

```typescript
// src/auth.ts
import { createAuth } from "@scratchyjs/auth";

export function createAppAuth(config: AppConfig, db: NodePgDatabase) {
  return createAuth({
    // ✅ Secret comes from environment — never hardcoded
    secret: config.BETTER_AUTH_SECRET,
    // ✅ Restrict to known origins
    trustedOrigins: config.ORIGIN ? [config.ORIGIN] : [],
  });
}
```

```typescript
// src/config.ts
import { z } from "zod";

export const configSchema = z.object({
  // ✅ Minimum 32 characters enforced at startup
  BETTER_AUTH_SECRET: z.string().min(32),
  NODE_ENV: z.enum(["development", "test", "production"]),
});
```

### Cookie security — `httpOnly`, `secure`, `sameSite`

Better Auth handles cookie security automatically when configured correctly.
For custom cookies, always set:

```typescript
// ✅ Secure cookie settings
reply.setCookie("session_id", value, {
  httpOnly: true,                                     // No JS access
  secure: config.NODE_ENV === "production",           // HTTPS-only in prod
  sameSite: "lax",                                    // CSRF mitigation
  path: "/",
  maxAge: 60 * 60 * 24 * 7,                          // 7 days
  signed: true,                                       // HMAC integrity
});
```

### Constant-time comparison for tokens

```typescript
import { timingSafeEqual } from "node:crypto";

// ✅ Timing-safe comparison — prevents timing-based attacks
function verifyToken(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// ❌ BAD — vulnerable to timing attacks
if (token === expectedToken) { /* ... */ }
```

### Anti-patterns

```typescript
// ❌ BAD — hardcoded secret
const auth = createAuth({ secret: "my-secret" });

// ❌ BAD — sensitive data stored in JWT claims (JWTs are not encrypted)
const token = signToken({ sub: user.id, creditCard: user.card });

// ❌ BAD — insecure cookie (accessible via JavaScript, sent over HTTP)
reply.setCookie("session", value);
```

---

## A03 — Injection

SQL injection, command injection, and template injection occur when untrusted
data is used directly in queries or commands.

### SQL Injection — always use Drizzle ORM

Drizzle uses **parameterized queries** by default. All values are escaped
automatically:

```typescript
// ✅ SAFE — parameterized, user input cannot break the query
import { eq } from "drizzle-orm";
import { user } from "../db/schema/user.js";

const [found] = await db
  .select()
  .from(user)
  .where(eq(user.email, userInput)); // userInput is a bound parameter
```

```typescript
// ✅ SAFE — prepared statement (module-scoped, compiled once)
import { sql } from "drizzle-orm";

export const findUserByEmail = db
  .select()
  .from(user)
  .where(eq(user.email, sql.placeholder("email")))
  .prepare("find_user_by_email");

// Usage
const result = await findUserByEmail.execute({ email: input.email });
```

```typescript
// ❌ EXTREMELY DANGEROUS — never use sql.raw() with user input
import { sql } from "drizzle-orm";

// This allows SQL injection
const result = await db.execute(
  sql.raw(`SELECT * FROM users WHERE email = '${userInput}'`),
);
```

### Template injection — safe Handlebars use in CLI

The CLI uses Handlebars for code generation. Template context comes from
validated inputs only (column names pass `SAFE_IDENTIFIER` regex validation):

```typescript
// packages/cli/src/utils/names.ts
// ✅ SAFE_IDENTIFIER prevents shell metacharacters and SQL keywords
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
if (!SAFE_IDENTIFIER.test(name)) {
  throw new Error(`Invalid identifier: "${name}"`);
}
```

---

## A04 — Insecure Design

Insecure design covers missing or ineffective security controls at the
architectural level. In Scratchy, the defense-in-depth plugin order
enforces secure design. The core external plugins live in
`packages/core/src/plugins/external/` and are registered in alphabetical
order via `@fastify/autoload`:

```
packages/core/src/plugins/external/
├── cors.ts         # CORS — restrict origin allowlist in production
├── helmet.ts       # Security headers
├── rate-limit.ts   # Rate limiting
└── sensible.ts     # HTTP utilities (@fastify/sensible)
```

> **Load order note:** `@fastify/autoload` processes files alphabetically, so
> `cors.ts` is registered before `helmet.ts`. If your application requires a
> strict loading sequence (e.g. to ensure helmet headers apply to all
> responses including CORS preflight errors), use numeric prefixes in your own
> application plugins directory: `01-helmet.ts`, `02-rate-limit.ts`, etc.

### Rate limiting — protect all routes, stricter on auth endpoints

```typescript
// plugins/external/rate-limit.ts
import fastifyRateLimit from "@fastify/rate-limit";
import fp from "fastify-plugin";

export const autoConfig = {
  max: 1000,
  timeWindow: "1 minute",
  skipOnError: false,
};

export default fastifyRateLimit;
```

```typescript
// Apply a tighter limit to login routes
fastify.post("/api/auth/sign-in/email", {
  config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
}, handler);
```

### Input validation with Zod — validate all inputs at the boundary

```typescript
// ✅ Validate every tRPC input
import { z } from "zod";
import { publicProcedure } from "../../router.js";

export const createPost = publicProcedure
  .input(
    z.object({
      title: z.string().min(1).max(200),   // length limits
      content: z.string().min(10),          // minimum content length
    }),
  )
  .mutation(async ({ ctx, input }) => {
    // input is fully validated before reaching this handler
  });
```

---

## A05 — Security Misconfiguration

Misconfiguration includes unnecessary features enabled, default credentials,
overly permissive CORS, missing security headers, or verbose error messages.

### Security headers — always register `@fastify/helmet` first

Scratchy ships with a baseline helmet configuration. `contentSecurityPolicy`
is disabled by default because CSP directives are highly app-specific; enable
and configure it per-application:

```typescript
// packages/core/src/plugins/external/helmet.ts (actual Scratchy config)
import fastifyHelmet, { type FastifyHelmetOptions } from "@fastify/helmet";

export const autoConfig: FastifyHelmetOptions = {
  hidePoweredBy: true,
  contentSecurityPolicy: false,    // ⚠️ disabled by default — enable per-app (see below)
  xContentTypeOptions: true,
  xFrameOptions: { action: "deny" },      // Prevents clickjacking
  hsts: { maxAge: 31536000, includeSubDomains: true },
  referrerPolicy: { policy: "no-referrer" },
  xPermittedCrossDomainPolicies: { permittedPolicies: "none" },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
};

export default fastifyHelmet;
```

**Recommended production hardening** — enable CSP with a strict policy.
Override `autoConfig` in your application's plugin or pass options directly:

```typescript
// ✅ Hardened helmet config for production — add nonce support when inline
// scripts are needed instead of using 'unsafe-inline'.
fastify.register(fastifyHelmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],       // ✅ No 'unsafe-inline' for scripts
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
    },
  },
});
```

### CORS — restrict to known origins; never `origin: true` in production

Scratchy's CORS plugin (`packages/core/src/plugins/external/cors.ts`) uses
`process.env.NODE_ENV` at module load time to set the `origin` behaviour:

- **Development / test** → `origin: true` (all origins allowed).
- **Production with `ALLOWED_ORIGINS`** → explicit allowlist callback.
- **Production without `ALLOWED_ORIGINS`** → `origin: false` (deny all
  cross-origin requests — a safe fail-closed default).

Set `ALLOWED_ORIGINS` to a comma-separated list of permitted origins:

```bash
# .env.production
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
```

A startup warning is logged when `NODE_ENV=production` and `ALLOWED_ORIGINS`
is unset so the misconfiguration is visible immediately.

**Why `origin: true` + `credentials: true` is dangerous (CVE-2024-8024 pattern):**
When both are set the server reflects *any* `Origin` header back as
`Access-Control-Allow-Origin` while also sending `Access-Control-Allow-Credentials: true`.
This allows any malicious site to make credentialed cross-origin requests
(e.g. authenticated `fetch()` calls) and read the response.

```typescript
// ❌ NEVER do this in production
export const autoConfig: FastifyCorsOptions = {
  credentials: true,
  origin: true, // Echoes back any origin — credential exfiltration vector
};

// ✅ The Scratchy default now handles this automatically:
//    NODE_ENV=production + ALLOWED_ORIGINS unset → origin: false (deny all)
//    NODE_ENV=production + ALLOWED_ORIGINS set   → explicit allowlist callback
//    NODE_ENV=development                        → origin: true (dev convenience)
```

### Strip internal-routing and framework headers

The `strip-internal-headers` plugin (auto-loaded from
`packages/core/src/plugins/external/strip-internal-headers.ts`) removes
generic internal-routing **request** headers and the Fastify `server`
**response** header.

**Why this matters:** If any application code trusts `x-internal-request`
or `x-internal-token` to identify an internal caller (e.g. to skip auth),
an attacker can forge those headers. Stripping them before any hook runs
ensures they can never be trusted. The `server` response header is stripped
to hide implementation details from potential attackers.

```typescript
// ✅ Already handled by @scratchyjs/core — do NOT remove the plugin
// Request headers stripped in onRequest hook:
//   x-internal-request   (generic internal-caller marker)
//   x-internal-token     (forged token injection vector)
//
// Response headers stripped in onSend hook:
//   server               (hides "Fastify" from clients)

// ❌ NEVER trust these headers for auth decisions
fastify.addHook("onRequest", async (request) => {
  if (request.headers["x-internal-request"] === "true") {
    request.user = { id: "service-account", role: "admin" }; // NEVER DO THIS
  }
});
```

### Error messages — never leak internal details in production

```typescript
// src/error-handler.ts — already provided by @scratchyjs/core
// ✅ Generic error responses; full details only in server logs
fastify.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "request error");

  if (process.env.NODE_ENV === "production") {
    return reply.status(error.statusCode ?? 500).send({
      error: "Internal Server Error",
      message: "An unexpected error occurred",
    });
  }

  // Development — include stack for debugging
  return reply.status(error.statusCode ?? 500).send({
    error: error.name,
    message: error.message,
    stack: error.stack,
  });
});
```

---

## A06 — Vulnerable and Outdated Components

### Known CVEs addressed in this stack

The following CVEs have been researched and mitigated within Scratchy:

| CVE | Component | Description | Mitigation |
| --- | --------- | ----------- | ---------- |
| CVE-2025-32442 | Fastify ≤ 5.3.1 | Content-Type validation bypass → injection | Keep Fastify ≥ 5.3.2; use single Zod schema per route (not per-content-type) |
| CVE-2025-43855 | `@trpc/server` 11.0–11.1.0 | WebSocket `connectionParams` uncaught exception → DoS | `createContext()` wrapped in try/catch; keep `@trpc/server` ≥ 11.1.1 |
| CVE-2025-29927 | Next.js (pattern) | Internal header bypass of auth middleware | `strip-internal-headers` plugin removes `x-internal-request` and `x-internal-token`; Fastify `server` response header suppressed |
| CVE-2024-8024 | `@fastify/cors` (pattern) | `origin: true` + `credentials: true` → credential exfiltration | CORS plugin auto-uses `origin: false` in production unless `ALLOWED_ORIGINS` is set |
| CVE-2024-22207 | `@fastify/swagger-ui` < 2.1.0 | Serves all module directory files → info disclosure | Keep `@fastify/swagger-ui` ≥ 5.x (already in use) |

### Dependency auditing in CI

```yaml
# .github/workflows/ci.yml
- name: Audit dependencies
  run: pnpm audit
```

Always commit `pnpm-lock.yaml` and run CI with `--frozen-lockfile`:

```bash
pnpm install --frozen-lockfile
```

### Keeping Scratchy packages up to date

```bash
pnpm update --recursive --latest
pnpm audit --fix
```

---

## A07 — Identification and Authentication Failures

Authentication failures include brute-force, weak passwords, missing
session invalidation, and insecure credential storage.

### Authentication with `@scratchyjs/auth`

```typescript
// src/auth.ts
import { createAuth } from "@scratchyjs/auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export function createAppAuth(config: AppConfig, db: NodePgDatabase) {
  return createAuth({
    secret: config.BETTER_AUTH_SECRET,       // ✅ Signed session tokens
    trustedOrigins: config.ORIGIN ? [config.ORIGIN] : [],
    emailAndPassword: {
      enabled: true,
      // Better Auth hashes passwords with Argon2id by default
      // ✅ Minimum password length is enforced by input validation
    },
    database: drizzleAdapter(db, { provider: "pg", schema: { /* ... */ } }),
    advanced: {
      database: { generateId: () => ulid() },
    },
  });
}
```

### Registering `authPlugin` in the correct order

```typescript
// src/server.ts
// ✅ Database plugin MUST be registered before authPlugin
await server.register(drizzlePlugin, { connectionString: config.DATABASE_URL });
await server.register(authPlugin, { auth: createAppAuth(config, server.db) });
```

### Generic error messages for login failures

```typescript
// ❌ BAD — reveals which field was wrong
throw new TRPCError({ code: "UNAUTHORIZED", message: "Email not found" });
throw new TRPCError({ code: "UNAUTHORIZED", message: "Wrong password" });

// ✅ GOOD — generic message, no enumeration hint
throw new TRPCError({
  code: "UNAUTHORIZED",
  message: "Invalid email or password",
});
```

### Rate-limit authentication endpoints

```typescript
// ✅ Apply strict rate limit to sign-in to prevent brute-force
fastify.post("/api/auth/sign-in/email", {
  config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
}, authHandler);
```

---

## A08 — Software and Data Integrity Failures

These failures include using unsigned packages, insecure CI/CD pipelines,
or deserializing untrusted data without validation.

### Validate all deserialized data with Zod

```typescript
// ✅ Never trust external data without validation
import { z } from "zod";

const webhookPayloadSchema = z.object({
  event: z.enum(["user.created", "user.deleted"]),
  userId: z.string().min(1),
  timestamp: z.number().int().positive(),
});

fastify.post("/webhooks/provider", async (request, reply) => {
  const result = webhookPayloadSchema.safeParse(request.body);
  if (!result.success) {
    return reply.status(400).send({ error: "Invalid payload" });
  }
  // result.data is fully typed and validated
});
```

### Shared buffer integrity

The `@scratchyjs/renderer` `SharedBuffer` uses `Atomics` operations and
validates data-length bounds before parsing. It will throw a `SyntaxError`
(and set the buffer status to `ERROR`) if the JSON payload is malformed,
preventing silent data corruption:

```typescript
// ✅ readFromBuffer() already handles this — no extra code needed
import { readFromBuffer } from "@scratchyjs/renderer";

try {
  const data = readFromBuffer<RenderResult>(shared);
} catch (err) {
  // SyntaxError if JSON is malformed, Error on timeout or error state
  request.log.error({ err }, "shared buffer read failed");
}
```

### tRPC context resilience (CVE-2025-43855 pattern)

The tRPC `createContext()` function in `@scratchyjs/trpc` is wrapped in a
`try/catch` so that any exception during context creation (e.g. a malformed
WebSocket `connectionParams` payload) returns an *unauthenticated* context
rather than propagating as an uncaught exception that would crash the server:

```typescript
// packages/trpc/src/context.ts — already implemented this way
export function createContext({ req, res }: CreateFastifyContextOptions): Context {
  try {
    const user = (req as unknown as { user?: User | null }).user ?? null;
    return { request: req, reply: res, user, hasRole: (role) => user?.role === role };
  } catch {
    req.log.warn("tRPC createContext failed — returning unauthenticated context");
    return { request: req, reply: res, user: null, hasRole: () => false };
  }
}
```

Do **not** remove this try/catch — it is a direct mitigation for the class
of DoS vulnerabilities described by CVE-2025-43855 (tRPC WebSocket uncaught
exception crash).

### Cache-Control for SSR responses (Remix CVE-2025-43864 pattern)

Cache poisoning attacks work by getting a CDN/edge cache to store a response
that contains attacker-controlled content. Subsequent visitors receive the
poisoned cached response, resulting in persistent XSS.

Always set `Cache-Control: private, no-store` and `Vary: Cookie` on
authenticated / personalised SSR responses:

```typescript
// ✅ In tRPC plugin — already set by @scratchyjs/trpc
responseMeta: () => ({
  headers: { "cache-control": "no-store, no-cache, must-revalidate, private" },
}),

// ✅ For SSR route handlers and Qwik routeLoader$ responses
fastify.addHook("onSend", (request, reply, _payload, done) => {
  // Never let authenticated pages be cached by CDNs
  if (request.user) {
    reply.header("Cache-Control", "private, no-store");
    reply.header("Vary", "Cookie, Authorization");
  }
  done();
});
```

```typescript
// ✅ In Qwik routeLoader$ — set response headers explicitly
export const useProtectedData = routeLoader$(async (event) => {
  event.headers.set("Cache-Control", "private, no-store");
  event.headers.set("Vary", "Cookie");
  // ...
});
```

---

## A09 — Security Logging and Monitoring Failures

Security events must be logged with enough context to detect and respond to
attacks. Use `request.log` (not `console.log`) inside route handlers.

### Structured logging with Pino (via Fastify)

```typescript
// ✅ Inside route handlers — use request.log (includes request context)
fastify.get("/users/:id", async (request) => {
  request.log.info({ userId: request.params.id }, "fetching user");
});

// ✅ Log security events explicitly
fastify.post("/api/auth/sign-in/email", async (request) => {
  try {
    // ...
  } catch (err) {
    request.log.warn(
      { email: request.body.email, ip: request.ip },
      "failed login attempt",
    );
    throw err;
  }
});

// ✅ Inside plugins — use fastify.log
export default fp(async function myPlugin(fastify) {
  fastify.log.info("plugin initialized");
});
```

### Log auth plugin session errors

The `@scratchyjs/auth` plugin already logs session resolution failures at
`warn` level:

```typescript
// packages/auth/src/plugin.ts (already implemented)
try {
  const session = await authInstance.api.getSession({ /* ... */ });
  request.session = session;
  request.user = session?.user ?? null;
} catch (error) {
  // ✅ Warns — does not crash the request
  request.log.warn({ err: error }, "failed to resolve auth session");
  request.session = null;
  request.user = null;
}
```

### What to log at each severity level

| Level   | When to use                                                          |
| ------- | -------------------------------------------------------------------- |
| `error` | Unrecoverable errors that require operator attention                 |
| `warn`  | Auth failures, rate-limit hits, unexpected-but-handled conditions    |
| `info`  | Normal operation events (server start, request lifecycle milestones) |
| `debug` | Verbose detail only needed during active debugging (off in prod)     |

---

## A10 — Server-Side Request Forgery (SSRF)

SSRF occurs when attacker-controlled URLs are fetched by the server, enabling
access to internal services.

### Validate and allowlist redirect destinations

Use `safeRedirect()` from `@scratchyjs/utils` for **all** user-supplied
redirect paths. It URL-decodes the input first, catching percent-encoded
bypass attempts (`%2e%2e`, `%2F%2F`):

```typescript
import { safeRedirect } from "@scratchyjs/utils";

// ✅ SAFE — safeRedirect blocks external URLs and path traversal
fastify.get("/login", (request, reply) => {
  const redirectTo = (request.query as { redirectTo?: string }).redirectTo;
  reply.redirect(safeRedirect(redirectTo, "/dashboard"));
});

// Examples of what safeRedirect blocks:
// safeRedirect("https://evil.com")    → "/"
// safeRedirect("//evil.com")          → "/"
// safeRedirect("/../../etc/passwd")   → "/"
// safeRedirect("%2e%2e/etc/passwd")   → "/"   (percent-encoded bypass)
// safeRedirect("%2F%2Fevil.com")      → "/"   (percent-encoded //)
```

### Validate fetch targets when making server-side HTTP requests

```typescript
import { URL } from "node:url";

const ALLOWED_HOSTS = new Set(["api.trusted-provider.com"]);

function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  const parsed = new URL(url);               // Throws for invalid URLs
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`Disallowed fetch target: ${parsed.hostname}`);
  }
  return fetch(url, options);
}
```

---

## Quick Reference Checklist

### Every new route

- [ ] Uses `protectedProcedure` (tRPC) or `requireAuth` hook (REST) if it
  handles user-specific data
- [ ] Checks resource ownership or admin role before mutating data
- [ ] Validates all inputs with a Zod schema
- [ ] Returns generic error messages (no internal details)
- [ ] Authenticated SSR responses set `Cache-Control: private, no-store` and `Vary: Cookie`

### Every new mutation / state-changing endpoint

- [ ] Caller is authenticated
- [ ] Caller is authorized to act on the target resource
- [ ] No user-supplied ID is trusted without a database lookup
- [ ] Drizzle ORM (not `sql.raw()`) is used for all queries

### Every new plugin or service

- [ ] Secrets come from config / environment, not source code
- [ ] Session cookies are `httpOnly`, `secure` (prod), `sameSite: "lax"`
- [ ] `@fastify/helmet` is registered before the new plugin
- [ ] Rate limiting is applied where appropriate
- [ ] Does not trust `x-internal-request`, `x-internal-token`, or other internal-routing headers

### Every redirect

- [ ] Uses `safeRedirect()` from `@scratchyjs/utils`

### Every production deployment

- [ ] `ALLOWED_ORIGINS` is set to an explicit allowlist (not left empty)
- [ ] `NODE_ENV=production` is set
- [ ] No `sql.raw()` calls with user-supplied input (grep the codebase)

---

## Reference Links

- [OWASP Top 10 (2021)](https://owasp.org/Top10/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [Better Auth Security](https://www.better-auth.com/docs/concepts/session-management)
- [Fastify Security](https://fastify.dev/docs/latest/Guides/Security/)
- [Node.js Security Best Practices](https://nodejs.org/en/learn/getting-started/security-best-practices)
- [@fastify/helmet](https://github.com/fastify/fastify-helmet)
- [@fastify/rate-limit](https://github.com/fastify/fastify-rate-limit)
- [@fastify/cors](https://github.com/fastify/fastify-cors)
- [Drizzle ORM — SQL injection prevention](https://orm.drizzle.team/docs/overview)
- [CVE-2025-29927 — Next.js middleware bypass](https://github.com/advisories/GHSA-f82v-jwr5-mffw)
- [CVE-2025-43855 — tRPC WebSocket DoS](https://github.com/advisories/GHSA-9m93-w8w6-76hh)
- [docs/security.md](../../docs/security.md) — Scratchy production security reference
