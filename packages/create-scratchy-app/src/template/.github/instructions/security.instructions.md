---
name: scratchy-security
description:
  "Maps the OWASP Top 10 (2021) web application security risks to safe-coding
  patterns for Scratchy applications. Use when writing authentication,
  authorization, input validation, database queries, session handling, HTTP
  headers, CORS, rate limiting, error handling, or any security-sensitive code."
---

# OWASP Top 10 — Scratchy Security Reference

## A01 — Broken Access Control

### Protect every state-changing procedure

```typescript
// ✅ Use protectedProcedure — rejects unauthenticated requests
import { protectedProcedure } from "~/router.js";

export const deletePost = protectedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .mutation(async ({ ctx, input }) => {
    const { db } = ctx.request.server;

    const [existing] = await db.select().from(post).where(eq(post.id, input.id));
    if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

    // ✅ Ownership check — user can only delete their own posts (or admin)
    if (existing.authorId !== ctx.user.id && !ctx.hasRole("admin")) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    await db.delete(post).where(eq(post.id, input.id));
    return { success: true };
  });

// ❌ BAD — publicProcedure allows anyone to delete any post
export const deletePost = publicProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    await ctx.request.server.db.delete(post).where(eq(post.id, input.id));
  });
```

### Fastify REST routes — use requireAuth / requireAdmin

```typescript
import { requireAdmin, requireAuth } from "@scratchyjs/auth/hooks";

fastify.get("/me", { preHandler: requireAuth }, (request) => request.user);
fastify.delete("/users/:id", { preHandler: requireAdmin }, async (request) => {
  // Only admins reach this handler
});
```

### Available tRPC middleware

| Middleware           | Rejects                     | Passes when                |
| -------------------- | --------------------------- | -------------------------- |
| `isAuthenticated`    | unauthenticated             | any logged-in user         |
| `isAdmin`            | unauthenticated, non-admin  | `role === "admin"`         |
| `isOwner`            | unauthenticated, wrong user | `ctx.user.id === input.id` |
| `isOwnerOrAdmin`     | unauthenticated, neither    | owner **or** admin         |
| `protectedProcedure` | unauthenticated             | any logged-in user         |

---

## A02 — Cryptographic Failures

### Session secrets — never hardcode

```typescript
// ✅ Secret from environment variable
const auth = createAuth({ secret: config.BETTER_AUTH_SECRET });

// ❌ NEVER hardcode secrets
const auth = createAuth({ secret: "my-secret" });
```

### Secure cookie settings

```typescript
reply.setCookie("session_id", value, {
  httpOnly: true, // No JS access
  secure: config.NODE_ENV === "production", // HTTPS-only in prod
  sameSite: "lax", // CSRF mitigation
  path: "/",
  maxAge: 60 * 60 * 24 * 7, // 7 days
  signed: true, // HMAC integrity
});
```

### Constant-time comparison for tokens

```typescript
import { timingSafeEqual } from "node:crypto";

function verifyToken(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// ❌ BAD — vulnerable to timing attacks
if (token === expectedToken) {
  /* ... */
}
```

---

## A03 — Injection

### SQL Injection — always use Drizzle ORM (parameterized queries)

```typescript
// ✅ SAFE — parameterized, user input is a bound parameter
const [found] = await db.select().from(user).where(eq(user.email, userInput));

// ✅ SAFE — prepared statement
export const findUserByEmail = db
  .select()
  .from(user)
  .where(eq(user.email, sql.placeholder("email")))
  .prepare("find_user_by_email");

// ❌ EXTREMELY DANGEROUS — never use sql.raw() with user input
const result = await db.execute(
  sql.raw(`SELECT * FROM users WHERE email = '${userInput}'`),
);
```

### Input validation with Zod — validate everything at the boundary

```typescript
export const createPost = protectedProcedure
  .input(
    z.object({
      title: z.string().min(1).max(200), // length limits
      content: z.string().min(10), // minimum content
    }),
  )
  .mutation(async ({ ctx, input }) => {
    // input is fully validated before reaching this handler
  });
```

---

## A04 — Insecure Design

### Defense-in-depth plugin order

```typescript
// 1. Security headers (Helmet)
await server.register(import("@fastify/helmet"), {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
    },
  },
});

// 2. Rate limiting
await server.register(import("@fastify/rate-limit"), {
  max: 1000,
  timeWindow: "1 minute",
});

// 3. CORS (restrict origins in production)
await server.register(import("@fastify/cors"), {
  origin: config.NODE_ENV === "production" ? config.ALLOWED_ORIGINS : true,
  credentials: true,
});
```

### Rate-limit authentication endpoints

```typescript
fastify.post(
  "/api/auth/sign-in/email",
  {
    config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
  },
  authHandler,
);
```

---

## A05 — Security Misconfiguration

### CORS — never `origin: true` with `credentials: true` in production

```typescript
// ❌ DANGEROUS — reflects any origin → credential exfiltration
{ origin: true, credentials: true }

// ✅ Explicit allowlist in production
{
  origin: config.NODE_ENV === "production"
    ? config.ALLOWED_ORIGINS   // ["https://app.example.com"]
    : true,
  credentials: true,
}
```

### Error messages — never leak internal details in production

```typescript
fastify.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "request error");

  if (config.NODE_ENV === "production") {
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

### Generic error messages for login failures

```typescript
// ❌ Reveals which field was wrong (user enumeration)
throw new TRPCError({ code: "UNAUTHORIZED", message: "Email not found" });
throw new TRPCError({ code: "UNAUTHORIZED", message: "Wrong password" });

// ✅ Generic message — no enumeration hint
throw new TRPCError({
  code: "UNAUTHORIZED",
  message: "Invalid email or password",
});
```

---

## A06 — Vulnerable and Outdated Components

### Keep dependencies updated

```bash
pnpm audit                    # Check for known vulnerabilities
pnpm update --recursive       # Update all workspace packages
pnpm install --frozen-lockfile # Always use in CI (deterministic builds)
```

---

## A07 — Identification and Authentication Failures

### Better Auth handles password hashing (Argon2id by default)

```typescript
// ✅ Better Auth handles hashing — no manual bcrypt/argon2 needed
const auth = createAuth({
  emailAndPassword: { enabled: true },
  // Passwords are hashed with Argon2id automatically
});
```

### Minimum password length via input validation

```typescript
const signUpSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(12), // ✅ Enforce minimum length
});
```

---

## A08 — Software and Data Integrity Failures

### Validate all deserialized data with Zod

```typescript
const webhookSchema = z.object({
  event: z.enum(["user.created", "user.deleted"]),
  userId: z.string().min(1),
  timestamp: z.number().int().positive(),
});

fastify.post("/webhooks/provider", async (request, reply) => {
  const result = webhookSchema.safeParse(request.body);
  if (!result.success) {
    return reply.status(400).send({ error: "Invalid payload" });
  }
  // result.data is fully typed and validated
});
```

### Cache-Control for authenticated responses

```typescript
// ✅ Prevent cache poisoning — never cache personalized content
fastify.addHook("onSend", (request, reply, _payload, done) => {
  if (request.user) {
    reply.header("Cache-Control", "private, no-store");
    reply.header("Vary", "Cookie, Authorization");
  }
  done();
});
```

---

## A09 — Security Logging and Monitoring

### Structured logging with Pino (via Fastify)

```typescript
// ✅ Inside route handlers — use request.log
request.log.info({ userId: request.params.id }, "fetching user");

// ✅ Log security events
request.log.warn(
  { email: request.body.email, ip: request.ip },
  "failed login attempt",
);

// ✅ Inside plugins — use fastify.log
fastify.log.info("plugin initialized");

// ❌ NEVER use console.log for application logging
```

### What to log

| Level   | When                                                         |
| ------- | ------------------------------------------------------------ |
| `error` | Unrecoverable errors that need operator attention            |
| `warn`  | Auth failures, rate-limit hits, handled-but-unexpected cases |
| `info`  | Normal operation (server start, request lifecycle)           |
| `debug` | Verbose detail for active debugging (off in production)      |

---

## A10 — Server-Side Request Forgery (SSRF)

### Validate redirect destinations

```typescript
import { safeRedirect } from "@scratchyjs/utils";

// ✅ Blocks external URLs and path traversal
fastify.get("/login", (request, reply) => {
  const redirectTo = (request.query as { redirectTo?: string }).redirectTo;
  reply.redirect(safeRedirect(redirectTo, "/dashboard"));
});

// safeRedirect blocks:
//   "https://evil.com"      → "/"
//   "//evil.com"            → "/"
//   "/../../etc/passwd"     → "/"
//   "%2e%2e/etc/passwd"     → "/"  (percent-encoded bypass)
```

### Validate fetch targets

```typescript
const ALLOWED_HOSTS = new Set(["api.trusted-provider.com"]);

function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  const parsed = new URL(url);
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`Disallowed fetch target: ${parsed.hostname}`);
  }
  return fetch(url, options);
}
```

---

## Security Checklist

### Every new route

- [ ] Uses `protectedProcedure` (tRPC) or `requireAuth` (REST) for user data
- [ ] Checks resource ownership or admin role before mutating data
- [ ] Validates all inputs with a Zod schema
- [ ] Returns generic error messages (no internal details)
- [ ] Authenticated responses set `Cache-Control: private, no-store`

### Every new mutation

- [ ] Caller is authenticated
- [ ] Caller is authorized for the target resource
- [ ] No user-supplied ID is trusted without a database lookup
- [ ] Drizzle ORM (not `sql.raw()`) is used for all queries

### Every new plugin

- [ ] Secrets from config/environment, not source code
- [ ] Cookies are `httpOnly`, `secure` (prod), `sameSite: "lax"`
- [ ] Rate limiting applied where appropriate

### Every redirect

- [ ] Uses `safeRedirect()` from `@scratchyjs/utils`

### Production deployment

- [ ] `ALLOWED_ORIGINS` is set to an explicit allowlist
- [ ] `NODE_ENV=production` is set
- [ ] `BETTER_AUTH_SECRET` is a cryptographically random string (>=32 chars)
- [ ] No `sql.raw()` calls with user-supplied input
