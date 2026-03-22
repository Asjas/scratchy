# Security

> **Diátaxis type: [Reference](https://diataxis.fr/reference/)** —
> information-oriented, the single source of truth for all security concerns in
> a Scratchy application.

Scratchy takes a **defense-in-depth** approach to security. Every layer — from
HTTP headers to database queries — enforces its own protections so that no
single misconfiguration leads to a breach. This document is the single reference
for all security concerns in a Scratchy application.

> **Cross-references:** This guide builds on patterns documented in
> [sessions.md](sessions.md), [middleware.md](middleware.md),
> [api-design.md](api-design.md), and [error-handling.md](error-handling.md).
> Where those documents cover a topic in depth, this guide summarizes the
> security implications and links back.

## Security Architecture Overview

```
                        ┌─────────────────────────────┐
                        │        Edge / CDN            │
                        │  (TLS termination, WAF)      │
                        └──────────┬──────────────────┘
                                   │
                        ┌──────────▼──────────────────┐
                        │     Fastify HTTP Server      │
                        │                              │
                        │  ┌────────────────────────┐  │
                        │  │  1. Security Headers    │  │
                        │  │     (@fastify/helmet)   │  │
                        │  ├────────────────────────┤  │
                        │  │  2. Rate Limiting       │  │
                        │  │     (@fastify/rate-limit)│  │
                        │  ├────────────────────────┤  │
                        │  │  3. CORS                │  │
                        │  │     (@fastify/cors)     │  │
                        │  ├────────────────────────┤  │
                        │  │  4. CSRF Protection     │  │
                        │  │     (double-submit)     │  │
                        │  ├────────────────────────┤  │
                        │  │  5. Authentication      │  │
                        │  │     (session / JWT)     │  │
                        │  ├────────────────────────┤  │
                        │  │  6. Authorization       │  │
                        │  │     (RBAC / ownership)  │  │
                        │  ├────────────────────────┤  │
                        │  │  7. Input Validation    │  │
                        │  │     (Zod schemas)       │  │
                        │  ├────────────────────────┤  │
                        │  │  8. Business Logic      │  │
                        │  │     (tRPC / routes)     │  │
                        │  ├────────────────────────┤  │
                        │  │  9. Data Layer          │  │
                        │  │     (Drizzle ORM)       │  │
                        │  └────────────────────────┘  │
                        └──────────────────────────────┘
```

Each numbered layer **must pass** before the request reaches the next. Plugins
are loaded in filename order using `@fastify/autoload` — prefix filenames with
numbers to guarantee the correct registration sequence:

```
plugins/external/
├── 01-helmet.ts         # Security headers first
├── 02-rate-limit.ts     # Rate limiting second
├── 03-cors.ts           # CORS third
├── 04-csrf.ts           # CSRF fourth
└── 05-auth.ts           # Authentication last
```

See [middleware.md](middleware.md) for the full middleware architecture and
ordering rules.

---

## Authentication

Scratchy supports three authentication strategies depending on the consumer:

| Strategy      | Use Case               | Transport              |
| ------------- | ---------------------- | ---------------------- |
| Session-based | Browser clients (tRPC) | Signed cookie          |
| JWT (Bearer)  | External API consumers | `Authorization` header |
| OAuth2 / OIDC | Social login, SSO      | Redirect flow          |

### Session-Based Authentication

Sessions are the **primary authentication mechanism** for browser-facing routes.
See [sessions.md](sessions.md) for the full implementation — cookie signing,
storage backends, and lifecycle management.

**Security essentials:**

```typescript
// plugins/app/session.ts
import fp from "fastify-plugin";
import { timingSafeEqual } from "node:crypto";

export default fp(async function sessionPlugin(fastify) {
  // Cookie configuration — always sign, always httpOnly
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    signed: true,
  };

  fastify.decorateRequest("user", null);

  // Authenticate on every request
  fastify.addHook("onRequest", async (request, reply) => {
    const sessionId = request.cookies["session_id"];
    if (!sessionId) return;

    const session = await fastify.sessionStore.get(sessionId);
    if (!session) return;

    // Validate session expiry
    if (session.expiresAt < Date.now()) {
      await fastify.sessionStore.destroy(sessionId);
      reply.clearCookie("session_id");
      return;
    }

    request.user = session.user;
  });
});
```

**Session regeneration on login** prevents session fixation attacks:

```typescript
// routers/auth/mutations.ts
import { TRPCError } from "@trpc/server";
import { ulid } from "ulid";
import { z } from "zod";
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
        // Use a generic message — never reveal which field was wrong
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }

      // Destroy old session before creating a new one
      const oldSessionId = ctx.request.cookies["session_id"];
      if (oldSessionId) {
        await ctx.request.server.sessionStore.destroy(oldSessionId);
      }

      // Create a new session with a fresh ID
      const newSessionId = ulid();
      await ctx.request.server.sessionStore.set(newSessionId, {
        userId: user.id,
        role: user.role,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });

      ctx.reply.setCookie("session_id", newSessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
        signed: true,
      });

      return { userId: user.id };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    const sessionId = ctx.request.cookies["session_id"];
    if (sessionId) {
      // Destroy the session — don't just unset the cookie
      await ctx.request.server.sessionStore.destroy(sessionId);
    }
    ctx.reply.clearCookie("session_id", { path: "/" });
    return { success: true };
  }),
};
```

### JWT Validation for External APIs

JWTs are used **only for external API authentication** — never for browser
sessions. See [api-design.md](api-design.md) for the REST route patterns.

```typescript
// lib/jwt.ts
import { createSigner, createVerifier } from "fast-jwt";

const SECRET = getEnvVar("JWT_SECRET");

const verify = createVerifier({
  key: SECRET,
  algorithms: ["HS256"],
  maxAge: "1h",
  clockTolerance: 30, // 30s clock skew tolerance
});

const sign = createSigner({
  key: SECRET,
  algorithm: "HS256",
  expiresIn: "1h",
});

interface TokenPayload {
  sub: string;
  role: string;
  iat: number;
  exp: number;
}

export function verifyToken(token: string): TokenPayload {
  return verify(token) as TokenPayload;
}

export function signToken(payload: Omit<TokenPayload, "iat" | "exp">): string {
  return sign(payload);
}
```

```typescript
// hooks/external-auth.ts
import fp from "fastify-plugin";
import { verifyToken } from "~/lib/jwt.js";

export default fp(async function externalAuth(fastify) {
  fastify.decorate("verifyBearerToken", async (request: FastifyRequest) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw fastify.httpErrors.unauthorized("Missing Bearer token");
    }

    const token = authHeader.slice(7);
    try {
      request.user = verifyToken(token);
    } catch {
      throw fastify.httpErrors.unauthorized("Invalid or expired token");
    }
  });
});
```

### OAuth2 / OIDC Integration

Scratchy supports OAuth2 and OpenID Connect via redirect-based flows. Use
`@fastify/oauth2` for the transport layer and store the resulting user identity
in a session.

```typescript
// plugins/external/oauth2.ts
import oauthPlugin from "@fastify/oauth2";
import fp from "fastify-plugin";

export default fp(async function oauth2(fastify) {
  await fastify.register(oauthPlugin, {
    name: "googleOAuth2",
    credentials: {
      client: {
        id: getEnvVar("GOOGLE_CLIENT_ID"),
        secret: getEnvVar("GOOGLE_CLIENT_SECRET"),
      },
    },
    startRedirectPath: "/auth/google",
    callbackUri: `${getEnvVar("BASE_URL")}/auth/google/callback`,
    scope: ["openid", "email", "profile"],
    discovery: {
      issuer: "https://accounts.google.com",
    },
    pkce: "S256", // Always use PKCE
  });
});
```

```typescript
// routes/auth/google/callback/index.ts
import type { FastifyPluginAsync } from "fastify";
import { ulid } from "ulid";

const routes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/", async (request, reply) => {
    const { token } =
      await fastify.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(
        request,
      );

    // Fetch user profile from the provider
    const profile = await fetchGoogleProfile(token.access_token);

    // Upsert the user in the database
    const user = await upsertOAuthUser({
      provider: "google",
      providerId: profile.sub,
      email: profile.email,
      name: profile.name,
      image: profile.picture,
    });

    // Create a session — same flow as login
    const sessionId = ulid();
    await fastify.sessionStore.set(sessionId, {
      userId: user.id,
      role: user.role,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    reply.setCookie("session_id", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      signed: true,
    });

    return reply.redirect("/dashboard");
  });
};

export default routes;
```

### Better Auth Integration

[Better Auth](https://www.better-auth.com/) can serve as a drop-in
authentication library when you need a batteries-included solution (email/
password, OAuth, magic links, two-factor) without building every flow manually.

```typescript
// lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "~/db/index.js";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Refresh every day
  },
  advanced: {
    generateId: () => ulid(),
  },
});
```

```typescript
// plugins/app/better-auth.ts
import { toNodeHandler } from "better-auth/node";
import fp from "fastify-plugin";
import { auth } from "~/lib/auth.js";

export default fp(async function betterAuthPlugin(fastify) {
  const handler = toNodeHandler(auth);

  // Mount Better Auth on /api/auth/*
  fastify.all("/api/auth/*", async (request, reply) => {
    await handler(request.raw, reply.raw);
  });
});
```

---

## Authorization

Authentication verifies **who you are**. Authorization decides **what you can
do**. Scratchy enforces authorization at multiple layers.

### Role-Based Access Control (RBAC)

Define roles as a const object (no enums — see TypeScript conventions):

```typescript
// lib/roles.ts
const UserRole = {
  MEMBER: "member",
  MODERATOR: "moderator",
  ADMIN: "admin",
} as const;

type UserRole = (typeof UserRole)[keyof typeof UserRole];

// Permission mapping
const PERMISSIONS = {
  "posts:create": [UserRole.MEMBER, UserRole.MODERATOR, UserRole.ADMIN],
  "posts:delete": [UserRole.MODERATOR, UserRole.ADMIN],
  "users:manage": [UserRole.ADMIN],
  "settings:edit": [UserRole.ADMIN],
} as const;

type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: UserRole, permission: Permission): boolean {
  const allowedRoles: readonly UserRole[] = PERMISSIONS[permission];
  return allowedRoles.includes(role);
}
```

### tRPC Procedure-Level Authorization

Use tRPC middleware to enforce authorization at the procedure level. This
mirrors RedwoodJS SDK's per-route auth interruptors — each procedure declares
its own access requirements.

```typescript
// router.ts
import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "~/context.js";
import { type Permission, hasPermission } from "~/lib/roles.js";

const t = initTRPC.context<Context>().create({ transformer: superjson });

// Base middleware — requires authentication
const isAuthenticated = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  return next({ ctx: { user: ctx.user } });
});

// Permission middleware factory
function requirePermission(permission: Permission) {
  return t.middleware(({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }
    if (!hasPermission(ctx.user.role, permission)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action",
      });
    }
    return next({ ctx: { user: ctx.user } });
  });
}

export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthenticated);
export const adminProcedure = t.procedure.use(
  requirePermission("users:manage"),
);
```

### Resource Ownership Checks

Verify that the authenticated user owns the resource they are trying to modify.
This prevents IDOR (Insecure Direct Object Reference) attacks:

```typescript
// routers/posts/mutations.ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { findPostById } from "~/db/queries/posts.js";
import { protectedProcedure } from "~/router.js";

export const postMutations = {
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(200).optional(),
        content: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const [post] = await findPostById.execute({ id: input.id });
      if (!post) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      // Ownership check — admins can bypass
      if (post.authorId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only edit your own posts",
        });
      }

      const { id, ...data } = input;
      return updatePost(id, data);
    }),
};
```

### Route-Level Auth Middleware

For Fastify REST routes, use `onRequest` hooks (similar to Qwik City's
`onRequest` middleware and Nuxt's route middleware):

```typescript
// hooks/require-auth.ts
import type { FastifyReply, FastifyRequest } from "fastify";

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!request.user) {
    return reply.status(401).send({
      error: "Unauthorized",
      message: "Authentication required",
    });
  }
}

export function requireRole(role: string) {
  return async function roleGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    if (!request.user) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }
    if (request.user.role !== role) {
      return reply.status(403).send({
        error: "Forbidden",
        message: "Insufficient permissions",
      });
    }
  };
}
```

```typescript
// routes/admin/index.ts
import type { FastifyPluginAsync } from "fastify";
import { requireRole } from "~/hooks/require-auth.js";

const routes: FastifyPluginAsync = async function (fastify) {
  // All routes in this scope require the admin role
  fastify.addHook("onRequest", requireRole("admin"));

  fastify.get("/dashboard", async (request) => {
    return { users: await getAdminStats() };
  });
};

export default routes;
```

---

## CSRF Protection

Cross-Site Request Forgery protection is required for all state-changing
operations from browser clients. See [sessions.md](sessions.md) for the full
implementation of token generation, validation, and client integration.

### Double-Submit Cookie Pattern

Scratchy uses the **double-submit cookie pattern** — the CSRF token is stored in
a signed cookie and must also be sent in a request header. The server compares
the two values using constant-time comparison.

```typescript
// plugins/external/04-csrf.ts
import fp from "fastify-plugin";
import { randomBytes, timingSafeEqual } from "node:crypto";

export default fp(async function csrfProtection(fastify) {
  // Generate a CSRF token and set it as a cookie
  fastify.addHook("onRequest", async (request, reply) => {
    // Only generate for GET requests (to seed the token)
    if (request.method === "GET") {
      const existingToken = request.cookies["csrf_token"];
      if (!existingToken) {
        const token = randomBytes(32).toString("hex");
        reply.setCookie("csrf_token", token, {
          httpOnly: false, // Must be readable by client JS
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: "/",
          maxAge: 60 * 60 * 24, // 24 hours
          signed: true,
        });
      }
    }
  });

  // Validate CSRF token on state-changing requests
  fastify.addHook("onRequest", async (request, reply) => {
    const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
    if (safeMethods.has(request.method)) return;

    // Skip CSRF for external API routes (they use Bearer tokens)
    if (request.url.startsWith("/external/api")) return;

    const cookieToken = request.cookies["csrf_token"];
    const headerToken = request.headers["x-csrf-token"];

    if (!cookieToken || !headerToken || typeof headerToken !== "string") {
      return reply.status(403).send({
        error: "Forbidden",
        message: "Missing CSRF token",
      });
    }

    // Constant-time comparison to prevent timing attacks
    const cookieBuffer = Buffer.from(cookieToken, "utf8");
    const headerBuffer = Buffer.from(headerToken, "utf8");

    if (
      cookieBuffer.length !== headerBuffer.length ||
      !timingSafeEqual(cookieBuffer, headerBuffer)
    ) {
      return reply.status(403).send({
        error: "Forbidden",
        message: "Invalid CSRF token",
      });
    }
  });
});
```

### SameSite Cookie Protection

The `sameSite` attribute is the **first line of defense** against CSRF. Scratchy
defaults to `"lax"` for session cookies and `"strict"` for CSRF tokens:

| Cookie        | `sameSite` | Reason                                          |
| ------------- | ---------- | ----------------------------------------------- |
| `session_id`  | `"lax"`    | Allows top-level navigations (OAuth redirects)  |
| `csrf_token`  | `"strict"` | Never sent on cross-origin requests             |
| `remember_me` | `"lax"`    | Needs to work on navigation from external sites |

### Client Integration

```typescript
// lib/csrf.client.ts
function getCsrfToken(): string {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrf_token="));
  if (!match) throw new Error("CSRF token cookie not found");
  return match.split("=")[1] ?? "";
}

// Attach the token to every tRPC and fetch request
export function createCsrfHeaders(): Record<string, string> {
  return { "x-csrf-token": getCsrfToken() };
}
```

---

## Content Security Policy (CSP)

CSP is the strongest defense against XSS. Qwik's **resumable architecture**
requires careful CSP configuration because the framework injects inline scripts
for lazy-loading.

### Nonce-Based CSP for Qwik

Generate a unique nonce per request and pass it to both the CSP header and the
Qwik renderer:

```typescript
// plugins/external/01-helmet.ts
import helmet from "@fastify/helmet";
import fp from "fastify-plugin";
import { randomBytes } from "node:crypto";

export default fp(async function helmetPlugin(fastify) {
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          // The nonce is added per-request below
          (_, res) => {
            const nonce = randomBytes(16).toString("base64");
            (res as { cspNonce?: string }).cspNonce = nonce;
            return `'nonce-${nonce}'`;
          },
        ],
        styleSrc: ["'self'", "'unsafe-inline'"], // Qwik inlines styles
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    // Other helmet defaults
    crossOriginEmbedderPolicy: false, // May break external images
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
  });

  // Make the nonce available on every request for SSR
  fastify.decorateRequest("cspNonce", "");

  fastify.addHook("onRequest", async (request) => {
    request.cspNonce = randomBytes(16).toString("base64");
  });
});
```

Pass the nonce to the Qwik renderer worker:

```typescript
// routes/pages/index.ts
import type { FastifyPluginAsync } from "fastify";

const routes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/*", async (request, reply) => {
    const result = await fastify.runTask({
      type: "ssr",
      route: request.url,
      nonce: request.cspNonce,
      props: { user: request.user },
    });

    reply
      .status(result.statusCode)
      .header("content-type", "text/html; charset=utf-8")
      .send(result.html);
  });
};

export default routes;
```

### CSP Report-Only Mode

Use report-only mode to test a new policy before enforcing it:

```typescript
// Start in report-only mode to identify violations
fastify.addHook("onSend", async (request, reply) => {
  if (process.env.CSP_REPORT_ONLY === "true") {
    const csp = reply.getHeader("content-security-policy");
    if (typeof csp === "string") {
      reply.removeHeader("content-security-policy");
      reply.header("content-security-policy-report-only", csp);
    }
  }
});
```

Set up a reporting endpoint to collect CSP violations:

```typescript
// routes/csp-report/index.ts
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const cspReportSchema = z.object({
  "csp-report": z.object({
    "document-uri": z.string(),
    "violated-directive": z.string(),
    "blocked-uri": z.string(),
    "original-policy": z.string(),
  }),
});

const routes: FastifyPluginAsync = async function (fastify) {
  fastify.post(
    "/csp-report",
    { schema: { body: cspReportSchema } },
    async (request) => {
      request.log.warn({ cspViolation: request.body }, "CSP violation report");
      return { received: true };
    },
  );
};

export default routes;
```

---

## Security Headers

`@fastify/helmet` sets most headers automatically. This section documents what
each header does and how to configure it.

### Header Reference

| Header                              | Value                                 | Purpose                              |
| ----------------------------------- | ------------------------------------- | ------------------------------------ |
| `X-Content-Type-Options`            | `nosniff`                             | Prevents MIME-type sniffing          |
| `X-Frame-Options`                   | `DENY`                                | Blocks framing (clickjacking)        |
| `Strict-Transport-Security`         | `max-age=31536000; includeSubDomains` | Forces HTTPS for 1 year              |
| `Referrer-Policy`                   | `strict-origin-when-cross-origin`     | Limits referrer leakage              |
| `X-DNS-Prefetch-Control`            | `off`                                 | Prevents DNS prefetch leaking        |
| `X-Permitted-Cross-Domain-Policies` | `none`                                | Blocks Flash/PDF cross-domain access |
| `Content-Security-Policy`           | _(per-request nonce)_                 | XSS prevention (see CSP section)     |
| `Cross-Origin-Opener-Policy`        | `same-origin`                         | Isolates browsing context            |
| `Cross-Origin-Resource-Policy`      | `same-origin`                         | Prevents cross-origin resource reads |
| `Permissions-Policy`                | `camera=(), microphone=()`            | Disables sensitive browser features  |

### Complete Helmet Configuration

```typescript
// plugins/external/01-helmet.ts
import helmet from "@fastify/helmet";
import fp from "fastify-plugin";

export default fp(async function helmetPlugin(fastify) {
  await fastify.register(helmet, {
    // CSP — see Content Security Policy section above
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },

    // HSTS — force HTTPS
    strictTransportSecurity: {
      maxAge: 31_536_000, // 1 year
      includeSubDomains: true,
      preload: true,
    },

    // Prevent clickjacking
    frameguard: { action: "deny" },

    // Prevent MIME-type sniffing
    contentTypeOptions: true, // X-Content-Type-Options: nosniff

    // Referrer policy
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },

    // Disable DNS prefetching
    dnsPrefetchControl: { allow: false },

    // Disable Flash/PDF cross-domain access
    permittedCrossDomainPolicies: { permittedPolicies: "none" },

    // Browsing context isolation
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    crossOriginEmbedderPolicy: false,
  });
});
```

### Permissions-Policy Header

Helmet doesn't manage `Permissions-Policy`. Add it manually:

```typescript
fastify.addHook("onSend", async (_request, reply) => {
  reply.header(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
});
```

### Strip Internal-Routing Headers (CVE-2025-29927 pattern)

`@scratchyjs/core` automatically loads a `strip-internal-headers` plugin that
removes known internal-routing headers from every inbound request **before** any
auth hook runs. This prevents attackers from bypassing authentication middleware
by sending spoofed internal headers — a pattern demonstrated in CVE-2025-29927
(Next.js `x-middleware-subrequest` bypass) and applicable to any framework that
might trust such headers from external clients.

**Headers stripped by default:**

| Header                    | Origin  | Risk                         |
| ------------------------- | ------- | ---------------------------- |
| `x-middleware-subrequest` | Next.js | Auth bypass (CVE-2025-29927) |
| `x-middleware-prefetch`   | Next.js | Request flow manipulation    |
| `x-middleware-rewrite`    | Next.js | Routing bypass               |
| `x-internal-request`      | Generic | Auth bypass if trusted       |
| `x-internal-token`        | Generic | Credential injection         |
| `x-vercel-internal`       | Vercel  | Platform internal routing    |
| `x-now-route-matches`     | Vercel  | Route matching manipulation  |
| `x-remix-response`        | Remix   | Response handling bypass     |

To add application-specific internal headers to the strip list, create a
separate hook plugin in your `plugins/app/` directory:

```typescript
// plugins/app/strip-app-headers.ts
import fp from "fastify-plugin";

export default fp(
  function stripAppHeaders(fastify, _opts, done) {
    fastify.addHook("onRequest", (request, _reply, hookDone) => {
      delete request.headers["x-my-app-bypass"];
      hookDone();
    });
    done();
  },
  { name: "strip-app-internal-headers" },
);
```

**Never** trust internal headers for auth decisions — all auth must flow through
`requireAuth` / `protectedProcedure` based on actual session state.

---

## Input Validation and Sanitization

### Zod Schema Validation

Every input boundary — tRPC procedures, REST route bodies, query strings — must
be validated with Zod. Never trust client input.

```typescript
// Strict input schemas — no extra properties, no loose types
const createUserInput = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or fewer")
    .trim(),
  email: z.string().email("Invalid email address").toLowerCase(),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128, "Password must be 128 characters or fewer"),
});

// Pagination — always constrain limits
const paginationInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ID parameters — constrain format
const idInput = z.object({
  id: z.string().min(1).max(64),
});

// Search queries — prevent ReDoS by limiting length
const searchInput = z.object({
  query: z.string().min(1).max(200).trim(),
});
```

### SQL Injection Prevention

Drizzle ORM uses **parameterized queries** by default. Every value passed
through the query builder is automatically escaped. The only injection risk
comes from building raw SQL.

```typescript
import { sql, eq } from "drizzle-orm";

// ✅ SAFE — Drizzle parameterizes automatically
const users = await db
  .select()
  .from(user)
  .where(eq(user.email, userInput));

// ✅ SAFE — sql.placeholder for prepared statements
const findUser = db
  .select()
  .from(user)
  .where(eq(user.id, sql.placeholder("id")))
  .prepare("find_user");
await findUser.execute({ id: untrustedId });

// ✅ SAFE — sql template tag parameterizes the value
const results = await db.execute(
  sql`SELECT * FROM users WHERE email = ${userInput}`,
);

// ❌ DANGEROUS — string concatenation in raw SQL
const results = await db.execute(
  sql.raw(`SELECT * FROM users WHERE email = '${userInput}'`),
);
```

**Rule:** Never use `sql.raw()` with untrusted input. If you need dynamic
identifiers (table or column names), validate them against an allowlist.

### XSS Prevention

Qwik automatically escapes JSX expressions, which prevents most reflected and
stored XSS. Additional protections:

1. **Never use `dangerouslySetInnerHTML`** (or Qwik equivalent) with
   user-provided content without sanitization.
2. **Sanitize HTML** if you must render user HTML — use a strict allowlist
   sanitizer:

```typescript
import DOMPurify from "isomorphic-dompurify";

function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "a", "p", "br", "ul", "ol", "li"],
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
}
```

3. **Set `httpOnly: true`** on all session cookies (prevents JS access).
4. **Set a strict CSP** (see CSP section above).
5. **Encode output** in non-HTML contexts (JSON, URLs, CSS):

```typescript
// URL parameters — use encodeURIComponent
const safeUrl = `/search?q=${encodeURIComponent(userQuery)}`;

// JSON in HTML — escape angle brackets
function escapeJsonForHtml(json: string): string {
  return json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}
```

---

## Rate Limiting

Rate limiting prevents abuse, brute-force attacks, and resource exhaustion.
Scratchy uses `@fastify/rate-limit` with Redis/DragonflyDB as the store for
distributed deployments.

### Global Rate Limit

```typescript
// plugins/external/02-rate-limit.ts
import rateLimit from "@fastify/rate-limit";
import fp from "fastify-plugin";

export default fp(async function rateLimitPlugin(fastify) {
  await fastify.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    // Use Redis for distributed rate limiting
    redis: fastify.redis,
    // Identify clients by IP or API key
    keyGenerator: (request) => {
      return (request.headers["x-api-key"] as string) || request.ip;
    },
    // Return standard error response
    errorResponseBuilder: (request, context) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: `Rate limit exceeded. Retry after ${Math.ceil(context.ttl / 1000)} seconds.`,
      retryAfter: Math.ceil(context.ttl / 1000),
    }),
    // Add rate limit headers to every response
    addHeadersOnExceeding: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
    },
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "retry-after": true,
    },
  });
});
```

### Per-Route Rate Limits

Apply stricter limits on sensitive endpoints:

```typescript
// routes/auth/login/index.ts
import type { FastifyPluginAsync } from "fastify";

const routes: FastifyPluginAsync = async function (fastify) {
  fastify.post(
    "/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
          keyGenerator: (request) => {
            // Rate limit by IP for login attempts
            return `login:${request.ip}`;
          },
        },
      },
    },
    async (request, reply) => {
      // Login handler
    },
  );

  // Password reset — even stricter
  fastify.post(
    "/reset-password",
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: "1 hour",
          keyGenerator: (request) => `reset:${request.ip}`,
        },
      },
    },
    async (request, reply) => {
      // Password reset handler
    },
  );
};

export default routes;
```

### Per-User / Per-API-Key Limits

For external APIs, rate limit by API key to prevent a single consumer from
exhausting resources:

```typescript
// routes/external/api/v1/index.ts
import type { FastifyPluginAsync } from "fastify";

const routes: FastifyPluginAsync = async function (fastify) {
  fastify.addHook("onRequest", async (request, reply) => {
    const apiKey = request.headers["x-api-key"];
    if (!apiKey || typeof apiKey !== "string") {
      return reply.status(401).send({ error: "Missing API key" });
    }
  });

  // Route-scoped rate limit by API key
  await fastify.register(import("@fastify/rate-limit"), {
    max: 1000,
    timeWindow: "1 hour",
    keyGenerator: (request) => {
      return `api:${request.headers["x-api-key"] as string}`;
    },
  });
};

export default routes;
```

### DDoS Protection Strategies

Rate limiting alone is not sufficient for DDoS protection. Layer these
strategies:

| Layer         | Strategy                                           |
| ------------- | -------------------------------------------------- |
| Edge/CDN      | Cloudflare, AWS Shield, or similar DDoS mitigation |
| Reverse proxy | Connection limits in Nginx/Caddy                   |
| Application   | `@fastify/rate-limit` with Redis backend           |
| Request size  | `bodyLimit` in Fastify config (default 10 MB)      |
| Timeouts      | `requestTimeout` and `keepAliveTimeout` in Fastify |
| Slow loris    | `connectionTimeout` at the reverse proxy level     |

```typescript
// server.ts — request-level protections
const server = Fastify({
  bodyLimit: 10 * 1024 * 1024, // 10 MB max body
  requestTimeout: 30_000, // 30 second request timeout
  keepAliveTimeout: 5_000, // 5 second keep-alive timeout
});
```

---

## CORS Configuration

CORS is enabled **only on external API routes** (`/external/api`). Internal tRPC
endpoints serve same-origin requests and must never have CORS headers.

See [api-design.md](api-design.md) for the full CORS strategy.

### Production Origin Allowlist (`ALLOWED_ORIGINS`)

The `@scratchyjs/core` CORS plugin reads `process.env.NODE_ENV` and
`process.env.ALLOWED_ORIGINS` at startup to determine the `origin` policy:

| Environment            | `ALLOWED_ORIGINS` | Behaviour                                          |
| ---------------------- | ----------------- | -------------------------------------------------- |
| `development` / `test` | any               | `origin: true` — all origins accepted              |
| `production`           | set               | Explicit allowlist callback — only listed origins  |
| `production`           | not set           | `origin: false` — all cross-origin requests denied |

```bash
# .env.production — required for cross-origin browser clients
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
```

A startup warning is logged when `NODE_ENV=production` and `ALLOWED_ORIGINS` is
unset so the misconfiguration is visible immediately in server logs.

### Internal API (No CORS)

```typescript
// tRPC routes — no CORS, same-origin only
await server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: { router: appRouter, createContext },
});
// No @fastify/cors registered — browser same-origin policy applies
```

### External API (CORS Enabled)

```typescript
// plugins/external/03-cors.ts — scoped to external routes only
import cors from "@fastify/cors";
import fp from "fastify-plugin";

export default fp(async function corsPlugin(fastify) {
  // Only apply CORS to external API routes
  fastify.register(
    async function externalScope(instance) {
      await instance.register(cors, {
        origin: (origin, callback) => {
          const allowedOrigins = getEnvVar("CORS_ALLOWED_ORIGINS").split(",");
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error("Not allowed by CORS"), false);
          }
        },
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
        allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
        exposedHeaders: [
          "X-RateLimit-Limit",
          "X-RateLimit-Remaining",
          "Retry-After",
        ],
        credentials: true,
        maxAge: 86_400, // 24 hours preflight cache
      });
    },
    { prefix: "/external/api" },
  );
});
```

### Anti-Patterns

```typescript
// ❌ DANGEROUS — Allow all origins
await fastify.register(cors, { origin: true });

// ❌ DANGEROUS — Wildcard with credentials
await fastify.register(cors, { origin: "*", credentials: true });

// ❌ DANGEROUS — CORS on tRPC routes
await fastify.register(cors); // Applies to all routes

// ✅ SAFE — Explicit origin allowlist, scoped to external routes
await fastify.register(cors, {
  origin: ["https://partner-app.example.com"],
  credentials: true,
});
```

---

## Secrets Management

### Environment Variables

All secrets are loaded from environment variables — never hardcoded in source.

```typescript
// lib/env.ts
function getEnvVar(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// Required environment variables
const config = {
  databaseUrl: getEnvVar("DATABASE_URL"),
  redisUrl: getEnvVar("REDIS_URL"),
  sessionSecret: getEnvVar("SESSION_SECRET"),
  jwtSecret: getEnvVar("JWT_SECRET"),
  cookieSecret: getEnvVar("COOKIE_SECRET"),
  googleClientId: getEnvVar("GOOGLE_CLIENT_ID"),
  googleClientSecret: getEnvVar("GOOGLE_CLIENT_SECRET"),
} as const;
```

### Secret Rotation

Cookie signing and JWT secrets support **rotation** — multiple secrets where the
first is used for signing and all are tried for verification. This allows
zero-downtime secret rotation.

```typescript
// lib/cookie-secrets.ts
import { createHmac, timingSafeEqual } from "node:crypto";

// COOKIE_SECRETS is a comma-separated list, newest first
const secrets = getEnvVar("COOKIE_SECRETS").split(",");

// Sign with the newest secret
export function signCookie(value: string): string {
  const signature = createHmac("sha256", secrets[0]!)
    .update(value)
    .digest("base64url");
  return `${value}.${signature}`;
}

// Verify against all secrets (supports rotation)
export function verifyCookie(signed: string): string | null {
  const dotIndex = signed.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const value = signed.slice(0, dotIndex);
  const signature = signed.slice(dotIndex + 1);
  const sigBuffer = Buffer.from(signature, "base64url");

  for (const secret of secrets) {
    const expected = createHmac("sha256", secret).update(value).digest();

    if (
      sigBuffer.length === expected.length &&
      timingSafeEqual(sigBuffer, expected)
    ) {
      return value;
    }
  }

  return null; // No secret matched
}
```

**Rotation procedure:**

1. Generate a new secret.
2. Prepend it to `COOKIE_SECRETS` (e.g., `new_secret,old_secret`).
3. Deploy — new cookies are signed with the new secret; old cookies still verify
   against the old secret.
4. After all old sessions expire (e.g., 7 days), remove the old secret.

### Rules

- **Never commit secrets** to version control — use `.env` files (gitignored) or
  a secrets manager.
- **Use separate secrets** for each purpose — don't reuse the session secret as
  the JWT secret.
- **Rotate secrets periodically** — at minimum when team members leave or a
  breach is suspected.
- **Use strong secrets** — at least 256 bits of randomness:

```bash
# Generate a cryptographically secure secret
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

---

## Password Storage

Never store passwords in plain text. Use a memory-hard hashing algorithm:

```typescript
// lib/password.ts
import { hash, verify } from "@node-rs/argon2";

const ARGON2_OPTIONS = {
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  return verify(hash, password, ARGON2_OPTIONS);
}
```

**Rules:**

- Use Argon2id (preferred) or bcrypt (acceptable).
- Never use MD5, SHA-1, SHA-256, or other fast hashes for passwords.
- Hash on the server — never accept pre-hashed passwords from the client.
- Never log passwords, even in development.

---

## Dependency Security

### Known CVEs Addressed in This Stack

The following CVEs have been researched and mitigated within Scratchy. Each
entry lists the status and what action (if any) is required:

| CVE            | Component                     | Type                                                   | Severity | Status                                                    | Action                                                                          |
| -------------- | ----------------------------- | ------------------------------------------------------ | -------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| CVE-2025-32442 | Fastify ≤ 5.3.1               | Content-Type validation bypass → injection             | High     | ✅ Use single Zod schema per route                        | Keep Fastify ≥ 5.3.2                                                            |
| CVE-2025-43855 | `@trpc/server` 11.0–11.1.0    | WebSocket `connectionParams` uncaught exception → DoS  | High     | ✅ `createContext()` wrapped in try/catch                 | Keep `@trpc/server` ≥ 11.1.1                                                    |
| CVE-2025-29927 | Next.js (pattern)             | Internal header bypass of auth middleware              | Critical | ✅ `strip-internal-headers` plugin                        | Built into `@scratchyjs/core`                                                   |
| CVE-2024-8024  | `@fastify/cors` (pattern)     | `origin: true` + credentials → credential exfiltration | High     | ✅ CORS plugin auto-restricts in production               | Set `ALLOWED_ORIGINS` in production                                             |
| CVE-2024-22207 | `@fastify/swagger-ui` < 2.1.0 | Serves module directory files → info disclosure        | Medium   | ✅ Using swagger-ui ≥ 5.x                                 | No action needed                                                                |
| CVE-2025-43864 | Remix (pattern)               | Cache poisoning + persistent XSS                       | High     | ✅ tRPC uses `no-store`; add `Vary: Cookie` for SSR pages | Add `Cache-Control: private, no-store` + `Vary: Cookie` to authenticated routes |
| CVE-2025-61686 | Remix (pattern)               | Path traversal via file-based session storage          | Critical | ✅ Redis sessions + signed cookies                        | Never use file-based session storage                                            |

**Upgrade guidance for CVE-2025-32442 (Fastify Content-Type bypass):** This CVE
affects per-content-type schema configurations. The Scratchy pattern of using a
single Zod schema per route (via `fastify-type-provider-zod`) is the safe
pattern. Ensure Fastify is kept at 5.3.2+ in your `package.json`.

**Upgrade guidance for CVE-2025-43855 (tRPC WebSocket DoS):** The
`createContext()` function in `@scratchyjs/trpc` is already wrapped in a
try/catch to prevent uncaught exceptions. Keep `@trpc/server` at ≥ 11.1.1.

### Audit Commands

```bash
# Check for known vulnerabilities in dependencies
pnpm audit

# Check for outdated packages
pnpm outdated

# Update dependencies (review changes before merging)
pnpm update --interactive
```

### Supply Chain Security

| Practice                  | Implementation                                                |
| ------------------------- | ------------------------------------------------------------- |
| Lock file integrity       | Always commit `pnpm-lock.yaml`; use `--frozen-lockfile` in CI |
| Minimal dependencies      | Audit every new dependency; prefer Node.js built-ins          |
| Pinned versions           | Use exact versions in `package.json` for production deps      |
| CI vulnerability scanning | Run `pnpm audit` in CI and fail on critical/high findings     |
| Provenance checks         | Verify package provenance with `npm audit signatures`         |
| Corepack                  | Pin pnpm version via `"packageManager"` in `package.json`     |

```jsonc
// package.json
{
  "packageManager": "pnpm@10.x.x",
  "scripts": {
    "audit": "pnpm audit --audit-level=high",
    "preinstall": "npx only-allow pnpm",
  },
}
```

---

## Logging and Audit Trail

Security events must be logged for incident response and compliance. Use
structured logging with Pino (Fastify's built-in logger).

```typescript
// Log authentication events
request.log.info({ userId: user.id, method: "password" }, "user logged in");
request.log.info({ userId: user.id }, "user logged out");
request.log.warn({ userId: user.id, ip: request.ip }, "failed login attempt");

// Log authorization failures
request.log.warn(
  { userId: request.user?.id, resource: "post", action: "delete", postId },
  "authorization denied",
);

// Log security events
request.log.warn({ ip: request.ip, path: request.url }, "rate limit exceeded");
request.log.warn({ ip: request.ip }, "CSRF token validation failed");
request.log.warn({ cspViolation: report }, "CSP violation");
```

**Rules:**

- **Never log secrets**, passwords, tokens, or full credit card numbers.
- **Always log** failed authentication attempts with the source IP.
- **Always log** authorization denials with the user ID and requested resource.
- Use `request.log` inside handlers (includes request context), `fastify.log`
  only in plugin-level code.

---

## Worker Thread Security

Piscina workers run in separate V8 isolates. Security considerations:

1. **Do not pass secrets** directly to worker task payloads. Workers should read
   secrets from their own environment or a secure store.
2. **Validate worker input** — treat task payloads as untrusted and validate
   them in the worker:

```typescript
// renderer/worker.ts
import { z } from "zod";

const renderTaskSchema = z.object({
  type: z.enum(["ssr", "ssg"]),
  route: z.string().min(1).max(2048),
  nonce: z.string().min(1).max(64).optional(),
  props: z.record(z.unknown()).optional(),
});

export default async function handler(rawTask: unknown) {
  const task = renderTaskSchema.parse(rawTask);
  // Safe to use task.route, task.nonce, etc.
}
```

3. **Set resource limits** on workers to prevent memory exhaustion:

```typescript
{
  resourceLimits: {
    maxOldGenerationSizeMb: 512,
    maxYoungGenerationSizeMb: 64,
  },
  taskTimeout: 30_000,
}
```

---

## Security Checklist

Use this checklist before every production deployment:

### Authentication and Sessions

- [ ] Session cookies use `httpOnly: true`
- [ ] Session cookies use `secure: true` in production
- [ ] Session cookies use `sameSite: "lax"` or `"strict"`
- [ ] All cookies are signed with HMAC-SHA256
- [ ] Session ID is regenerated on login
- [ ] Sessions are destroyed (not just cleared) on logout
- [ ] Passwords are hashed with Argon2id or bcrypt
- [ ] Failed login returns a generic error message

### CSRF

- [ ] CSRF tokens are validated on all state-changing requests
- [ ] CSRF comparison uses `timingSafeEqual`
- [ ] CSRF tokens use `sameSite: "strict"`
- [ ] External API routes are excluded from CSRF (they use Bearer tokens)

### Headers

- [ ] `@fastify/helmet` is registered as the first plugin
- [ ] CSP is configured with nonces (no `'unsafe-inline'` for scripts)
- [ ] HSTS is enabled with `includeSubDomains` and `preload`
- [ ] `X-Frame-Options: DENY` is set
- [ ] `Permissions-Policy` disables unused browser features
- [ ] `strip-internal-headers` plugin is not removed from `@scratchyjs/core`

### Input and Output

- [ ] All inputs are validated with Zod schemas
- [ ] All database queries use Drizzle ORM (parameterized)
- [ ] No `sql.raw()` with untrusted input
- [ ] User HTML is sanitized before rendering
- [ ] Error responses do not leak internal details in production

### Rate Limiting and CORS

- [ ] Global rate limit is configured
- [ ] Login and password reset have stricter rate limits
- [ ] CORS is enabled only on `/external/api` routes
- [ ] CORS origins are explicitly allowlisted
- [ ] `ALLOWED_ORIGINS` is set in production environment
- [ ] Authenticated SSR responses include `Cache-Control: private, no-store` and
      `Vary: Cookie`

### Secrets

- [ ] No secrets in source code or version control
- [ ] Separate secrets for each purpose (session, JWT, cookie)
- [ ] Secret rotation is supported (multiple secrets)
- [ ] Secrets are at least 256 bits of randomness

### Dependencies

- [ ] `pnpm audit` runs in CI
- [ ] `pnpm-lock.yaml` is committed
- [ ] CI uses `--frozen-lockfile`
- [ ] Known CVE table reviewed — all items marked ✅

---

## Anti-Patterns

### ❌ Don't trust client-side validation alone

```typescript
// BAD — Only validating on the client
// The server receives unvalidated data

// GOOD — Always validate on the server
const input = createUserInput.parse(request.body);
```

### ❌ Don't expose internal errors in production

```typescript
// BAD — Leaks database schema information
return reply.status(500).send({ error: dbError.message });

// GOOD — Generic message, log the real error
request.log.error(dbError, "database operation failed");
return reply.status(500).send({
  error: "Internal Server Error",
  message: "An unexpected error occurred",
});
```

See [error-handling.md](error-handling.md) for the full error handling strategy.

### ❌ Don't store sensitive data in JWT claims

```typescript
// BAD — JWTs are base64-encoded, not encrypted
const token = signToken({
  sub: user.id,
  email: user.email,       // PII in token
  creditCard: user.card,   // Sensitive data!
});

// GOOD — Minimal claims, look up details server-side
const token = signToken({
  sub: user.id,
  role: user.role,
});
```

### ❌ Don't skip authorization checks

```typescript
// BAD — Any authenticated user can delete any post
export const deletePost = protectedProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ input }) => {
    await db.delete(post).where(eq(post.id, input.id));
  });

// GOOD — Verify ownership or admin role
export const deletePost = protectedProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const [existing] = await findPostById.execute({ id: input.id });
    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    if (existing.authorId !== ctx.user.id && ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    await db.delete(post).where(eq(post.id, input.id));
  });
```

### ❌ Don't use `===` for token comparison

```typescript
// BAD — Vulnerable to timing attacks
if (csrfCookie === csrfHeader) {
  /* ... */
}

// GOOD — Constant-time comparison
const a = Buffer.from(csrfCookie, "utf8");
const b = Buffer.from(csrfHeader, "utf8");
if (a.length === b.length && timingSafeEqual(a, b)) {
  /* ... */
}
```

### ❌ Don't enable CORS on internal routes

```typescript
// BAD — Opens tRPC to cross-origin requests
await server.register(cors);

// GOOD — Only on external API routes
await server.register(cors, { prefix: "/external/api" });
```

---

## Reference Links

- [@fastify/helmet](https://github.com/fastify/fastify-helmet) — Security
  headers
- [@fastify/rate-limit](https://github.com/fastify/fastify-rate-limit) — Rate
  limiting
- [@fastify/cors](https://github.com/fastify/fastify-cors) — CORS
- [@fastify/csrf-protection](https://github.com/fastify/csrf-protection) — CSRF
- [@fastify/oauth2](https://github.com/fastify/fastify-oauth2) — OAuth2
- [Better Auth](https://www.better-auth.com/) — Authentication library
- [fast-jwt](https://github.com/nearform/fast-jwt) — JWT signing/verification
- [OWASP Top 10](https://owasp.org/www-project-top-ten/) — Web application
  security risks
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/) — Security
  best practices
- [MDN Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)
  — CSP reference
- [Node.js Security Best Practices](https://nodejs.org/en/learn/getting-started/security-best-practices)
  — Node.js security

## Related Documentation

- [Sessions](./sessions.md) — Cookie signing, session storage, CSRF tokens
- [Middleware](./middleware.md) — Security plugin ordering and lifecycle hooks
- [API Design](./api-design.md) — Authentication for tRPC and REST
- [Error Handling](./error-handling.md) — Preventing error information leakage
- [Architecture](./architecture.md) — Defense-in-depth layer overview
