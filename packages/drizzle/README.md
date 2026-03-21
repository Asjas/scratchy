# @scratchy/drizzle

Database layer for the Scratchy framework — Drizzle ORM helpers, connection
pooling, schema namespace helpers, column helpers, and a Fastify plugin.

## Installation

```bash
pnpm add @scratchy/drizzle
```

## Usage

### Connection Pool

```typescript
import { createPool } from "@scratchy/drizzle";

const pool = await createPool("postgresql://localhost:5432/mydb", {
  max: 50,
  min: 5,
});
```

The pool factory automatically:

- Appends libpq keepalive parameters to prevent silent connection drops
- Sets up TCP keepalive on new connections
- Handles pool-level errors gracefully (logs, doesn't crash)
- Verifies the connection on startup with `SELECT 1`

### Schema Namespace

Always use a custom PostgreSQL schema instead of the default `public` schema:

```typescript
import { createSchema } from "@scratchy/drizzle";

// Defaults to "app"
const mySchema = createSchema();

// Or use a custom name
const mySchema = createSchema("my_app");
```

### Column Helpers

Spread the `timestamps` helper into every table to get consistent
`created_at`/`updated_at` columns:

```typescript
import { timestamps } from "@scratchy/drizzle/helpers";
import { text } from "drizzle-orm/pg-core";

const user = mySchema.table("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  ...timestamps,
});
```

Both columns use `timestamp with time zone`, default to `now()`, and `updatedAt`
automatically updates via `$onUpdateFn(() => new Date())`.

### Fastify Plugin

Register the plugin to make `fastify.db` and `fastify.pool` available:

```typescript
import drizzlePlugin from "@scratchy/drizzle/plugin";

await server.register(drizzlePlugin, {
  connectionString: process.env.DATABASE_URL,
  schemas: { mySchema, ...allTableSchemas },
});

// Now available:
// server.db  — Drizzle ORM instance
// server.pool — underlying pg.Pool
```

The plugin cleans up the pool automatically on server close.

### Drizzle Kit Configuration

Generate a Drizzle Kit config with Scratchy defaults:

```typescript
// drizzle.config.ts
import { createDrizzleConfig } from "@scratchy/drizzle";

export default createDrizzleConfig({
  schema: ["./src/db/my-schema.ts", "./src/db/schema"],
  connectionString: process.env.DATABASE_URL!,
});
```

This enforces `dialect: "postgresql"` and `casing: "snake_case"`.

### Prepared Statements Pattern

Prepared statements **must be module-scoped** (top-level), never inside
functions. This ensures they are compiled once and reused across requests:

```typescript
// db/queries/users.ts
import { eq, sql } from "drizzle-orm";
import { db } from "~/db/index.js";
import { user } from "~/db/schema/user.js";

// ✅ Module-scoped prepared statement — compiled once, reused everywhere
export const findUserById = db
  .select()
  .from(user)
  .where(eq(user.id, sql.placeholder("id")))
  .prepare("find_user_by_id");

// Usage in a route handler:
const [result] = await findUserById.execute({ id: "some-ulid" });

// ❌ BAD — creates a new prepared statement on every call
async function getUser(id: string) {
  const query = db
    .select()
    .from(user)
    .where(eq(user.id, sql.placeholder("id")))
    .prepare("get_user");
  return query.execute({ id });
}
```

Export inferred types for consumers:

```typescript
export type FindUserById = Awaited<ReturnType<typeof findUserById.execute>>;
```
