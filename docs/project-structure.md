# Project Structure

## Directory Layout

```
scratchy/
├── .github/
│   └── instructions/              # AI coding assistant instruction files
│       ├── react.instructions.md
│       ├── qwik.instructions.md
│       ├── drizzle.instructions.md
│       ├── trpc.instructions.md
│       ├── fastify.instructions.md
│       ├── typescript.instructions.md
│       ├── worker-threads.instructions.md
│       ├── vite.instructions.md
│       └── tailwindcss.instructions.md
├── docs/                          # Framework documentation and guides
├── drizzle/                       # Generated migration files (DO NOT EDIT)
├── src/
│   ├── server.ts                  # Fastify server setup and plugin registration
│   ├── index.ts                   # Application entry point
│   ├── config.ts                  # Environment and configuration loading
│   ├── router.ts                  # tRPC initialization, middleware, procedures
│   ├── context.ts                 # tRPC context creation
│   ├── db/                        # Database layer
│   │   ├── index.ts               # Drizzle instance and connection pool
│   │   ├── my-schema.ts           # PostgreSQL schema namespace
│   │   ├── schema/                # Table definitions (one file per entity)
│   │   │   ├── index.ts           # Barrel export of all schemas
│   │   │   ├── columns.helpers.ts # Shared column definitions (timestamps)
│   │   │   ├── user.ts            # User, account, session tables
│   │   │   ├── post.ts            # Posts table
│   │   │   └── ...                # Additional entity schemas
│   │   ├── queries/               # Module-scoped prepared statements
│   │   │   ├── users.ts
│   │   │   └── posts.ts
│   │   └── mutations/             # Write operations
│   │       ├── users.ts
│   │       └── posts.ts
│   │
│   ├── routers/                   # tRPC routers (internal API)
│   │   ├── index.ts               # Aggregate all routers into appRouter
│   │   ├── users/
│   │   │   ├── queries.ts         # User query procedures
│   │   │   └── mutations.ts       # User mutation procedures
│   │   └── posts/
│   │       ├── queries.ts
│   │       └── mutations.ts
│   │
│   ├── routes/                    # Fastify REST routes (external API)
│   │   ├── health/
│   │   │   └── index.ts           # GET /health
│   │   └── external/
│   │       └── api/
│   │           └── v1/
│   │               └── products/
│   │                   └── index.ts  # REST endpoints with CORS
│   │
│   ├── plugins/                   # Fastify plugins
│   │   ├── external/              # Third-party plugins
│   │   │   ├── cors.ts            # CORS configuration
│   │   │   ├── helmet.ts          # Security headers
│   │   │   └── rate-limit.ts      # Rate limiting
│   │   └── app/                   # Application plugins
│   │       ├── database.ts        # Database connection
│   │       ├── cache.ts           # Redis cache
│   │       ├── auth.ts            # Authentication
│   │       └── worker-pool.ts     # Piscina worker pool
│   │
│   ├── hooks/                     # Fastify lifecycle hooks
│   │   └── request-timer.ts       # Request duration logging
│   │
│   ├── renderer/                  # Worker Thread rendering
│   │   ├── pool.ts                # Piscina pool configuration
│   │   ├── worker.ts              # Worker entry point
│   │   └── templates/             # HTML shell templates
│   │       └── index.html
│   │
│   ├── client/                    # Client-side code (bundled by Vite)
│   │   ├── entry.ts               # Client entry point
│   │   ├── components/            # UI components
│   │   │   ├── qwik/              # Pure Qwik components
│   │   │   ├── react/             # React components (with qwikify$ wrappers)
│   │   │   └── shared/            # Shared types and utilities
│   │   ├── routes/                # File-based routing (Qwik City)
│   │   │   ├── layout.tsx         # Root layout
│   │   │   ├── index.tsx          # Home page (/)
│   │   │   ├── error.tsx          # Root error boundary (catches unhandled errors)
│   │   │   ├── not-found.tsx      # 404 page
│   │   │   ├── global-error.tsx   # Fatal error page (root layout failures)
│   │   │   ├── admin/
│   │   │   │   ├── layout.tsx     # Admin layout (with onRequest auth guard)
│   │   │   │   ├── index.tsx      # Admin dashboard
│   │   │   │   ├── loading.tsx    # Loading skeleton for admin section
│   │   │   │   └── error.tsx      # Error boundary for admin section
│   │   │   └── [slug]/
│   │   │       └── index.tsx      # Dynamic routes
│   │   ├── styles/                # Tailwind CSS
│   │   │   └── global.css
│   │   └── lib/                   # Client utilities
│   │       ├── trpc.client.ts     # tRPC client configuration
│   │       └── utils.ts           # Shared utilities
│   │
│   ├── lib/                       # Shared server utilities
│   │   ├── cache.ts               # async-cache-dedupe with Redis
│   │   ├── constants.ts           # Time, size, and other constants
│   │   ├── errors.ts              # createError(), ErrorResponse, notFound()
│   │   ├── logging.ts             # Pino logger configuration
│   │   ├── session.ts             # createCookie(), createSessionStorage()
│   │   └── worker-redis.ts        # Redis-based worker communication
│   │
│   └── types/                     # TypeScript type augmentations
│       └── fastify.d.ts           # Fastify module augmentation
│
├── public/                        # Static assets (served by Vite)
│   ├── favicon.ico
│   └── robots.txt
│
├── templates/                     # CLI scaffolding templates
│   ├── model.ts.hbs
│   ├── router.ts.hbs
│   ├── route.ts.hbs
│   └── component.tsx.hbs
│
├── tests/                         # Integration and E2E tests
│   ├── integration/
│   └── e2e/
│
├── AGENTS.md                      # AI agent guidance
├── LICENSE                        # MIT License
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── drizzle.config.ts
└── .gitignore
```

## Naming Conventions

### Files and Folders

- **All files and folders use kebab-case** (hyphenated lowercase)
  - ✅ `user-profile.tsx`, `api-router.ts`, `worker-pool.ts`
  - ❌ `UserProfile.tsx`, `apiRouter.ts`, `workerPool.ts`

### Code

| Element           | Convention    | Example                                    |
| ----------------- | ------------- | ------------------------------------------ |
| Files/Folders     | kebab-case    | `user-profile.tsx`, `db-queries/`          |
| Components        | PascalCase    | `UserProfile`, `NavigationBar`             |
| Variables         | camelCase     | `userName`, `isAuthenticated`              |
| Functions         | camelCase     | `createUser`, `findPostById`               |
| Constants         | UPPER_SNAKE   | `MAX_RETRIES`, `DEFAULT_TIMEOUT`           |
| DB Tables/Columns | snake_case    | `user_profile`, `created_at`               |
| Types/Interfaces  | PascalCase    | `User`, `PostCreateInput`                  |
| Enums (const obj) | PascalCase    | `UserRole`, `PostStatus`                   |

### Import Conventions

| Context             | Extension Rule                  | Example                              |
| ------------------- | ------------------------------- | ------------------------------------ |
| Server (Node.js)    | Always use `.js` extension      | `import { db } from "~/db/index.js"` |
| Client (Vite)       | Omit extensions                 | `import { Button } from "~/components/button"` |
| Node.js built-ins   | Use `node:` prefix              | `import { join } from "node:path"`   |
| npm packages        | No extension                    | `import Fastify from "fastify"`      |

## Key File Responsibilities

### Entry Points

| File                | Purpose                                     |
| ------------------- | ------------------------------------------- |
| `src/index.ts`      | Application bootstrap (starts server)       |
| `src/server.ts`     | Fastify server creation and configuration   |
| `src/client/entry.ts` | Client-side application entry             |
| `src/renderer/worker.ts` | Worker thread entry point              |

### Configuration Files

| File                   | Purpose                                    |
| ---------------------- | ------------------------------------------ |
| `tsconfig.json`        | TypeScript compiler options                |
| `vite.config.ts`       | Vite bundler configuration                 |
| `tailwind.config.ts`   | Tailwind CSS theme and plugins             |
| `drizzle.config.ts`    | Drizzle Kit migration configuration        |
| `src/config.ts`        | Runtime environment configuration          |

### Type Augmentations

| File                    | Purpose                                   |
| ----------------------- | ----------------------------------------- |
| `src/types/fastify.d.ts` | Extends Fastify types with decorators   |

## Route File Conventions

Scratchy uses special file names in `src/client/routes/` inspired by Next.js App
Router and Qwik City conventions:

| File              | Purpose                                              | Pattern Source |
| ----------------- | ---------------------------------------------------- | -------------- |
| `index.tsx`       | Page component for the route                         | Qwik City      |
| `layout.tsx`      | Shared layout wrapping child routes                  | Qwik City      |
| `loading.tsx`     | Loading skeleton shown while page data loads         | Next.js        |
| `error.tsx`       | Error boundary for the route segment                 | Next.js        |
| `not-found.tsx`   | 404 page when `notFound()` is thrown                 | Next.js        |
| `global-error.tsx`| Fatal error fallback (root layout failure)           | Next.js        |

### Route Module Exports

Route files (`index.tsx`, `layout.tsx`) can export special functions:

```typescript
// Data loading (runs on server before render)
export const useProductData = routeLoader$(async (event) => {
  return await findProductById.execute({ id: event.params.id });
});

// Server actions (handle form submissions)
export const useAddToCart = routeAction$(
  async (data, event) => { /* ... */ },
  zod$({ productId: z.string(), quantity: z.number().min(1) }),
);

// Middleware (runs before loader/action)
export const onRequest: RequestHandler = async (event) => {
  // Authentication, logging, etc.
  await event.next();
};

// HTTP method-specific middleware
export const onGet: RequestHandler = async (event) => { /* ... */ };
export const onPost: RequestHandler = async (event) => { /* ... */ };

// Page metadata
export const head: DocumentHead = {
  title: "Product Page",
  meta: [{ name: "description", content: "Product details" }],
};
```

## Adding New Features

### Adding a New Database Entity

1. Create schema: `src/db/schema/<entity>.ts`
2. Export from barrel: `src/db/schema/index.ts`
3. Create queries: `src/db/queries/<entity>.ts`
4. Create mutations: `src/db/mutations/<entity>.ts`
5. Create tRPC router: `src/routers/<entity>/queries.ts` + `mutations.ts`
6. Register router: `src/routers/index.ts`
7. Generate migration: `pnpm drizzle-kit generate`

### Adding a New tRPC Router

1. Create directory: `src/routers/<domain>/`
2. Create `queries.ts` with query procedures
3. Create `mutations.ts` with mutation procedures
4. Register in `src/routers/index.ts`

### Adding a New REST Endpoint

1. Create directory: `src/routes/external/api/v1/<resource>/`
2. Create `index.ts` with route handlers
3. Register CORS if needed for cross-origin access

### Adding a New Qwik Page

1. Create file in `src/client/routes/<path>/index.tsx`
2. Export default component using `component$()`
3. Add `routeLoader$` for data loading if needed
4. Add `routeAction$` for form handling if needed
5. Add `onRequest` middleware for auth guards if needed
6. Optionally add `loading.tsx` for streaming skeleton
7. Optionally add `error.tsx` for error boundary

### Adding Middleware to a Route

1. Export `onRequest` from a `layout.tsx` or `index.tsx` file
2. Use `event.sharedMap` to pass data to loaders and components
3. Call `event.next()` to continue the chain
4. Throw `event.redirect()` to redirect
5. See [middleware.md](middleware.md) for full patterns

### Adding a New Component

1. **Qwik component**: `src/client/components/qwik/<name>.tsx`
2. **React component**: `src/client/components/react/<name>.tsx` (with `qwikify$` wrapper)

### Adding a New Fastify Plugin

1. Create file in `src/plugins/app/<name>.ts` or `src/plugins/external/<name>.ts`
2. Wrap with `fp()` from `fastify-plugin`
3. Add TypeScript augmentation in `src/types/fastify.d.ts` if adding decorators
