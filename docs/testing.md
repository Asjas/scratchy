# Testing

This guide covers the testing strategy, tools, patterns, and best practices for
Scratchy applications. It draws on proven approaches from Remix, Qwik City,
Next.js, Nuxt, SolidStart, and RedwoodJS — adapted for Scratchy's server-first,
worker-based architecture.

## Testing Philosophy

Scratchy follows the **testing pyramid** strategy:

```
        ╱╲
       ╱ E2E ╲          Few — slow, high confidence
      ╱────────╲
     ╱Integration╲      Some — moderate speed, good confidence
    ╱──────────────╲
   ╱   Unit Tests    ╲   Many — fast, focused, high coverage
  ╱────────────────────╲
```

| Layer       | Tools                   | What to Test                                     |
| ----------- | ----------------------- | ------------------------------------------------ |
| Unit        | Vitest                  | Functions, type guards, utilities, routers       |
| Integration | Vitest + Fastify inject | HTTP cycles, tRPC client ↔ server, DB operations |
| Component   | Vitest + `createDOM`    | Qwik components, forms, qwikified React          |
| E2E         | Cypress                 | Auth flows, navigation, full user journeys       |

**Guiding principles:**

1. **Test behavior, not implementation** — assert on outputs and side effects,
   not internal details.
2. **Isolate the layer under test** — unit tests should not require a database
   or running server.
3. **Use real dependencies when cheap** — prefer `fastify.inject()` over mocks
   for HTTP tests; prefer a test database over mocking Drizzle.
4. **Keep tests deterministic** — use transactions for database isolation, fixed
   timestamps, and seeded data.
5. **Co-locate tests with source** — place `*.test.ts` files next to the code
   they exercise.

---

## Tools

| Tool                    | Purpose                                           |
| ----------------------- | ------------------------------------------------- |
| **Vitest**              | Unit, integration, and component tests            |
| **Node.js Test Runner** | Lightweight alternative for pure-logic unit tests |
| **Cypress**             | End-to-end browser testing                        |
| **Testing Library**     | DOM assertions for component tests                |
| **@qwik/testing**       | `createDOM` for Qwik component rendering          |
| **fastify.inject()**    | In-process HTTP testing without a live server     |
| **superjson**           | tRPC transformer in test clients                  |

---

## Test Organization

### File Structure

```
src/
├── lib/
│   ├── format-date.ts
│   └── format-date.test.ts          # Co-located unit test
├── routers/
│   └── users/
│       ├── queries.ts
│       ├── queries.test.ts           # tRPC query tests
│       ├── mutations.ts
│       └── mutations.test.ts         # tRPC mutation tests
├── routes/
│   └── external/
│       └── api/
│           └── v1/
│               └── products/
│                   ├── index.ts
│                   └── index.test.ts # REST route tests
├── plugins/
│   └── app/
│       ├── auth.ts
│       └── auth.test.ts              # Plugin / middleware tests
├── db/
│   └── queries/
│       ├── users.ts
│       └── users.test.ts             # Prepared-statement tests
├── renderer/
│   ├── worker.ts
│   └── worker.test.ts                # Worker task tests
├── client/
│   └── components/
│       ├── qwik/
│       │   ├── counter.tsx
│       │   └── counter.test.tsx      # Qwik component tests
│       └── react/
│           ├── chart.tsx
│           └── chart.test.tsx        # React interop tests
tests/
├── helpers/
│   ├── create-test-server.ts         # Shared Fastify helper
│   ├── create-test-database.ts       # Isolated DB helper
│   ├── create-test-context.ts        # tRPC context helper
│   └── mock-session.ts              # Session / auth mocking
├── fixtures/
│   └── users.ts                      # Seed data
├── e2e/
│   ├── auth.cy.ts                    # Cypress E2E specs
│   ├── navigation.cy.ts
│   └── forms.cy.ts
└── setup.ts                          # Global test setup
```

### Naming Conventions

| Pattern            | Example                 |
| ------------------ | ----------------------- |
| Unit / integration | `queries.test.ts`       |
| Component          | `counter.test.tsx`      |
| E2E (Cypress)      | `auth.cy.ts`            |
| Test helpers       | `create-test-server.ts` |
| Fixtures           | `fixtures/users.ts`     |

All filenames use **kebab-case**.

---

## Configuration

### Vitest Config

```typescript
// vitest.config.ts
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/db/my-schema.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
```

### Global Setup

```typescript
// tests/setup.ts
import { afterAll, afterEach, beforeAll } from "vitest";

beforeAll(async () => {
  // Shared setup — e.g., start test database container
});

afterEach(() => {
  // Reset mocks between tests
  vi.restoreAllMocks();
});

afterAll(async () => {
  // Shared teardown
});
```

### Cypress Config

```typescript
// cypress.config.ts
import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:5000",
    specPattern: "tests/e2e/**/*.cy.ts",
    supportFile: "tests/e2e/support/index.ts",
    video: false,
    screenshotOnRunFailure: true,
    viewportWidth: 1280,
    viewportHeight: 720,
    defaultCommandTimeout: 10_000,
  },
});
```

---

## Test Utilities

The helpers below eliminate boilerplate and enforce isolation across every test
suite. Place them under `tests/helpers/`.

### createTestServer()

Builds a fully-configured Fastify instance **without** opening a port, so tests
use `fastify.inject()` instead of real HTTP. Inspired by Remix's approach of
testing with real request/response objects.

```typescript
// tests/helpers/create-test-server.ts
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { createContext } from "~/context.js";
import { appRouter } from "~/routers/index.js";

interface TestServerOptions {
  authenticate?: boolean;
  user?: { id: string; role: string };
}

export async function createTestServer(
  options: TestServerOptions = {},
): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });

  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  // Decorate request with a test user when authentication is enabled
  if (options.authenticate) {
    server.decorateRequest("user", null);
    server.addHook("onRequest", async (request) => {
      request.user = options.user ?? { id: "test-user-id", role: "member" };
    });
  }

  // Register tRPC
  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext,
    },
  });

  // Register application routes
  await server.register(import("~/routes/external/api/v1/products/index.js"), {
    prefix: "/external/api/v1/products",
  });

  await server.ready();
  return server;
}
```

### createTestDatabase()

Wraps every test in a transaction that rolls back at the end, giving each test a
clean database state without needing to truncate tables. Modeled after the
SolidStart pattern of testing server functions against a real database without
bundling.

```typescript
// tests/helpers/create-test-database.ts
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/scratchy_test";

let pool: Pool | undefined;

export async function getTestPool(): Promise<Pool> {
  if (!pool) {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
  }
  return pool;
}

export async function createTestDatabase(): Promise<{
  db: NodePgDatabase;
  cleanup: () => Promise<void>;
}> {
  const testPool = await getTestPool();
  const client = await testPool.connect();

  // Start a transaction that will be rolled back after the test
  await client.query("BEGIN");

  const db = drizzle({ client, casing: "snake_case" });

  return {
    db,
    cleanup: async () => {
      await client.query("ROLLBACK");
      client.release();
    },
  };
}

export async function teardownTestPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
```

### createTestContext()

Creates a tRPC context for calling procedures directly — no HTTP layer needed.
Inspired by Remix's pattern of testing loaders and actions in isolation.

```typescript
// tests/helpers/create-test-context.ts
import type { Context } from "~/context.js";

interface TestContextOptions {
  user?: { id: string; email: string; role: string } | null;
}

export function createTestContext(options: TestContextOptions = {}): Context {
  const user = options.user ?? null;

  return {
    request: {
      headers: { "content-type": "application/json" },
      url: "/trpc/test",
      method: "POST",
    } as Context["request"],
    reply: {
      header: () => undefined,
      status: () => undefined,
    } as unknown as Context["reply"],
    user,
    hasRole: (role: string) => user?.role === role,
  };
}
```

### mockSession()

Provides an authenticated or unauthenticated session for tests that depend on
user state. Inspired by Nuxt's `mockNuxtImport()` pattern.

```typescript
// tests/helpers/mock-session.ts
import { vi } from "vitest";

interface MockUser {
  id: string;
  email: string;
  name: string;
  role: "member" | "admin";
}

const defaultUser: MockUser = {
  id: "user-01JTEST000000000000000000",
  email: "test@example.com",
  name: "Test User",
  role: "member",
};

export function mockSession(overrides: Partial<MockUser> = {}): MockUser {
  return { ...defaultUser, ...overrides };
}

export function mockAdminSession(overrides: Partial<MockUser> = {}): MockUser {
  return mockSession({ role: "admin", ...overrides });
}

export function mockUnauthenticated(): null {
  return null;
}

/**
 * Patches the auth module so that `getSession()` returns the given user.
 * Call inside `beforeEach` and let `vi.restoreAllMocks()` clean up.
 */
export function stubAuth(user: MockUser | null = defaultUser) {
  vi.mock("~/plugins/app/auth.js", () => ({
    getSession: vi.fn().mockResolvedValue(user ? { user } : null),
  }));
}
```

---

## Unit Tests

### Testing Utility Functions and Type Guards

Pure functions are the cheapest tests to write. No server, no database.

```typescript
// src/lib/format-date.test.ts
import { formatDate, isValidDateString } from "./format-date.js";
import { describe, expect, it } from "vitest";

describe("formatDate", () => {
  it("formats an ISO date to a readable string", () => {
    const result = formatDate("2025-06-15T10:30:00Z");

    expect(result).toBe("June 15, 2025");
  });

  it("returns 'Invalid Date' for garbage input", () => {
    const result = formatDate("not-a-date");

    expect(result).toBe("Invalid Date");
  });
});

describe("isValidDateString", () => {
  it("returns true for a valid ISO string", () => {
    expect(isValidDateString("2025-01-01T00:00:00Z")).toBe(true);
  });

  it("returns false for an empty string", () => {
    expect(isValidDateString("")).toBe(false);
  });

  it("narrows the type when used as a guard", () => {
    const input: unknown = "2025-01-01";
    if (isValidDateString(input)) {
      // TypeScript knows `input` is a string here
      expect(input.toUpperCase()).toBeDefined();
    }
  });
});
```

### Testing tRPC Routers in Isolation

Call procedures directly with a test context — no HTTP overhead. This mirrors
how Remix tests loaders and actions by invoking them as plain functions.

```typescript
// src/routers/users/queries.test.ts
import { createCallerFactory } from "@trpc/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createTestContext } from "tests/helpers/create-test-context.js";
import { createTestDatabase } from "tests/helpers/create-test-database.js";
import {
  mockSession,
  mockUnauthenticated,
} from "tests/helpers/mock-session.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "~/routers/index.js";

const createCaller = createCallerFactory(appRouter);

describe("users.getById", () => {
  let db: NodePgDatabase;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ db, cleanup } = await createTestDatabase());
  });

  afterEach(async () => {
    await cleanup();
  });

  it("returns the user when found", async () => {
    const user = mockSession();
    const ctx = createTestContext({ user });
    const caller = createCaller(ctx);

    // Seed the test database
    await db.insert(userTable).values({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    const result = await caller.users.getById({ id: user.id });

    expect(result).toMatchObject({
      id: user.id,
      email: user.email,
    });
  });

  it("throws NOT_FOUND when user does not exist", async () => {
    const ctx = createTestContext({ user: mockSession() });
    const caller = createCaller(ctx);

    await expect(
      caller.users.getById({ id: "nonexistent-id" }),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("throws UNAUTHORIZED when not authenticated", async () => {
    const ctx = createTestContext({ user: mockUnauthenticated() });
    const caller = createCaller(ctx);

    await expect(caller.users.getById({ id: "any-id" })).rejects.toThrow(
      "UNAUTHORIZED",
    );
  });
});
```

### Testing tRPC Mutations

```typescript
// src/routers/users/mutations.test.ts
import { createCallerFactory } from "@trpc/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createTestContext } from "tests/helpers/create-test-context.js";
import { createTestDatabase } from "tests/helpers/create-test-database.js";
import { mockSession } from "tests/helpers/mock-session.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "~/routers/index.js";

const createCaller = createCallerFactory(appRouter);

describe("users.create", () => {
  let db: NodePgDatabase;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ db, cleanup } = await createTestDatabase());
  });

  afterEach(async () => {
    await cleanup();
  });

  it("creates a new user and returns it", async () => {
    const ctx = createTestContext({ user: mockSession({ role: "admin" }) });
    const caller = createCaller(ctx);

    const result = await caller.users.create({
      name: "Jane Doe",
      email: "jane@example.com",
    });

    expect(result).toMatchObject({
      name: "Jane Doe",
      email: "jane@example.com",
    });
    expect(result.id).toBeDefined();
  });

  it("rejects invalid email addresses", async () => {
    const ctx = createTestContext({ user: mockSession() });
    const caller = createCaller(ctx);

    await expect(
      caller.users.create({ name: "Jane", email: "not-an-email" }),
    ).rejects.toThrow();
  });
});
```

### Testing Fastify Routes with `inject()`

Fastify's `inject()` sends an in-process request without a live TCP connection.
This is faster and more deterministic than testing over the network.

```typescript
// src/routes/external/api/v1/products/index.test.ts
import type { FastifyInstance } from "fastify";
import { createTestServer } from "tests/helpers/create-test-server.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("GET /external/api/v1/products", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer({ authenticate: true });
  });

  afterAll(async () => {
    await server.close();
  });

  it("returns a list of products", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/external/api/v1/products",
      query: { page: "1", limit: "10" },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("validates the page parameter", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/external/api/v1/products",
      query: { page: "0" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 404 for an unknown product", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/external/api/v1/products/nonexistent-id",
    });

    expect(response.statusCode).toBe(404);
  });
});
```

### Testing POST / PUT / DELETE Routes

```typescript
describe("POST /external/api/v1/products", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer({
      authenticate: true,
      user: { id: "admin-01", role: "admin" },
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it("creates a product and returns 201", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/external/api/v1/products",
      payload: {
        name: "Widget",
        price: 9.99,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      name: "Widget",
      price: 9.99,
    });
  });

  it("rejects a missing name with 400", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/external/api/v1/products",
      payload: { price: 9.99 },
    });

    expect(response.statusCode).toBe(400);
  });
});
```

### Testing Middleware Functions

Test middleware in isolation by wrapping it in a small Fastify instance.

```typescript
// src/plugins/app/auth.test.ts
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("auth middleware", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify({ logger: false });

    // Register the auth plugin under test
    await server.register(import("~/plugins/app/auth.js"));

    // Add a test route that requires authentication
    server.get("/protected", async (request) => {
      return { userId: request.user?.id ?? null };
    });

    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it("sets request.user when a valid token is provided", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer valid-test-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().userId).toBeDefined();
  });

  it("leaves request.user null when no token is sent", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/protected",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().userId).toBeNull();
  });
});
```

### Testing Drizzle Queries

Test prepared statements against a real PostgreSQL database wrapped in a
transaction.

```typescript
// src/db/queries/users.test.ts
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  createTestDatabase,
  teardownTestPool,
} from "tests/helpers/create-test-database.js";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { user as userTable } from "~/db/schema/user.js";

describe("user queries", () => {
  let db: NodePgDatabase;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ db, cleanup } = await createTestDatabase());
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await teardownTestPool();
  });

  it("inserts and retrieves a user by ID", async () => {
    const id = "user-01JTEST000000000000000001";

    await db.insert(userTable).values({
      id,
      name: "Alice",
      email: "alice@example.com",
      role: "member",
    });

    const [found] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, id));

    expect(found).toMatchObject({
      id,
      name: "Alice",
      email: "alice@example.com",
    });
  });

  it("returns no rows for a missing user", async () => {
    const result = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, "nonexistent"));

    expect(result).toHaveLength(0);
  });

  it("enforces unique email constraint", async () => {
    const email = "unique@example.com";

    await db.insert(userTable).values({
      id: "user-01",
      name: "First",
      email,
      role: "member",
    });

    await expect(
      db.insert(userTable).values({
        id: "user-02",
        name: "Second",
        email,
        role: "member",
      }),
    ).rejects.toThrow();
  });
});
```

---

## Integration Tests

### Full Request/Response Cycle

Test the entire HTTP → Fastify → tRPC → Database pipeline.

```typescript
// tests/integration/user-lifecycle.test.ts
import type { FastifyInstance } from "fastify";
import { createTestServer } from "tests/helpers/create-test-server.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("user lifecycle (integration)", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer({ authenticate: true });
  });

  afterAll(async () => {
    await server.close();
  });

  it("creates, reads, updates, and deletes a user via tRPC", async () => {
    // CREATE
    const createRes = await server.inject({
      method: "POST",
      url: "/trpc/users.create",
      payload: {
        json: { name: "Integration User", email: "int@example.com" },
      },
    });
    expect(createRes.statusCode).toBe(200);
    const { result: createResult } = createRes.json();
    const userId: string = createResult.data.json.id;

    // READ
    const getRes = await server.inject({
      method: "POST",
      url: "/trpc/users.getById",
      payload: { json: { id: userId } },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().result.data.json.name).toBe("Integration User");

    // UPDATE
    const updateRes = await server.inject({
      method: "POST",
      url: "/trpc/users.update",
      payload: {
        json: { id: userId, name: "Updated User" },
      },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().result.data.json.name).toBe("Updated User");

    // DELETE
    const deleteRes = await server.inject({
      method: "POST",
      url: "/trpc/users.delete",
      payload: { json: { id: userId } },
    });
    expect(deleteRes.statusCode).toBe(200);
  });
});
```

### tRPC Client ↔ Server Integration

Test the tRPC client calling the server over HTTP — similar to Remix's real-HTTP
testing approach.

```typescript
// tests/integration/trpc-client.test.ts
import { createTRPCClient, httpBatchStreamLink } from "@trpc/client";
import type { FastifyInstance } from "fastify";
import superjson from "superjson";
import { createTestServer } from "tests/helpers/create-test-server.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppRouter } from "~/routers/index.js";

describe("tRPC client integration", () => {
  let server: FastifyInstance;
  let baseUrl: string;
  let client: ReturnType<typeof createTRPCClient<AppRouter>>;

  beforeAll(async () => {
    server = await createTestServer({ authenticate: true });
    // Start listening on a random port for client tests
    const address = await server.listen({ port: 0, host: "127.0.0.1" });
    baseUrl = address;

    client = createTRPCClient<AppRouter>({
      links: [
        httpBatchStreamLink({
          url: `${baseUrl}/trpc`,
          transformer: superjson,
        }),
      ],
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it("lists users through the tRPC client", async () => {
    const users = await client.users.list.query({ page: 1, limit: 10 });

    expect(Array.isArray(users)).toBe(true);
  });

  it("creates a user through the tRPC client", async () => {
    const user = await client.users.create.mutate({
      name: "Client Test",
      email: "client-test@example.com",
    });

    expect(user.id).toBeDefined();
    expect(user.name).toBe("Client Test");
  });
});
```

### Database Operations with Transaction Isolation

Every test wraps its work in a transaction that rolls back, so tests never
interfere with each other — even when run in parallel.

```typescript
// tests/integration/db-transactions.test.ts
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  createTestDatabase,
  teardownTestPool,
} from "tests/helpers/create-test-database.js";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { user as userTable } from "~/db/schema/user.js";

describe("database transaction isolation", () => {
  let db: NodePgDatabase;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ db, cleanup } = await createTestDatabase());
  });

  afterEach(async () => {
    await cleanup(); // ROLLBACK — no data leaks between tests
  });

  afterAll(async () => {
    await teardownTestPool();
  });

  it("inserts a row visible only within this test", async () => {
    await db.insert(userTable).values({
      id: "isolation-user-01",
      name: "Isolated",
      email: "isolated@example.com",
      role: "member",
    });

    const rows = await db.select().from(userTable);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("does not see the row from the previous test", async () => {
    const rows = await db.select().from(userTable);
    const found = rows.find((r) => r.id === "isolation-user-01");

    expect(found).toBeUndefined();
  });
});
```

### Testing Worker Thread Tasks

Test worker tasks by calling the handler function directly (unit) or through the
Piscina pool (integration).

```typescript
// src/renderer/worker.test.ts
import handler from "./worker.js";
import { describe, expect, it } from "vitest";

describe("worker handler (unit)", () => {
  it("returns rendered HTML for an SSR task", async () => {
    const result = await handler({
      type: "ssr",
      route: "/about",
      props: { title: "About Us" },
    });

    expect(result.statusCode).toBe(200);
    expect(result.html).toContain("About");
    expect(typeof result.head).toBe("string");
  });

  it("returns rendered HTML for an SSG task", async () => {
    const result = await handler({
      type: "ssg",
      route: "/blog/hello",
    });

    expect(result.statusCode).toBe(200);
    expect(result.html).toContain("hello");
  });

  it("throws on an unknown task type", async () => {
    await expect(
      // @ts-expect-error — intentionally testing invalid input
      handler({ type: "invalid", route: "/" }),
    ).rejects.toThrow("Unknown task type");
  });
});
```

#### Integration Test via Piscina Pool

```typescript
// tests/integration/worker-pool.test.ts
import { resolve } from "node:path";
import Piscina from "piscina";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("worker pool (integration)", () => {
  let pool: Piscina;

  beforeAll(() => {
    pool = new Piscina({
      filename: resolve(import.meta.dirname, "../../src/renderer/worker.ts"),
      minThreads: 1,
      maxThreads: 2,
    });
  });

  afterAll(async () => {
    await pool.destroy();
  });

  it("renders a page in a worker thread", async () => {
    const result = await pool.run({
      type: "ssr",
      route: "/",
    });

    expect(result.html).toBeDefined();
    expect(result.statusCode).toBe(200);
  });

  it("handles concurrent render tasks", async () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      pool.run({ type: "ssr", route: `/page-${i}` }),
    );

    const results = await Promise.all(tasks);
    expect(results).toHaveLength(5);
    results.forEach((r) => expect(r.statusCode).toBe(200));
  });
});
```

---

## Component Tests

### Testing Qwik Components

Use Qwik's `createDOM` to render components in a server-like environment, then
assert on the resulting DOM. Inspired by Qwik City's own test patterns.

```typescript
// src/client/components/qwik/counter.test.tsx
import { describe, expect, it } from "vitest";
import { createDOM } from "@builder.io/qwik/testing";
import { Counter } from "./counter";

describe("<Counter />", () => {
  it("renders with an initial count of zero", async () => {
    const { screen, render } = await createDOM();

    await render(<Counter />);

    const paragraph = screen.querySelector("[data-testid='count']");
    expect(paragraph?.textContent).toContain("0");
  });

  it("increments when the button is clicked", async () => {
    const { screen, render, userEvent } = await createDOM();

    await render(<Counter />);

    const button = screen.querySelector("[data-testid='increment']");
    await userEvent(button!, "click");

    const paragraph = screen.querySelector("[data-testid='count']");
    expect(paragraph?.textContent).toContain("1");
  });

  it("displays a custom label when provided", async () => {
    const { screen, render } = await createDOM();

    await render(<Counter label="Items" />);

    expect(screen.innerHTML).toContain("Items");
  });
});
```

### Cell-Style Component Testing

Inspired by RedwoodJS Cells — test the distinct states of a data-fetching
component: **Loading**, **Success**, **Failure**, and **Empty**.

```typescript
// src/client/components/qwik/user-list.test.tsx
import { describe, expect, it } from "vitest";
import { createDOM } from "@builder.io/qwik/testing";
import { UserList } from "./user-list";

describe("<UserList /> cell states", () => {
  it("shows a loading indicator while fetching", async () => {
    const { screen, render } = await createDOM();

    await render(<UserList status="loading" users={[]} error={null} />);

    expect(screen.innerHTML).toContain("Loading");
  });

  it("renders users on success", async () => {
    const { screen, render } = await createDOM();

    await render(
      <UserList
        status="success"
        users={[
          { id: "1", name: "Alice" },
          { id: "2", name: "Bob" },
        ]}
        error={null}
      />,
    );

    expect(screen.innerHTML).toContain("Alice");
    expect(screen.innerHTML).toContain("Bob");
  });

  it("displays an error message on failure", async () => {
    const { screen, render } = await createDOM();

    await render(
      <UserList
        status="error"
        users={[]}
        error="Failed to fetch users"
      />,
    );

    expect(screen.innerHTML).toContain("Failed to fetch users");
  });

  it("shows an empty state when no users exist", async () => {
    const { screen, render } = await createDOM();

    await render(<UserList status="success" users={[]} error={null} />);

    expect(screen.innerHTML).toContain("No users found");
  });
});
```

### Testing React Components Wrapped with qwikify$

Test the underlying React component directly — before the `qwikify$` wrapper —
because Testing Library works natively with React.

```typescript
// src/client/components/react/chart.test.tsx
/** @jsxImportSource react */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Chart } from "./chart";

describe("<Chart /> (React, pre-qwikify)", () => {
  it("renders with the provided data points", () => {
    render(
      <Chart
        data={[
          { label: "Jan", value: 10 },
          { label: "Feb", value: 20 },
        ]}
      />,
    );

    expect(screen.getByText("Jan")).toBeDefined();
    expect(screen.getByText("Feb")).toBeDefined();
  });

  it("shows an empty state when data is an empty array", () => {
    render(<Chart data={[]} />);

    expect(screen.getByText("No data available")).toBeDefined();
  });
});
```

### Testing Form Components and Actions

Test form submission and validation in isolation, following Qwik City's
`routeAction$` testing patterns.

```typescript
// src/client/components/qwik/contact-form.test.tsx
import { describe, expect, it } from "vitest";
import { createDOM } from "@builder.io/qwik/testing";
import { ContactForm } from "./contact-form";

describe("<ContactForm />", () => {
  it("renders all form fields", async () => {
    const { screen, render } = await createDOM();

    await render(<ContactForm />);

    expect(screen.querySelector("input[name='name']")).toBeDefined();
    expect(screen.querySelector("input[name='email']")).toBeDefined();
    expect(screen.querySelector("textarea[name='message']")).toBeDefined();
    expect(screen.querySelector("button[type='submit']")).toBeDefined();
  });

  it("displays validation errors for empty required fields", async () => {
    const { screen, render, userEvent } = await createDOM();

    await render(<ContactForm />);

    const submitButton = screen.querySelector("button[type='submit']");
    await userEvent(submitButton!, "click");

    expect(screen.innerHTML).toContain("Name is required");
    expect(screen.innerHTML).toContain("Email is required");
  });

  it("clears errors after valid input is provided", async () => {
    const { screen, render, userEvent } = await createDOM();

    await render(<ContactForm />);

    const nameInput = screen.querySelector("input[name='name']") as HTMLInputElement;
    const emailInput = screen.querySelector("input[name='email']") as HTMLInputElement;

    // Simulate typing into the fields
    nameInput.value = "Test";
    await userEvent(nameInput, "input");
    emailInput.value = "test@example.com";
    await userEvent(emailInput, "input");

    const submitButton = screen.querySelector("button[type='submit']");
    await userEvent(submitButton!, "click");

    expect(screen.innerHTML).not.toContain("Name is required");
    expect(screen.innerHTML).not.toContain("Email is required");
  });
});
```

### Testing routeLoader$ and routeAction$

Test the server-side functions that back Qwik City data loading and form
actions. Inspired by Remix's pattern of calling loaders and actions directly.

```typescript
// src/client/routes/users/index.test.ts
// Import the loader function (the inner function, not the routeLoader$ wrapper)
import { loadUsers } from "./index.js";
import { describe, expect, it, vi } from "vitest";

// Mock the Drizzle query that the loader calls
vi.mock("~/db/queries/users.js", () => ({
  findAllUsers: {
    execute: vi.fn().mockResolvedValue([
      { id: "1", name: "Alice", email: "alice@example.com" },
      { id: "2", name: "Bob", email: "bob@example.com" },
    ]),
  },
}));

describe("users routeLoader$", () => {
  it("returns a list of users", async () => {
    const result = await loadUsers();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "1", name: "Alice" });
  });
});
```

---

## E2E Tests

### Cypress Setup

```typescript
// tests/e2e/support/index.ts
declare global {
  namespace Cypress {
    interface Chainable {
      /** Log in as a test user via the API. */
      login(email?: string, password?: string): Chainable<void>;
    }
  }
}

Cypress.Commands.add(
  "login",
  (email = "test@example.com", password = "password123") => {
    cy.request({
      method: "POST",
      url: "/trpc/auth.login",
      body: {
        json: { email, password },
      },
    }).then((response) => {
      expect(response.status).to.eq(200);
    });
  },
);

export {};
```

### Testing Authentication Flows

```typescript
// tests/e2e/auth.cy.ts
describe("authentication", () => {
  it("allows a user to log in and see the dashboard", () => {
    cy.visit("/login");

    cy.get("input[name='email']").type("test@example.com");
    cy.get("input[name='password']").type("password123");
    cy.get("button[type='submit']").click();

    cy.url().should("include", "/dashboard");
    cy.contains("Welcome back").should("be.visible");
  });

  it("shows an error for invalid credentials", () => {
    cy.visit("/login");

    cy.get("input[name='email']").type("wrong@example.com");
    cy.get("input[name='password']").type("bad-password");
    cy.get("button[type='submit']").click();

    cy.contains("Invalid email or password").should("be.visible");
    cy.url().should("include", "/login");
  });

  it("redirects unauthenticated users to login", () => {
    cy.visit("/dashboard");

    cy.url().should("include", "/login");
  });

  it("allows a user to log out", () => {
    cy.login();
    cy.visit("/dashboard");

    cy.get("[data-testid='logout-button']").click();

    cy.url().should("include", "/login");
  });
});
```

### Testing Form Submissions

```typescript
// tests/e2e/forms.cy.ts
describe("contact form", () => {
  beforeEach(() => {
    cy.login();
    cy.visit("/contact");
  });

  it("submits the form successfully", () => {
    cy.get("input[name='name']").type("Jane Doe");
    cy.get("input[name='email']").type("jane@example.com");
    cy.get("textarea[name='message']").type("Hello from Cypress!");
    cy.get("button[type='submit']").click();

    cy.contains("Message sent successfully").should("be.visible");
  });

  it("shows validation errors for empty fields", () => {
    cy.get("button[type='submit']").click();

    cy.contains("Name is required").should("be.visible");
    cy.contains("Email is required").should("be.visible");
  });

  it("preserves form data after a validation error", () => {
    cy.get("input[name='name']").type("Jane Doe");
    cy.get("button[type='submit']").click();

    // Name should still be there after the error
    cy.get("input[name='name']").should("have.value", "Jane Doe");
  });
});
```

### Testing Navigation and Routing

```typescript
// tests/e2e/navigation.cy.ts
describe("navigation", () => {
  beforeEach(() => {
    cy.login();
  });

  it("navigates between pages using the navbar", () => {
    cy.visit("/");

    cy.get("nav").contains("About").click();
    cy.url().should("include", "/about");
    cy.get("h1").should("contain", "About");

    cy.get("nav").contains("Blog").click();
    cy.url().should("include", "/blog");
    cy.get("h1").should("contain", "Blog");
  });

  it("handles dynamic routes correctly", () => {
    cy.visit("/blog");

    cy.get("[data-testid='blog-post-link']").first().click();

    cy.url().should("match", /\/blog\/.+/);
    cy.get("article").should("exist");
  });

  it("shows a 404 page for unknown routes", () => {
    cy.visit("/this-page-does-not-exist", { failOnStatusCode: false });

    cy.contains("Page not found").should("be.visible");
  });

  it("uses client-side navigation (no full reload)", () => {
    cy.visit("/");

    cy.window().then((win) => {
      // Mark the current window object
      (win as Record<string, unknown>).__NAV_TEST__ = true;
    });

    cy.get("nav").contains("About").click();

    // The same window object should persist (no full page reload)
    cy.window().its("__NAV_TEST__").should("eq", true);
  });
});
```

---

## Running Tests

### Commands

```bash
# Run all unit and integration tests
pnpm test

# Run tests in watch mode during development
pnpm test:watch

# Run tests with code coverage
pnpm test:coverage

# Run only unit tests
pnpm test -- --testPathPattern='\.test\.ts'

# Run a specific test file
pnpm test -- src/routers/users/queries.test.ts

# Run tests matching a pattern
pnpm test -- -t "creates a new user"

# Run E2E tests with Cypress (headless)
pnpm test:e2e

# Open Cypress interactive runner
pnpm cypress:open
```

### Package Scripts

```jsonc
// package.json (scripts)
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "cypress run",
    "cypress:open": "cypress open",
  },
}
```

### Watch Mode

Vitest's watch mode re-runs only the tests affected by your file changes:

```bash
pnpm test:watch
```

Press `p` to filter by filename, `t` to filter by test name, or `a` to re-run
all tests.

### Coverage

Vitest generates V8 coverage reports to `./coverage/`:

```bash
pnpm test:coverage
```

Open `coverage/index.html` in a browser for a detailed line-by-line report.

---

## CI/CD Testing Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  unit-and-integration:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: scratchy
          POSTGRES_PASSWORD: scratchy
          POSTGRES_DB: scratchy_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd="pg_isready" --health-interval=10s --health-timeout=5s
          --health-retries=5

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Run migrations
        run: pnpm drizzle-kit migrate
        env:
          DATABASE_URL: postgres://scratchy:scratchy@localhost:5432/scratchy_test

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Unit & integration tests
        run: pnpm test:coverage
        env:
          TEST_DATABASE_URL: postgres://scratchy:scratchy@localhost:5432/scratchy_test

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  e2e:
    runs-on: ubuntu-latest
    needs: unit-and-integration

    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: scratchy
          POSTGRES_PASSWORD: scratchy
          POSTGRES_DB: scratchy_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd="pg_isready" --health-interval=10s --health-timeout=5s
          --health-retries=5

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build

      - name: Start server
        run: pnpm start &
        env:
          DATABASE_URL: postgres://scratchy:scratchy@localhost:5432/scratchy_test
          NODE_ENV: test

      - name: Wait for server
        run: npx wait-on http://localhost:5000/health --timeout 30000

      - name: Cypress E2E
        uses: cypress-io/github-action@v6
        with:
          install: false
          wait-on: http://localhost:5000/health
```

---

## Best Practices

### Do

- **Co-locate tests** — `feature.test.ts` lives next to `feature.ts`.
- **One assertion concept per test** — a test should verify one behavior.
- **Use descriptive names** — `it("returns 404 when the user does not exist")`
  reads like documentation.
- **Isolate with transactions** — roll back database changes so tests never
  depend on ordering.
- **Test the contract, not the implementation** — assert on return values and
  HTTP status codes, not internal function calls.
- **Use `inject()` for HTTP tests** — faster and more deterministic than a live
  TCP connection.
- **Create focused helpers** — `createTestServer()`, `createTestDatabase()`, and
  `mockSession()` keep test code DRY.
- **Run the full suite in CI** — linting, type-checking, unit, integration, and
  E2E tests on every pull request.
- **Seed predictable data** — use fixed IDs (ULIDs) and deterministic values in
  fixtures so assertions are stable.
- **Test error paths** — verify that invalid inputs, missing resources, and
  unauthorized access produce the correct errors.

### Don't

- **❌ Don't mock what you don't own** — prefer `fastify.inject()` over mocking
  the HTTP layer. Prefer a test database over mocking Drizzle.
- **❌ Don't test framework internals** — Fastify's routing, tRPC's
  serialization, and Drizzle's query builder are already tested by their
  maintainers.
- **❌ Don't share mutable state between tests** — each test should set up and
  tear down its own state.
- **❌ Don't use `any` in test code** — test code follows the same strict
  TypeScript rules as production code.
- **❌ Don't rely on test ordering** — tests must pass when run individually or
  in any order.
- **❌ Don't write E2E tests for logic that unit tests cover** — E2E tests are
  expensive; reserve them for full user journeys.
- **❌ Don't leave `.only` or `.skip` in committed code** — CI should catch all
  tests.
- **❌ Don't ignore flaky tests** — fix the root cause (race conditions, shared
  state) instead of retrying.

### Anti-Patterns

#### ❌ Don't test implementation details

```typescript
// BAD — Testing internal method calls
it("calls db.select() with the correct table", () => {
  const spy = vi.spyOn(db, "select");
  await getUser("123");
  expect(spy).toHaveBeenCalledWith(userTable);
});

// GOOD — Testing the observable outcome
it("returns the user matching the given ID", async () => {
  const result = await getUser("123");
  expect(result).toMatchObject({ id: "123", name: "Alice" });
});
```

#### ❌ Don't use snapshots for dynamic data

```typescript
// BAD — Snapshot breaks on every timestamp change
it("returns user data", async () => {
  const result = await getUser("123");
  expect(result).toMatchSnapshot();
});

// GOOD — Assert on the stable shape
it("returns user data with expected fields", async () => {
  const result = await getUser("123");
  expect(result).toMatchObject({
    id: "123",
    name: expect.any(String),
    createdAt: expect.any(Date),
  });
});
```

#### ❌ Don't spin up the full server for unit tests

```typescript
// BAD — Starts a full Fastify server for a utility test
// GOOD — Test the function directly
import { formatDate } from "./format-date.js";
import { createTestServer } from "tests/helpers/create-test-server.js";

const server = await createTestServer();

expect(formatDate("2025-01-01")).toBe("January 1, 2025");
```

#### ❌ Don't hardcode ports in tests

```typescript
// BAD — Port collision when tests run in parallel
await server.listen({ port: 3000 });

// GOOD — Let the OS assign a free port
await server.listen({ port: 0, host: "127.0.0.1" });
```

---

## Reference Links

- [Vitest Documentation](https://vitest.dev/)
- [Fastify Testing — inject()](https://fastify.dev/docs/latest/Guides/Testing/)
- [tRPC Server-Side Callers](https://trpc.io/docs/server/server-side-calls)
- [Qwik Testing with createDOM](https://qwik.dev/docs/guides/testing/)
- [Cypress Documentation](https://docs.cypress.io/)
- [Testing Library](https://testing-library.com/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Piscina Worker Pool](https://github.com/piscinajs/piscina)
