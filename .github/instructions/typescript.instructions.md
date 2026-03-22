---
name: typescript-node
description:
  "Guides TypeScript configuration and patterns for the Scratchy framework's
  Node.js server code. Use when configuring tsconfig.json, setting up type
  stripping, writing TypeScript for Node.js, handling module resolution, or
  applying strict typing patterns. Trigger terms: TypeScript, tsconfig, type
  stripping, strict mode, ESM, module resolution, import type, const enum, type
  guard."
metadata:
  tags: typescript, node, tsconfig, type-stripping, esm, strict
applyTo: "**/*.ts,**/tsconfig.json"
---

# TypeScript in Scratchy

## When to Use

Use these patterns when:

- Configuring TypeScript for the project
- Writing server-side TypeScript code
- Setting up Node.js type stripping (Node.js 22.6+)
- Resolving import/module issues
- Applying strict typing patterns

## Type Stripping for Node.js

Scratchy uses **type stripping** (Node.js 22.6+) to run TypeScript directly
without a build step. Type annotations are removed at runtime without
transpilation.

### Key Requirements

```typescript
// ✅ Use `import type` for type-only imports
import type { FastifyInstance } from "fastify";
import type { User } from "~/db/schema/user.js";

// ✅ Use const objects instead of enums
const UserRole = {
  MEMBER: "member",
  ADMIN: "admin",
} as const;
type UserRole = (typeof UserRole)[keyof typeof UserRole];

// ❌ Never use enums (not compatible with type stripping)
// enum UserRole { MEMBER = "member", ADMIN = "admin" }

// ❌ Never use namespaces
// namespace Utils { ... }

// ❌ Never use parameter properties
// constructor(private name: string) { }
```

### Running TypeScript Directly

```bash
# Run a TypeScript file directly with Node.js
node server.ts

# Or with explicit flag (older Node.js versions)
node --experimental-strip-types server.ts
```

## TypeScript Configuration

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": false,
    "paths": {
      "~/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "drizzle"]
}
```

### Key Configuration Choices

| Option                     | Value        | Reason                                       |
| -------------------------- | ------------ | -------------------------------------------- |
| `strict`                   | `true`       | Maximum type safety                          |
| `noEmit`                   | `true`       | Type stripping, no compilation needed        |
| `verbatimModuleSyntax`     | `true`       | Forces `import type` for type-only imports   |
| `noUncheckedIndexedAccess` | `true`       | Array/object access returns `T \| undefined` |
| `module`                   | `"NodeNext"` | Native ESM support with `.js` extensions     |
| `isolatedModules`          | `true`       | Required for type stripping compatibility    |

## Import Conventions

### Server-Side (Node.js ESM)

```typescript
// ✅ Always use .js extension for local imports in server code
// ✅ npm packages don't need extensions
import Fastify from "fastify";
import { readFile } from "node:fs/promises";
// ✅ Node.js built-ins use node: prefix
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { z } from "zod";
import { db } from "~/db/index.js";
import { createUser } from "~/db/mutations/users.js";
import { user } from "~/db/schema/user.js";
```

### Client-Side (Vite)

```typescript
// ✅ Omit extensions in client code (Vite resolves them)
import { Greeting } from "~/components/greeting";
import { trpc } from "~/lib/trpc.client";
```

## Strict Typing Patterns

### Eliminating `any`

```typescript
// ❌ BAD
function processData(data: any): any {
  return data.value;
}

// ✅ GOOD — Use generics
function processData<T extends { value: unknown }>(data: T): T["value"] {
  return data.value;
}

// ✅ GOOD — Use unknown with type guards
function processData(data: unknown): string {
  if (typeof data === "object" && data !== null && "value" in data) {
    return String((data as { value: unknown }).value);
  }
  throw new Error("Invalid data shape");
}
```

### Type Guards

```typescript
// Runtime type guard
function isUser(value: unknown): value is User {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "email" in value &&
    typeof (value as User).id === "string" &&
    typeof (value as User).email === "string"
  );
}

// Usage
const data: unknown = await response.json();
if (!isUser(data)) {
  throw new Error("Invalid user data");
}
// data is typed as User here
```

### Const Assertions and Derived Types

```typescript
// Define constants with as const
const HTTP_STATUS = {
  OK: 200,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
} as const;

// Derive type from constant
type HttpStatus = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];
// HttpStatus = 200 | 404 | 500

// Useful for config objects
const ROUTES = {
  HOME: "/",
  ABOUT: "/about",
  BLOG: "/blog",
} as const;

type Route = (typeof ROUTES)[keyof typeof ROUTES];
```

### Type Exports

```typescript
// Export inferred types from functions
export type AllUsers = Awaited<ReturnType<typeof findAllUsers.execute>>;
export type UserById = Awaited<ReturnType<typeof findUserById.execute>>[0];

// Export types from Drizzle schemas
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
```

### Branded Types for IDs

```typescript
// Prevent mixing up different ID types
type Brand<T, B> = T & { __brand: B };

type UserId = Brand<string, "UserId">;
type PostId = Brand<string, "PostId">;

function getUser(id: UserId): Promise<User> {
  /* ... */
}
function getPost(id: PostId): Promise<Post> {
  /* ... */
}

// Usage
const userId = ulid() as UserId;
const postId = ulid() as PostId;

getUser(userId); // ✅
getUser(postId); // ❌ Type error — can't pass PostId as UserId
```

## Utility Patterns

### Result Type for Error Handling

```typescript
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

async function safeOperation<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
```

### Strict Object Key Access

```typescript
// Safe property access with noUncheckedIndexedAccess
function getEnvVar(key: string): string {
  const value = process.env[key]; // string | undefined
  if (value === undefined) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}
```

## Anti-Patterns

### ❌ Don't use enums

```typescript
// BAD — Not compatible with type stripping
enum Status {
  Active = "active",
  Inactive = "inactive",
}

// GOOD — Use const objects
const Status = {
  Active: "active",
  Inactive: "inactive",
} as const;
type Status = (typeof Status)[keyof typeof Status];
```

### ❌ Don't use `async` without `await`

The `async` keyword wraps the return value in a Promise (extra allocation per
call). Only add `async` when `await` is actually used inside the function body.
Otherwise, use a regular ES5 function declaration or expression.

```typescript
// BAD — unnecessary async, extra Promise allocation
async function getHealth() {
  return { status: "ok" };
}

// GOOD — no await needed, use regular function
function getHealth() {
  return { status: "ok" };
}

// BAD — async arrow without await
const handler = async (request: FastifyRequest) => {
  return { user: request.user };
};

// GOOD — regular arrow function
const handler = (request: FastifyRequest) => {
  return { user: request.user };
};

// GOOD — async is correct here because await is used
async function getUser(id: string) {
  const user = await findUserById.execute({ id });
  return user;
}
```

### ❌ Don't use `isNaN()` — use `Number.isNaN()` instead

The global `isNaN()` coerces its argument to a number before checking, which
leads to surprising results (e.g. `isNaN("hello")` is `true`). `Number.isNaN()`
performs no coercion and only returns `true` for the actual IEEE 754 `NaN`
value.

```typescript
// BAD — coerces the argument, produces unexpected results
if (isNaN(value)) { ... }

// GOOD — strict check, no coercion
if (Number.isNaN(value)) { ... }
```

### ❌ Don't suppress TypeScript errors

```typescript
// BAD
// @ts-ignore
// @ts-expect-error
const value = someFunction() as any;

// GOOD — Fix the type issue properly
const value: ExpectedType = someFunction();
```

## Validation — Mandatory Before Every Commit

Run **all four steps** before committing — CI rejects on any failure:

```bash
pnpm format                        # Prettier — fix code formatting
pnpm lint                          # ESLint — catch lint errors
pnpm typecheck                     # tsc --noEmit — catch type errors across all packages
pnpm build                         # Build all packages

# Or as a single command chain:
pnpm format && pnpm lint && pnpm typecheck && pnpm build
```

`pnpm typecheck` runs `tsc --noEmit` across all packages via Turbo. It catches
type errors that tests and linting miss — for example, missing properties on
objects, incorrect type assignments, and unresolved imports.

## Reference Links

- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Node.js Type Stripping](https://nodejs.org/api/typescript.html)
- [TypeScript Strict Mode](https://www.typescriptlang.org/tsconfig#strict)
- [Verbatim Module Syntax](https://www.typescriptlang.org/tsconfig#verbatimModuleSyntax)
- [TypeScript Utility Types](https://www.typescriptlang.org/docs/handbook/utility-types.html)
