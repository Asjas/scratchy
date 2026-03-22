---
name: drizzle-orm
description:
  "Guides development of database schemas, queries, mutations, and migrations
  using Drizzle ORM with PostgreSQL in the Scratchy framework. Use when defining
  tables, writing queries, creating relations, setting up prepared statements,
  running migrations, or configuring the database connection pool. Trigger
  terms: Drizzle, ORM, schema, table, query, migration, PostgreSQL, database,
  pgSchema, relations, prepared statement, drizzle-kit."
metadata:
  tags: drizzle, orm, database, postgresql, schema, migration, queries
applyTo: "**/db/**/*.ts,**/schema/**/*.ts,**/queries/**/*.ts,**/mutations/**/*.ts,**/drizzle.config.ts"
---

# Drizzle ORM in Scratchy

## When to Use

Use these patterns when:

- Defining database tables and schemas
- Writing type-safe queries and mutations
- Setting up database relations
- Creating and running migrations
- Configuring connection pools
- Working with prepared statements

## Database Setup

### Connection Pool

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { mySchema } from "~/db/my-schema.js";
import * as schemas from "~/db/schema/index.js";

// Append PostgreSQL libpq keepalive parameters to prevent
// network equipment from dropping idle connections silently.
const keepaliveParams =
  "keepalives=1&keepalives_idle=300&keepalives_interval=10&keepalives_count=10";
const separator = DATABASE_URL.includes("?") ? "&" : "?";
const connectionString = `${DATABASE_URL}${separator}${keepaliveParams}`;

const pool = new Pool({
  connectionString,
  max: 100,
  min: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

// Enable TCP keep-alive on every new client connection
pool.on("connect", (client) => {
  client.connection?.stream?.setKeepAlive(true, 10_000);
  client.on("error", (err) => {
    console.error("Database client error:", err.message);
  });
});

// Handle pool-level errors gracefully — do NOT re-throw
pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err);
});

// Verify connection on startup
await pool.query("SELECT 1");

export const db = drizzle({
  schema: { mySchema, ...schemas },
  client: pool,
  casing: "snake_case",
});
```

### Custom Schema Namespace

Always use a custom PostgreSQL schema instead of the default `public` schema:

```typescript
// db/my-schema.ts
import { pgSchema } from "drizzle-orm/pg-core";

const schemaName = process.env.DATABASE_SCHEMA || "my_schema";
export const mySchema = pgSchema(schemaName);
```

### Drizzle Configuration

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: ["./src/db/my-schema.ts", "./src/db/schema"],
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

## Schema Definitions

### Column Helpers

Create shared column definitions to ensure consistency:

```typescript
// db/schema/columns.helpers.ts
import { timestamp } from "drizzle-orm/pg-core";

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
};
```

### Table Definition Pattern

```typescript
// db/schema/user.ts
import { relations } from "drizzle-orm";
import { boolean, index, text, timestamp } from "drizzle-orm/pg-core";
import { mySchema } from "~/db/my-schema.js";
import { timestamps } from "~/db/schema/columns.helpers.js";

// 1. Type exports
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

// 2. Enums (use mySchema.enum)
export const userRole = mySchema.enum("user_role", ["member", "admin"]);

// 3. Tables (use mySchema.table)
export const user = mySchema.table(
  "user",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().default(false).notNull(),
    image: text(),
    role: userRole().default("member").notNull(),
    banned: boolean().default(false),
    banReason: text(),
    ...timestamps,
  },
  (table) => [index("user_email_idx").on(table.email)],
);

// 4. Relations
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session, { relationName: "session_user" }),
  posts: many(post, { relationName: "post_author" }),
}));
```

### Key Rules for Schema Files

1. **Always use `mySchema.table()`** — never bare `pgTable()`
2. **Always use `mySchema.enum()`** — never bare `pgEnum()`
3. **Export types** using `$inferSelect` and `$inferInsert`
4. **Spread `timestamps`** on every table for consistent `createdAt`/`updatedAt`
5. **Use `text()` for IDs** — we use ULID strings, not auto-increment integers
6. **Add indexes** in the third argument as an array
7. **Define relations** alongside the table in the same file
8. **One file per entity** — keep `user.ts`, `post.ts`, `course.ts` separate
9. **Use `withTimezone: true`** on all timestamp columns

### Relations

```typescript
import { relations } from "drizzle-orm";

// One-to-many
export const userRelations = relations(user, ({ many }) => ({
  posts: many(post, { relationName: "post_author" }),
  comments: many(comment, { relationName: "comment_user" }),
}));

// Many-to-one (with foreign key)
export const postRelations = relations(post, ({ one, many }) => ({
  author: one(user, {
    fields: [post.authorId],
    references: [user.id],
    relationName: "post_author",
  }),
  comments: many(comment, { relationName: "comment_post" }),
}));

// One-to-one
export const profileRelations = relations(profile, ({ one }) => ({
  user: one(user, {
    fields: [profile.userId],
    references: [user.id],
  }),
}));
```

### Foreign Keys

```typescript
export const post = mySchema.table("post", {
  id: text().primaryKey(),
  title: text().notNull(),
  authorId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  categoryId: text().references(() => category.id, { onDelete: "set null" }),
  ...timestamps,
});
```

## Queries

### Module-Scoped Prepared Statements

**Prepared statements MUST be module-scoped** (top-level), never inside
functions. This ensures they are compiled once and reused:

```typescript
// db/queries/users.ts
import { eq } from "drizzle-orm";
import { db } from "~/db/index.js";
import { user } from "~/db/schema/user.js";

// ✅ Module-scoped prepared statement
export const findUserById = db
  .select()
  .from(user)
  .where(eq(user.id, sql.placeholder("id")))
  .prepare("find_user_by_id");

// Usage in a router/handler:
// const result = await findUserById.execute({ id: "some-id" });

// ✅ Module-scoped query without parameters
export const findAllUsers = db.select().from(user).prepare("find_all_users");

// Type export for consumers
export type FindUserById = Awaited<ReturnType<typeof findUserById.execute>>;
```

### Query Builder Patterns

```typescript
import { and, desc, eq, gt, like, sql } from "drizzle-orm";

// Select with conditions
const activeUsers = await db
  .select()
  .from(user)
  .where(
    and(eq(user.banned, false), gt(user.createdAt, new Date("2025-01-01"))),
  );

// Select specific columns
const userEmails = await db
  .select({
    id: user.id,
    email: user.email,
  })
  .from(user);

// With ordering and pagination
const recentUsers = await db
  .select()
  .from(user)
  .orderBy(desc(user.createdAt))
  .limit(10)
  .offset(0);

// Join query
const postsWithAuthors = await db
  .select({
    postTitle: post.title,
    authorName: user.name,
  })
  .from(post)
  .innerJoin(user, eq(post.authorId, user.id));

// Relational query (using Drizzle's query API)
const usersWithPosts = await db.query.user.findMany({
  with: {
    posts: {
      limit: 5,
      orderBy: (posts, { desc }) => [desc(posts.createdAt)],
    },
  },
  where: eq(user.banned, false),
});
```

## Mutations

```typescript
// db/mutations/users.ts
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "~/db/index.js";
import { type NewUser, user } from "~/db/schema/user.js";

export async function createUser(data: Omit<NewUser, "id">) {
  const [newUser] = await db
    .insert(user)
    .values({
      id: ulid(),
      ...data,
    })
    .returning();
  return newUser;
}

export async function updateUser(id: string, data: Partial<NewUser>) {
  const [updated] = await db
    .update(user)
    .set(data)
    .where(eq(user.id, id))
    .returning();
  return updated;
}

export async function deleteUser(id: string) {
  await db.delete(user).where(eq(user.id, id));
}

// Upsert pattern
export async function upsertUser(data: NewUser) {
  const [result] = await db
    .insert(user)
    .values(data)
    .onConflictDoUpdate({
      target: user.email,
      set: {
        name: data.name,
        updatedAt: new Date(),
      },
    })
    .returning();
  return result;
}
```

## Transactions

```typescript
import { db } from "~/db/index.js";

export async function transferCredits(
  fromId: string,
  toId: string,
  amount: number,
) {
  return await db.transaction(async (tx) => {
    const [sender] = await tx
      .select()
      .from(user)
      .where(eq(user.id, fromId))
      .for("update"); // Row-level lock

    if (sender.credits < amount) {
      throw new Error("Insufficient credits");
    }

    await tx
      .update(user)
      .set({ credits: sender.credits - amount })
      .where(eq(user.id, fromId));

    await tx
      .update(user)
      .set({ credits: sql`${user.credits} + ${amount}` })
      .where(eq(user.id, toId));

    return { success: true };
  });
}
```

## Migrations

### Generate Migrations

```bash
# Generate a new migration from schema changes
pnpm drizzle-kit generate --config src/drizzle.config.ts

# Apply migrations to the database
pnpm drizzle-kit migrate --config src/drizzle.config.ts

# Open Drizzle Studio for visual database management
pnpm drizzle-kit studio
```

### Critical Migration Rules

1. **Never edit generated `.sql` migration files** — they are immutable
2. **Always generate migrations** after schema changes
3. **Review generated SQL** before applying to production
4. **Use `drizzle-kit push`** only for development prototyping, never production

## Anti-Patterns

### ❌ Don't define prepared statements inside functions

```typescript
// BAD — Creates a new prepared statement on every call
async function getUser(id: string) {
  const query = db
    .select()
    .from(user)
    .where(eq(user.id, sql.placeholder("id")))
    .prepare("get_user");
  return query.execute({ id });
}

// GOOD — Module-scoped, compiled once
const getUserQuery = db
  .select()
  .from(user)
  .where(eq(user.id, sql.placeholder("id")))
  .prepare("get_user");

async function getUser(id: string) {
  return getUserQuery.execute({ id });
}
```

### ❌ Don't use the default public schema

```typescript
// BAD
import { pgTable } from "drizzle-orm/pg-core";
export const user = pgTable("user", { /* ... */ });

// GOOD
import { mySchema } from "~/db/my-schema.js";
export const user = mySchema.table("user", { /* ... */ });
```

### ❌ Don't use auto-increment integer IDs

```typescript
// BAD
id: serial().primaryKey(),

// GOOD — Use ULID text IDs
id: text().primaryKey(), // Value set with ulid() at insert time
```

## Reference Links

- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Drizzle PostgreSQL Column Types](https://orm.drizzle.team/docs/column-types/pg)
- [Drizzle Relations](https://orm.drizzle.team/docs/rqb)
- [Drizzle Migrations](https://orm.drizzle.team/docs/migrations)
- [Drizzle Kit CLI](https://orm.drizzle.team/docs/kit-overview)
- [Drizzle Prepared Statements](https://orm.drizzle.team/docs/perf-queries)
- [Drizzle Transactions](https://orm.drizzle.team/docs/transactions)
