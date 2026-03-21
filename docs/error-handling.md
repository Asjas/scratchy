# Error Handling

Scratchy provides a layered error handling architecture that spans the full
stack — from database errors through API responses to client-side error
boundaries. Every layer produces structured, type-safe errors with consistent
formatting.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    Client (Qwik)                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Global Error Boundary (global-error.tsx)          │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  Layout Error Boundary                       │  │  │
│  │  │  ┌────────────────────────────────────────┐  │  │  │
│  │  │  │  Route Error Boundary (error.tsx)      │  │  │  │
│  │  │  │  ┌──────────────────────────────────┐  │  │  │  │
│  │  │  │  │  Component Error Boundaries      │  │  │  │  │
│  │  │  │  └──────────────────────────────────┘  │  │  │  │
│  │  │  └────────────────────────────────────────┘  │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────┬───────────────────────────────────┘
                       │ tRPC / REST
┌──────────────────────▼───────────────────────────────────┐
│                  Server (Fastify)                         │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  tRPC Error  │  │  Fastify     │  │  Zod Validation │ │
│  │  Handler     │  │  Error       │  │  Errors         │ │
│  │              │  │  Handler     │  │                 │ │
│  └──────┬──────┘  └──────┬───────┘  └────────┬────────┘ │
│         └────────────────┼────────────────────┘          │
│                          ▼                               │
│              Structured Error Response                   │
│                          │                               │
│  ┌───────────────────────┼───────────────────────────┐   │
│  │                       ▼                           │   │
│  │  ┌─────────────┐  ┌──────────┐  ┌─────────────┐  │   │
│  │  │  Database    │  │  Worker   │  │  External   │  │   │
│  │  │  (Drizzle)   │  │  (Piscina)│  │  Services   │  │   │
│  │  └─────────────┘  └──────────┘  └─────────────┘  │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

Errors propagate upward through these layers. Each layer catches, enriches, and
re-throws or responds with structured error data. The guiding principles:

1. **Errors are values** — use typed error classes, not bare strings.
2. **Structured everywhere** — every error carries a code, message, and optional
   metadata.
3. **Fail loudly in development, gracefully in production** — show full stack
   traces in dev, user-friendly messages in prod.
4. **Log at the boundary** — log errors where they are caught, not where they
   are thrown.

---

## Error Utilities

### `createError()` — Structured Error Factory

A Nuxt-inspired utility for creating structured errors anywhere in the stack.
Use it in server code, route loaders, actions, and API handlers.

```typescript
// lib/errors.ts
import type { StatusCode } from "~/types/http.js";

interface ErrorOptions {
  statusCode: StatusCode;
  message: string;
  code?: string;
  fatal?: boolean;
  data?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly statusCode: StatusCode;
  readonly code: string;
  readonly fatal: boolean;
  readonly data: Record<string, unknown>;

  constructor(options: ErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "AppError";
    this.statusCode = options.statusCode;
    this.code = options.code ?? `E_HTTP_${options.statusCode}`;
    this.fatal = options.fatal ?? false;
    this.data = options.data ?? {};
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        data: Object.keys(this.data).length > 0 ? this.data : undefined,
      },
    };
  }
}

export function createError(options: ErrorOptions): AppError {
  return new AppError(options);
}

// Type guard
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
```

Usage:

```typescript
import { createError } from "~/lib/errors.js";

// In a route loader or action
throw createError({
  statusCode: 404,
  message: "Course not found",
  code: "COURSE_NOT_FOUND",
  data: { courseId: "abc123" },
});

// Fatal errors bypass error boundaries and show the global error page
throw createError({
  statusCode: 500,
  message: "Database connection lost",
  fatal: true,
});
```

### `ErrorResponse` — HTTP Error Wrapper

A RedwoodJS-inspired class for returning HTTP error responses from server
functions without throwing. Useful when a non-200 response is an expected
outcome, not an exceptional condition.

```typescript
// lib/error-response.ts
import type { StatusCode } from "~/types/http.js";

export class ErrorResponse {
  readonly status: StatusCode;
  readonly message: string;
  readonly headers: Record<string, string>;

  constructor(
    status: StatusCode,
    message: string,
    headers: Record<string, string> = {},
  ) {
    this.status = status;
    this.message = message;
    this.headers = headers;
  }

  toJSON() {
    return {
      error: {
        statusCode: this.status,
        message: this.message,
      },
    };
  }
}

export function isErrorResponse(value: unknown): value is ErrorResponse {
  return value instanceof ErrorResponse;
}
```

Usage in a Fastify route:

```typescript
import { ErrorResponse, isErrorResponse } from "~/lib/error-response.js";

fastify.get("/external/api/v1/license/:key", async (request, reply) => {
  const result = validateLicenseKey(request.params.key);

  if (isErrorResponse(result)) {
    return reply
      .status(result.status)
      .headers(result.headers)
      .send(result.toJSON());
  }

  return result;
});

function validateLicenseKey(key: string): LicenseData | ErrorResponse {
  if (!key) {
    return new ErrorResponse(400, "License key is required");
  }
  if (key.length !== 32) {
    return new ErrorResponse(422, "Invalid license key format");
  }
  // ... validation logic
  return { valid: true, expiresAt: "2026-01-01" };
}
```

### `notFound()` — Not-Found Helper

A helper that throws a standardized 404 error, used in route loaders and server
functions:

```typescript
// lib/not-found.ts
import { createError } from "~/lib/errors.js";

export function notFound(message = "Not found"): never {
  throw createError({
    statusCode: 404,
    message,
    code: "NOT_FOUND",
  });
}
```

Usage:

```typescript
import { notFound } from "~/lib/not-found.js";

export const useProductLoader = routeLoader$(async ({ params }) => {
  const product = await findProductById.execute({ id: params.id });
  if (!product[0]) {
    notFound(`Product ${params.id} not found`);
  }
  return product[0];
});
```

---

## Client-Side Error Handling

### Error Boundary Components

Scratchy uses Qwik's error boundary pattern, organized by route segment. Error
boundaries catch rendering errors and display fallback UI without crashing the
entire page.

#### Component-Level Error Boundary

Use Qwik's `ErrorBoundary` to wrap components that may fail:

```tsx
// components/error-boundary.tsx
import { $, Slot, component$, useSignal } from "@builder.io/qwik";

interface ErrorBoundaryProps {
  fallback?: (error: unknown, reset: () => void) => JSXOutput;
}

export const ErrorBoundary = component$<ErrorBoundaryProps>(({ fallback }) => {
  const error = useSignal<unknown>(null);
  const key = useSignal(0);

  const reset = $(() => {
    error.value = null;
    key.value++;
  });

  if (error.value) {
    if (fallback) {
      return fallback(error.value, reset);
    }

    return (
      <div class="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
        <h3 class="text-sm font-medium text-red-800 dark:text-red-200">
          Something went wrong
        </h3>
        <button
          onClick$={reset}
          class="mt-2 text-sm text-red-600 underline hover:text-red-500"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div key={key.value}>
      <Slot />
    </div>
  );
});
```

Usage in a page:

```tsx
import { component$ } from "@builder.io/qwik";
import { ErrorBoundary } from "~/components/error-boundary";
import { UserProfile } from "~/components/user-profile";

export default component$(() => {
  return (
    <div>
      <h1>Dashboard</h1>
      <ErrorBoundary>
        <UserProfile />
      </ErrorBoundary>
    </div>
  );
});
```

### Route-Level Error Pages

Following the Next.js/Qwik City pattern, every route segment can include an
`error.tsx` file that acts as the error boundary for that segment:

```
src/client/routes/
├── error.tsx                  # Catches errors from all nested routes
├── global-error.tsx           # Catches root layout errors (last resort)
├── not-found.tsx              # Global 404 page
├── layout.tsx
├── index.tsx
├── blog/
│   ├── error.tsx              # Catches errors in /blog and children
│   ├── index.tsx
│   └── [slug]/
│       ├── error.tsx          # Catches errors in /blog/:slug
│       └── index.tsx
└── dashboard/
    ├── error.tsx              # Catches errors in /dashboard
    ├── layout.tsx
    └── settings/
        ├── error.tsx          # Catches errors in /dashboard/settings
        └── index.tsx
```

#### `error.tsx` — Route Error Boundary

```tsx
// routes/blog/[slug]/error.tsx
import { component$ } from "@builder.io/qwik";
import { useLocation } from "@builder.io/qwik-city";
import type { ErrorBoundaryProps } from "~/types/errors";

export default component$<ErrorBoundaryProps>(({ error }) => {
  const loc = useLocation();

  // Check for specific error types
  if (isRouteErrorResponse(error) && error.statusCode === 404) {
    return (
      <div class="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 class="text-4xl font-bold text-gray-900 dark:text-white">
          Post Not Found
        </h1>
        <p class="mt-4 text-gray-600 dark:text-gray-400">
          The blog post at "{loc.url.pathname}" doesn't exist.
        </p>
        <a
          href="/blog"
          class="bg-primary-600 hover:bg-primary-700 mt-6 inline-block rounded-lg px-4 py-2 text-white"
        >
          Back to Blog
        </a>
      </div>
    );
  }

  return (
    <div class="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 class="text-4xl font-bold text-gray-900 dark:text-white">
        Error Loading Post
      </h1>
      <p class="mt-4 text-gray-600 dark:text-gray-400">
        Something went wrong while loading this blog post. Please try again.
      </p>
    </div>
  );
});
```

#### `global-error.tsx` — Root Error Fallback

Catches errors in the root layout itself. This page renders its own `<html>`
wrapper since the root layout may have failed:

```tsx
// routes/global-error.tsx
import { component$ } from "@builder.io/qwik";
import type { ErrorBoundaryProps } from "~/types/errors";

export default component$<ErrorBoundaryProps>(({ error, reset }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />
        <title>Application Error</title>
      </head>
      <body class="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div class="text-center">
          <h1 class="text-6xl font-bold text-gray-900 dark:text-white">500</h1>
          <p class="mt-4 text-lg text-gray-600 dark:text-gray-400">
            A critical error occurred. Please try refreshing the page.
          </p>
          <button
            onClick$={reset}
            class="bg-primary-600 hover:bg-primary-700 mt-6 rounded-lg px-6 py-3 text-white"
          >
            Refresh
          </button>
        </div>
      </body>
    </html>
  );
});
```

#### `not-found.tsx` — 404 Page

```tsx
// routes/not-found.tsx
import { component$ } from "@builder.io/qwik";
import { useLocation } from "@builder.io/qwik-city";

export default component$(() => {
  const loc = useLocation();

  return (
    <div class="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 class="text-8xl font-bold text-gray-200 dark:text-gray-700">404</h1>
      <h2 class="mt-4 text-2xl font-semibold text-gray-900 dark:text-white">
        Page Not Found
      </h2>
      <p class="mt-2 text-gray-600 dark:text-gray-400">
        The page "{loc.url.pathname}" doesn't exist.
      </p>
      <a
        href="/"
        class="bg-primary-600 hover:bg-primary-700 mt-8 inline-block rounded-lg px-6 py-3 text-white"
      >
        Go Home
      </a>
    </div>
  );
});
```

### `isRouteErrorResponse()` — Error Type Guard

A Remix-inspired type guard for identifying error responses from route loaders
and actions:

```typescript
// lib/route-error.ts
interface RouteErrorResponse {
  statusCode: number;
  message: string;
  code?: string;
  data?: Record<string, unknown>;
}

export function isRouteErrorResponse(
  value: unknown,
): value is RouteErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "statusCode" in value &&
    "message" in value &&
    typeof (value as RouteErrorResponse).statusCode === "number" &&
    typeof (value as RouteErrorResponse).message === "string"
  );
}
```

### Action Failure Handling

Use Qwik City's `action.fail()` pattern to return validation errors from form
actions without throwing:

```tsx
// routes/contact/index.tsx
import { component$ } from "@builder.io/qwik";
import { Form, routeAction$, z, zod$ } from "@builder.io/qwik-city";

export const useContactAction = routeAction$(
  async (data, { fail }) => {
    const result = await sendContactEmail(data);

    if (!result.success) {
      return fail(500, {
        message: "Failed to send email. Please try again later.",
        fieldErrors: {},
      });
    }

    return { success: true };
  },
  zod$({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email address"),
    message: z.string().min(10, "Message must be at least 10 characters"),
  }),
);

export default component$(() => {
  const action = useContactAction();

  return (
    <Form action={action}>
      <div>
        <input name="name" />
        {action.value?.failed && action.value.fieldErrors?.name && (
          <p class="text-sm text-red-600">{action.value.fieldErrors.name}</p>
        )}
      </div>

      <div>
        <input
          name="email"
          type="email"
        />
        {action.value?.failed && action.value.fieldErrors?.email && (
          <p class="text-sm text-red-600">{action.value.fieldErrors.email}</p>
        )}
      </div>

      <div>
        <textarea name="message" />
        {action.value?.failed && action.value.fieldErrors?.message && (
          <p class="text-sm text-red-600">{action.value.fieldErrors.message}</p>
        )}
      </div>

      {action.value?.failed && action.value.message && (
        <div class="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {action.value.message}
        </div>
      )}

      <button
        type="submit"
        disabled={action.isRunning}
      >
        {action.isRunning ? "Sending..." : "Send Message"}
      </button>
    </Form>
  );
});
```

### `useError()` — Client-Side Error State

A Nuxt-inspired composable for accessing and managing error state in components:

```tsx
// hooks/use-error.ts
import { $, useSignal } from "@builder.io/qwik";
import type { AppError } from "~/lib/errors";

export function useError() {
  const error = useSignal<AppError | null>(null);

  const showError = $((err: AppError) => {
    error.value = err;
  });

  const clearError = $(() => {
    error.value = null;
  });

  return { error, showError, clearError };
}
```

Usage:

```tsx
import { component$ } from "@builder.io/qwik";
import { useError } from "~/hooks/use-error";
import { createError } from "~/lib/errors";

export default component$(() => {
  const { error, showError, clearError } = useError();

  const handleDelete = $(async () => {
    try {
      await trpc.posts.delete.mutate({ id: "123" });
    } catch (err) {
      showError(
        createError({
          statusCode: 500,
          message: "Failed to delete post",
          code: "DELETE_FAILED",
        }),
      );
    }
  });

  return (
    <div>
      {error.value && (
        <div class="rounded-lg border border-red-200 bg-red-50 p-4">
          <p class="text-red-800">{error.value.message}</p>
          <button
            onClick$={clearError}
            class="mt-2 text-sm underline"
          >
            Dismiss
          </button>
        </div>
      )}
      <button onClick$={handleDelete}>Delete Post</button>
    </div>
  );
});
```

### Uncaught Error Handlers

Configure global handlers for errors that escape all boundaries. These are set
up in the client entry point:

```typescript
// client/entry.ts

// Catches errors in event handlers and async code not wrapped in boundaries
window.addEventListener("error", (event) => {
  reportErrorToService({
    type: "uncaught",
    message: event.message,
    filename: event.filename,
    line: event.lineno,
    column: event.colno,
    stack: event.error?.stack,
  });
});

// Catches unhandled promise rejections
window.addEventListener("unhandledrejection", (event) => {
  reportErrorToService({
    type: "unhandled_rejection",
    message: String(event.reason),
    stack: event.reason?.stack,
  });
});

function reportErrorToService(error: Record<string, unknown>) {
  // Send to your error tracking service (Sentry, etc.)
  if (import.meta.env.DEV) {
    console.error("[Scratchy Error]", error);
  }
  navigator.sendBeacon("/api/errors", JSON.stringify(error));
}
```

---

## Server-Side Error Handling

### Fastify Error Handler

Set a custom error handler on the Fastify instance to normalize all server
errors into a consistent JSON envelope:

```typescript
// server.ts
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
import { isAppError } from "~/lib/errors.js";

server.setErrorHandler((error, request, reply) => {
  // 1. Zod validation errors (from route schemas)
  if (hasZodFastifySchemaValidationErrors(error)) {
    request.log.warn(
      { validation: error.validation, url: request.url },
      "validation error",
    );
    return reply.status(400).send({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        statusCode: 400,
        details: error.validation,
      },
    });
  }

  // 2. AppError (from createError())
  if (isAppError(error)) {
    const level = error.statusCode >= 500 ? "error" : "warn";
    request.log[level](
      { err: error, statusCode: error.statusCode },
      error.message,
    );
    return reply.status(error.statusCode).send(error.toJSON());
  }

  // 3. Fastify errors (404, 413, etc.)
  if (error.statusCode && error.statusCode < 500) {
    request.log.warn({ err: error, url: request.url }, error.message);
    return reply.status(error.statusCode).send({
      error: {
        code: `E_HTTP_${error.statusCode}`,
        message: error.message,
        statusCode: error.statusCode,
      },
    });
  }

  // 4. Unexpected errors — log full details, return generic message
  request.log.error(
    { err: error, url: request.url, method: request.method },
    "unhandled server error",
  );

  const isDev = process.env.NODE_ENV !== "production";
  return reply.status(500).send({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: isDev ? error.message : "An unexpected error occurred",
      statusCode: 500,
      ...(isDev && { stack: error.stack }),
    },
  });
});
```

### Not-Found Handler

```typescript
server.setNotFoundHandler(
  {
    preHandler: server.rateLimit({ max: 60, timeWindow: "1 hour" }),
  },
  (request, reply) => {
    request.log.warn(
      { url: request.url, method: request.method },
      "route not found",
    );
    return reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method} ${request.url} not found`,
        statusCode: 404,
      },
    });
  },
);
```

### Structured Error Response Envelope

All API errors follow a consistent JSON structure:

```typescript
// types/error-response.ts
interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    statusCode: number;
    details?: unknown;
    data?: Record<string, unknown>;
    stack?: string; // Development only
  };
}
```

Example responses:

```json
// 400 Validation Error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "statusCode": 400,
    "details": [
      {
        "path": ["body", "email"],
        "message": "Invalid email address"
      }
    ]
  }
}

// 404 Not Found
{
  "error": {
    "code": "COURSE_NOT_FOUND",
    "message": "Course abc123 not found",
    "statusCode": 404
  }
}

// 500 Internal Server Error (production)
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred",
    "statusCode": 500
  }
}
```

---

## tRPC Error Handling

### Throwing tRPC Errors

Use `TRPCError` with the appropriate code in all tRPC procedures:

```typescript
import { TRPCError } from "@trpc/server";

export const courseQueries = {
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const [course] = await findCourseById.execute({ id: input.id });

      if (!course) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Course ${input.id} not found`,
        });
      }

      return course;
    }),
};
```

### tRPC Error Code Reference

| Code                    | HTTP Status | Use Case                                   |
| ----------------------- | ----------- | ------------------------------------------ |
| `BAD_REQUEST`           | 400         | Invalid input that passed Zod validation   |
| `UNAUTHORIZED`          | 401         | Missing or invalid authentication          |
| `FORBIDDEN`             | 403         | Authenticated but insufficient permissions |
| `NOT_FOUND`             | 404         | Resource does not exist                    |
| `METHOD_NOT_SUPPORTED`  | 405         | Operation not allowed on this resource     |
| `TIMEOUT`               | 408         | Operation took too long                    |
| `CONFLICT`              | 409         | Resource already exists or state conflict  |
| `PAYLOAD_TOO_LARGE`     | 413         | Request body exceeds size limit            |
| `UNPROCESSABLE_CONTENT` | 422         | Semantically invalid input                 |
| `TOO_MANY_REQUESTS`     | 429         | Rate limit exceeded                        |
| `CLIENT_CLOSED_REQUEST` | 499         | Client disconnected before response        |
| `INTERNAL_SERVER_ERROR` | 500         | Unexpected server failure                  |

### tRPC Error Formatting

Configure the `onError` and `errorFormatter` in the tRPC adapter to shape error
responses and log errors:

```typescript
// server.ts — tRPC plugin registration
await server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: {
    router: appRouter,
    createContext,
    onError({ path, error, type, input }) {
      if (error.code === "INTERNAL_SERVER_ERROR") {
        // Log full error details for unexpected failures
        server.log.error(
          { err: error, path, type, input },
          "tRPC internal error",
        );
      }
    },
  },
});
```

### Wrapping External Service Errors

When calling external services from tRPC procedures, catch their errors and
re-throw as `TRPCError`:

```typescript
export const paymentMutations = {
  charge: protectedProcedure
    .input(z.object({ amount: z.number().positive() }))
    .mutation(async ({ input, ctx }) => {
      let result: ChargeResult;
      try {
        result = await paymentGateway.charge(ctx.user.id, input.amount);
      } catch (err) {

      } catch (err) {
        ctx.request.log.error(
          { err, userId: ctx.user.id },
          "payment charge failed",
        );

        const code = err instanceof Error ? (err as { code?: string }).code : undefined;

        if (code === "INSUFFICIENT_FUNDS") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Insufficient funds for this transaction",
            cause: err,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Payment processing failed",
          cause: err,
        });
      }

      return result;
    }),
};
```

---

## Worker Thread Error Handling

### Error Propagation from Piscina Workers

Piscina automatically propagates errors thrown in workers back to the main
thread as rejected promises. Wrap worker calls to handle failures:

```typescript
// routes/pages/index.ts
import type { FastifyPluginAsync } from "fastify";
import { createError } from "~/lib/errors.js";

const routes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/*", async (request, reply) => {
    try {
      const result = await fastify.runTask({
        type: "ssr",
        route: request.url,
        props: { user: request.user },
      });

      return reply
        .status(result.statusCode)
        .header("content-type", "text/html; charset=utf-8")
        .send(result.html);
    } catch (error) {
      // Worker crashed or timed out
      request.log.error(
        { err: error, route: request.url },
        "SSR worker failed",
      );

      // Return a static fallback page
      return reply
        .status(500)
        .header("content-type", "text/html; charset=utf-8")
        .send(renderFallbackHtml(request.url));
    }
  });
};

export default routes;
```

### Worker-Side Error Handling

Inside workers, catch errors and return structured results instead of letting
them crash the worker:

```typescript
// renderer/worker.ts
import type { RenderResult, RenderTask } from "~/types/renderer.js";

export default async function handler(task: RenderTask): Promise<RenderResult> {
  try {
    switch (task.type) {
      case "ssr":
        return await renderSSR(task.route, task.props);
      case "ssg":
        return await renderSSG(task.route, task.props);
      default:
        return {
          html: renderErrorHtml(400, `Unknown task type: ${task.type}`),
          head: "",
          statusCode: 400,
        };
    }
  } catch (error) {
    // Log in the worker context
    console.error("[Worker] Render error:", error);

    // Return an error page instead of crashing the worker
    const message =
      process.env.NODE_ENV === "production"
        ? "An error occurred while rendering this page"
        : error instanceof Error
          ? error.message
          : String(error);

    return {
      html: renderErrorHtml(500, message),
      head: "",
      statusCode: 500,
    };
  }
}

function renderErrorHtml(statusCode: number, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Error ${statusCode}</title></head>
<body>
  <h1>Error ${statusCode}</h1>
  <p>${escapeHtml(message)}</p>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

### Worker Timeout Handling

Configure task timeouts in Piscina to prevent runaway workers:

```typescript
// plugins/app/worker-pool.ts
import fp from "fastify-plugin";
import { resolve } from "node:path";

export default fp(async function workerPool(fastify) {
  await fastify.register(import("fastify-piscina"), {
    worker: resolve(import.meta.dirname, "..", "..", "renderer", "worker.ts"),
    minThreads: 2,
    maxThreads: Math.max(4, navigator.hardwareConcurrency || 4),
    idleTimeout: 60_000,
    taskTimeout: 30_000, // Kill worker tasks after 30 seconds
    resourceLimits: {
      maxOldGenerationSizeMb: 512,
    },
  });

  // Monitor pool health
  const pool = fastify.piscina;
  setInterval(() => {
    fastify.log.info(
      {
        queueSize: pool.queueSize,
        utilization: pool.utilization,
        runTime: pool.runTime,
        waitTime: pool.waitTime,
      },
      "worker pool stats",
    );
  }, 60_000);
});
```

---

## Database Error Handling

### Drizzle / PostgreSQL Error Patterns

Wrap database operations with proper error handling and map PostgreSQL error
codes to meaningful application errors:

```typescript
// lib/db-errors.ts
import { createError } from "~/lib/errors.js";

// PostgreSQL error codes
// See: https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";
const PG_NOT_NULL_VIOLATION = "23502";
const PG_CHECK_VIOLATION = "23514";

interface PostgresError {
  code: string;
  detail?: string;
  constraint?: string;
  table?: string;
  column?: string;
}

function isPostgresError(error: unknown): error is PostgresError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as PostgresError).code === "string"
  );
}

export function handleDatabaseError(error: unknown): never {
  if (!isPostgresError(error)) {
    throw createError({
      statusCode: 500,
      message: "An unexpected database error occurred",
      code: "DATABASE_ERROR",
      cause: error,
    });
  }

  switch (error.code) {
    case PG_UNIQUE_VIOLATION:
      throw createError({
        statusCode: 409,
        message: `A record with this value already exists`,
        code: "DUPLICATE_ENTRY",
        data: {
          constraint: error.constraint,
          detail: error.detail,
        },
      });

    case PG_FOREIGN_KEY_VIOLATION:
      throw createError({
        statusCode: 422,
        message: "Referenced record does not exist",
        code: "FOREIGN_KEY_VIOLATION",
        data: {
          constraint: error.constraint,
          detail: error.detail,
        },
      });

    case PG_NOT_NULL_VIOLATION:
      throw createError({
        statusCode: 400,
        message: `Required field "${error.column}" is missing`,
        code: "NOT_NULL_VIOLATION",
        data: { column: error.column, table: error.table },
      });

    case PG_CHECK_VIOLATION:
      throw createError({
        statusCode: 422,
        message: "Value violates a check constraint",
        code: "CHECK_VIOLATION",
        data: { constraint: error.constraint },
      });

    default:
      throw createError({
        statusCode: 500,
        message: "A database error occurred",
        code: "DATABASE_ERROR",
        data: { pgCode: error.code },
        cause: error,
      });
  }
}
```

### Usage in Mutations

```typescript
// db/mutations/users.ts
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "~/db/index.js";
import { user } from "~/db/schema/user.js";
import type { NewUser } from "~/db/schema/user.js";
import { handleDatabaseError } from "~/lib/db-errors.js";

export async function createUser(data: Omit<NewUser, "id">) {
  try {
    const [newUser] = await db
      .insert(user)
      .values({ id: ulid(), ...data })
      .returning();
    return newUser;
  } catch (error) {
    handleDatabaseError(error);
  }
}
```

### Connection Pool Error Handling

```typescript
// db/index.ts

// Handle pool-level errors — log but do not crash the process
pool.on("error", (err) => {
  console.error("Database pool error:", err.message);
});

// Verify connectivity at startup
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (error) {
    console.error("Database connection check failed:", error);
    return false;
  }
}
```

### Transaction Error Handling

```typescript
import { db } from "~/db/index.js";
import { handleDatabaseError } from "~/lib/db-errors.js";

export async function transferCredits(
  fromId: string,
  toId: string,
  amount: number,
) {
  try {
    return await db.transaction(async (tx) => {
      const [sender] = await tx
        .select()
        .from(user)
        .where(eq(user.id, fromId))
        .for("update");

      if (!sender) {
        throw createError({
          statusCode: 404,
          message: "Sender not found",
          code: "USER_NOT_FOUND",
        });
      }

      if (sender.credits < amount) {
        throw createError({
          statusCode: 422,
          message: "Insufficient credits",
          code: "INSUFFICIENT_CREDITS",
          data: { available: sender.credits, requested: amount },
        });
      }

      await tx
        .update(user)
        .set({ credits: sender.credits - amount })
        .where(eq(user.id, fromId));

      // Drizzle's sql`` template tag parameterizes interpolated values,
      // preventing SQL injection. The amount is also validated as a number
      // by the Zod schema at the tRPC layer before reaching this point.
      await tx
        .update(user)
        .set({ credits: sql`${user.credits} + ${amount}` })
        .where(eq(user.id, toId));

      return { success: true };
    });
  } catch (error) {
    if (isAppError(error)) throw error;
    handleDatabaseError(error);
  }
}
```

---

## Error Logging

### Structured Logging with Pino

Scratchy uses Fastify's built-in Pino logger for structured JSON logging. Follow
these rules for error logging:

```typescript
// Inside route handlers — use request.log
fastify.get("/users/:id", async (request, reply) => {
  const [err, user] = await fastify.to(findUser(request.params.id));

  if (err) {
    // Always pass the error object first, then the message string
    request.log.error(
      { err, userId: request.params.id },
      "failed to fetch user",
    );
    throw createError({ statusCode: 500, message: "Failed to fetch user" });
  }

  return user;
});

// Inside plugins — use fastify.log
export default fp(async function cachePlugin(fastify) {
  try {
    await connectToRedis();
    fastify.log.info("cache connected");
  } catch (error) {
    fastify.log.error({ err: error }, "cache connection failed");
  }
});
```

### Logging Rules

1. **Use `request.log`** inside route handlers — it automatically includes the
   request ID for correlation.
2. **Use `fastify.log`** only in plugin-level or startup code.
3. **Always pass an object first**:
   `request.log.error({ err, key: value }, "message")`.
4. **Never use string interpolation** in log messages — use structured fields.
5. **Name the error field `err`** — Pino serializes `Error` objects under this
   key automatically.
6. **Log at the boundary** — log where errors are caught, not where they are
   thrown. This prevents duplicate log entries.

```typescript
// ❌ BAD — string interpolation, no structure
request.log.error(`Failed to fetch user ${userId}: ${error.message}`);

// ✅ GOOD — structured fields
request.log.error({ err: error, userId }, "failed to fetch user");
```

### Log Levels for Errors

| Level   | When to Use                                                 |
| ------- | ----------------------------------------------------------- |
| `fatal` | Process must exit — unrecoverable state                     |
| `error` | Unexpected failure — 5xx errors, unhandled exceptions       |
| `warn`  | Expected failure — 4xx errors, validation failures, retries |
| `info`  | Normal operations — request completed, task finished        |

---

## Development vs Production

### Development Error Overlay

In development mode, Scratchy provides a detailed error overlay that shows:

- Full error message and stack trace
- Source code context with the error location highlighted
- Request details (URL, method, headers, body)
- Component tree showing where the error occurred

```typescript
// plugins/app/dev-errors.ts
import fp from "fastify-plugin";

export default fp(async function devErrors(fastify) {
  if (process.env.NODE_ENV !== "production") {
    fastify.addHook("onError", async (request, reply, error) => {
      // In development, attach extra debug info to the response
      reply.header(
        "x-error-code",
        (error as { code?: string }).code ?? "UNKNOWN",
      );
      reply.header("x-error-type", error.constructor.name);
    });
  }
});
```

### Production Error Display

In production, never expose internal details:

```typescript
// server.ts
const isDev = process.env.NODE_ENV !== "production";

server.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "request error");

  return reply.status(error.statusCode ?? 500).send({
    error: {
      code: (error as { code?: string }).code ?? "INTERNAL_SERVER_ERROR",
      message: isDev ? error.message : "An unexpected error occurred",
      statusCode: error.statusCode ?? 500,
      // Only include stack traces in development
      ...(isDev && { stack: error.stack }),
    },
  });
});
```

### Error Page Rendering by Environment

```tsx
// components/error-display.tsx
import { component$ } from "@builder.io/qwik";

interface ErrorDisplayProps {
  statusCode: number;
  message: string;
  stack?: string;
}

export const ErrorDisplay = component$<ErrorDisplayProps>(
  ({ statusCode, message, stack }) => {
    const isDev = import.meta.env.DEV;

    return (
      <div class="mx-auto max-w-3xl px-4 py-16">
        <div class="text-center">
          <h1 class="text-6xl font-bold text-gray-900 dark:text-white">
            {statusCode}
          </h1>
          <p class="mt-4 text-lg text-gray-600 dark:text-gray-400">{message}</p>
        </div>

        {isDev && stack && (
          <pre class="mt-8 overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100">
            <code>{stack}</code>
          </pre>
        )}

        <div class="mt-8 text-center">
          <a
            href="/"
            class="bg-primary-600 hover:bg-primary-700 inline-block rounded-lg px-6 py-3 text-white"
          >
            Go Home
          </a>
        </div>
      </div>
    );
  },
);
```

---

## Graceful Shutdown and Fatal Errors

### Graceful Shutdown

Use `close-with-grace` to handle process signals and drain connections:

```typescript
// server.ts
import closeWithGrace from "close-with-grace";

closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
  if (err) {
    server.log.error(err, "server closing due to error");
  }
  server.log.info({ signal }, "shutting down gracefully");
  await server.close();
});
```

> **Critical:** Never call `closeWithGrace()` inside a
> `process.on('uncaughtException')` handler. The `close-with-grace` library
> already handles uncaught exceptions internally.

### Fatal Error Recovery

For errors so severe the process cannot continue, log and exit:

```typescript
// Handled by close-with-grace automatically, but for truly fatal situations:
process.on("unhandledRejection", (reason) => {
  // close-with-grace intercepts this. If it doesn't, force exit:
  server.log.fatal({ err: reason }, "unhandled rejection — shutting down");
  process.exit(1);
});
```

---

## Best Practices

1. **Use `createError()` for all thrown errors** — ensures consistent structure
   and serialization across the stack.

2. **Use `ErrorResponse` for expected non-200 outcomes** — when a non-success
   status is a normal return value, not an exception.

3. **Catch errors at the boundary, not at every level** — let errors propagate
   up to the appropriate handler. Avoid try/catch blocks that silently swallow
   errors.

4. **Always include `cause`** — when re-throwing or wrapping errors, pass the
   original error as `cause` for debugging:

   ```typescript
   throw createError({
     statusCode: 502,
     message: "Payment gateway unavailable",
     cause: originalError,
   });
   ```

5. **Map database errors to HTTP errors** — use `handleDatabaseError()` to
   translate PostgreSQL error codes into user-friendly `AppError` instances.

6. **Log once at the boundary** — do not log the same error at multiple layers.
   Log it where it is caught and handled.

7. **Use type guards** — always check error types with `isAppError()`,
   `isRouteErrorResponse()`, and `isPostgresError()` instead of `instanceof`
   across module boundaries (which can fail with different module instances).

8. **Never expose stack traces in production** — gate stack trace inclusion
   behind `NODE_ENV !== "production"`.

9. **Provide actionable error messages** — tell the user what happened and what
   they can do about it, not internal implementation details.

10. **Test error paths** — write tests for error cases, not just happy paths.
    Verify that correct status codes, error codes, and messages are returned.

---

## Anti-Patterns

### ❌ Don't silently swallow errors

```typescript
// BAD — Error is lost
try {
  await riskyOperation();
} catch {
  // do nothing
}

// GOOD — Log or re-throw
try {
  await riskyOperation();
} catch (error) {
  request.log.error({ err: error }, "risky operation failed");
  throw createError({
    statusCode: 500,
    message: "Operation failed",
    cause: error,
  });
}
```

### ❌ Don't throw plain strings or objects

```typescript
// BAD — No stack trace, no structure
throw "Something went wrong";
throw { message: "error" };

// GOOD — Structured error
throw createError({ statusCode: 500, message: "Something went wrong" });
```

### ❌ Don't expose internal details to clients

```typescript
// BAD — Leaks table name and query
throw new TRPCError({
  code: "INTERNAL_SERVER_ERROR",
  message: `SELECT * FROM users WHERE id = '${id}' failed: connection refused`,
});

// GOOD — Generic message, details logged server-side
request.log.error({ err: dbError, userId: id }, "user query failed");
throw new TRPCError({
  code: "INTERNAL_SERVER_ERROR",
  message: "Failed to load user data",
});
```

### ❌ Don't use `any` in error handlers

```typescript
// BAD
} catch (error: any) {
  console.log(error.message);
}

// GOOD — Use unknown and narrow
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  request.log.error({ err: error }, message);
}
```

### ❌ Don't mix async/await with done() callbacks in Fastify hooks

```typescript
// BAD — Causes double response
fastify.addHook("onError", async (request, reply, error, done) => {
  done();
});

// GOOD
fastify.addHook("onError", async (request, reply, error) => {
  request.log.error({ err: error }, "hook error");
});
```

### ❌ Don't catch errors too early

```typescript
// BAD — Catches at the wrong layer, loses context
async function getUser(id: string) {
  try {
    return await findUserById.execute({ id });
  } catch {
    return null; // Caller has no idea an error occurred
  }
}

// GOOD — Let it propagate to the handler
async function getUser(id: string) {
  return findUserById.execute({ id });
}
```

---

## Reference Links

- [Fastify Error Handling](https://fastify.dev/docs/latest/Reference/Errors/)
- [tRPC Error Handling](https://trpc.io/docs/server/error-handling)
- [Qwik Error Boundaries](https://qwik.dev/docs/)
- [Drizzle ORM Error Handling](https://orm.drizzle.team/docs/overview)
- [Piscina Error Handling](https://github.com/piscinajs/piscina#errors)
- [PostgreSQL Error Codes](https://www.postgresql.org/docs/current/errcodes-appendix.html)
- [Pino Logger](https://getpino.io/)
- [close-with-grace](https://github.com/fastify/close-with-grace)
- [Node.js Error Handling Best Practices](https://nodejs.org/api/errors.html)
