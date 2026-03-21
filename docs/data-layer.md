# Data Layer Guide

## Overview

Scratchy uses **Drizzle ORM** with **PostgreSQL** as the primary data layer.
This guide covers database configuration, schema design, query patterns,
migrations, and caching.

## Stack

| Component          | Technology                                   |
| ------------------ | -------------------------------------------- |
| ORM                | Drizzle ORM                                  |
| Database           | PostgreSQL (>= 16)                           |
| Driver             | `pg` (node-postgres)                         |
| Cache              | Redis (DragonflyDB) + async-cache-dedupe     |
| IDs                | ULID (Universally Unique Lexicographically Sortable Identifier) |
| Validation         | Zod                                          |
| Migrations         | Drizzle Kit                                  |

## Database Connection

### Pool Configuration

```typescript
// db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 100,          // Maximum connections
  min: 10,           // Minimum idle connections
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

export const db = drizzle({
  schema: { mySchema, ...schemas },
  client: pool,
  casing: "snake_case",
});
```

### Connection Health

- **TCP keepalive**: Prevents network equipment from dropping idle connections
- **Pool error handlers**: Log errors, don't crash — let the pool reconnect
- **Startup verification**: `await pool.query("SELECT 1")` on boot

## Schema Design

### Entity Pattern

Every entity follows this structure:

```typescript
// db/schema/<entity>.ts
import { relations } from "drizzle-orm";
import { text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { mySchema } from "~/db/my-schema.js";
import { timestamps } from "~/db/schema/columns.helpers.js";

// 1. Type exports
export type Post = typeof post.$inferSelect;
export type NewPost = typeof post.$inferInsert;

// 2. Enums
export const postStatus = mySchema.enum("post_status", [
  "draft",
  "published",
  "archived",
]);

// 3. Table definition
export const post = mySchema.table(
  "post",
  {
    id: text().primaryKey(),           // ULID
    title: text().notNull(),
    slug: text().notNull().unique(),
    content: text(),
    status: postStatus().default("draft").notNull(),
    authorId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    publishedAt: timestamp({ withTimezone: true }),
    ...timestamps,                     // createdAt, updatedAt
  },
  (table) => [
    index("post_slug_idx").on(table.slug),
    index("post_author_idx").on(table.authorId),
    index("post_status_idx").on(table.status),
  ],
);

// 4. Relations
export const postRelations = relations(post, ({ one, many }) => ({
  author: one(user, {
    fields: [post.authorId],
    references: [user.id],
    relationName: "post_author",
  }),
  comments: many(comment, { relationName: "comment_post" }),
  tags: many(postTag, { relationName: "post_tags" }),
}));
```

### Column Helpers

Shared columns used across all tables:

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

### Schema Namespace

Always use a custom schema instead of `public`:

```typescript
// db/my-schema.ts
import { pgSchema } from "drizzle-orm/pg-core";
export const mySchema = pgSchema(process.env.DATABASE_SCHEMA || "app");
```

### ID Strategy

Use **ULID** for all entity IDs:

```typescript
import { ulid } from "ulid";

// Generate at insert time
const newPost = await db.insert(post).values({
  id: ulid(),
  title: "My Post",
  // ...
});
```

**Why ULID over UUID?**
- Lexicographically sortable (natural time ordering in indexes)
- Shorter string representation (26 chars vs 36)
- Contains a timestamp component
- URL-safe (no hyphens)

## Query Patterns

### Prepared Statements (Module-Scoped)

```typescript
// db/queries/posts.ts
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "~/db/index.js";
import { post } from "~/db/schema/post.js";

// Prepared statements MUST be module-scoped
export const findPostById = db
  .select()
  .from(post)
  .where(eq(post.id, sql.placeholder("id")))
  .prepare("find_post_by_id");

export const findPublishedPosts = db
  .select()
  .from(post)
  .where(eq(post.status, "published"))
  .orderBy(desc(post.publishedAt))
  .prepare("find_published_posts");

export const findPostsByAuthor = db
  .select()
  .from(post)
  .where(eq(post.authorId, sql.placeholder("authorId")))
  .orderBy(desc(post.createdAt))
  .prepare("find_posts_by_author");

// Type exports for consumers
export type FindPostById = Awaited<ReturnType<typeof findPostById.execute>>;
```

### Relational Queries

```typescript
// Fetch with related data
const postsWithAuthors = await db.query.post.findMany({
  with: {
    author: true,
    comments: {
      limit: 5,
      orderBy: (comments, { desc }) => [desc(comments.createdAt)],
    },
  },
  where: eq(post.status, "published"),
  orderBy: (posts, { desc }) => [desc(posts.publishedAt)],
  limit: 20,
});
```

### Pagination

```typescript
import { count, desc, sql } from "drizzle-orm";

async function paginatedPosts(page: number, limit: number) {
  const offset = (page - 1) * limit;

  const [posts, [{ total }]] = await Promise.all([
    db
      .select()
      .from(post)
      .where(eq(post.status, "published"))
      .orderBy(desc(post.publishedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(post)
      .where(eq(post.status, "published")),
  ]);

  return {
    data: posts,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
```

### Search

```typescript
import { ilike, or } from "drizzle-orm";

async function searchPosts(query: string) {
  return db
    .select()
    .from(post)
    .where(
      or(
        ilike(post.title, `%${query}%`),
        ilike(post.content, `%${query}%`),
      ),
    )
    .limit(50);
}
```

## Mutation Patterns

### Create

```typescript
// db/mutations/posts.ts
import { ulid } from "ulid";

export async function createPost(data: Omit<NewPost, "id">) {
  const [newPost] = await db
    .insert(post)
    .values({ id: ulid(), ...data })
    .returning();
  return newPost;
}
```

### Update

```typescript
export async function updatePost(id: string, data: Partial<NewPost>) {
  const [updated] = await db
    .update(post)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(post.id, id))
    .returning();
  return updated;
}
```

### Delete

```typescript
export async function deletePost(id: string) {
  const [deleted] = await db
    .delete(post)
    .where(eq(post.id, id))
    .returning();
  return deleted;
}
```

### Upsert

```typescript
export async function upsertPost(data: NewPost) {
  const [result] = await db
    .insert(post)
    .values(data)
    .onConflictDoUpdate({
      target: post.slug,
      set: {
        title: data.title,
        content: data.content,
        updatedAt: new Date(),
      },
    })
    .returning();
  return result;
}
```

### Transactions

```typescript
export async function publishPostWithNotification(postId: string) {
  return db.transaction(async (tx) => {
    // Update post status
    const [published] = await tx
      .update(post)
      .set({
        status: "published",
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(post.id, postId))
      .returning();

    // Create notification for followers
    await tx.insert(notification).values({
      id: ulid(),
      type: "new_post",
      message: `New post: ${published.title}`,
      referenceId: published.id,
    });

    return published;
  });
}
```

## Caching Layer

### async-cache-dedupe

Wrap database reads with caching and request deduplication:

```typescript
// lib/cache.ts
import { createCache } from "async-cache-dedupe";

export const cache = createCache({
  ttl: 60,           // Default TTL in seconds
  stale: 300,        // Stale-while-revalidate in seconds
  storage: {
    type: "redis",
    options: { client: redisClient },
  },
});

// Define cached functions
cache.define("getPost", {
  ttl: 300,
  references: (args, key, result) => [`post:${args.id}`],
  serialize: ({ id }) => id,
}, async ({ id }: { id: string }) => {
  const [result] = await findPostById.execute({ id });
  return result;
});

// Usage
const post = await cache.getPost({ id: "abc123" });

// Invalidation
await cache.invalidateAll([`post:abc123`]);
```

### Cache Invalidation Strategy

| Event              | Invalidate                                    |
| ------------------ | --------------------------------------------- |
| Post created       | `posts:list`                                  |
| Post updated       | `post:{id}`, `posts:list`                     |
| Post deleted       | `post:{id}`, `posts:list`                     |
| Comment added      | `post:{postId}`, `comments:post:{postId}`     |

## Migrations

### Workflow

```bash
# 1. Modify schema files in src/db/schema/

# 2. Generate migration
pnpm drizzle-kit generate --config src/drizzle.config.ts

# 3. Review generated SQL in drizzle/ directory

# 4. Apply migration
pnpm drizzle-kit migrate --config src/drizzle.config.ts
```

### Rules

- **Never edit generated `.sql` files** — they are immutable
- **Always review** generated SQL before applying
- **Test migrations** in a staging environment first
- **Use `drizzle-kit push`** only for development prototyping
- **Back up** the database before applying migrations in production

## Best Practices

1. **One file per entity** — keep schemas organized and findable
2. **Module-scoped prepared statements** — compile once, reuse everywhere
3. **Always use transactions** for multi-table operations
4. **Index foreign keys** — Drizzle doesn't auto-create FK indexes
5. **Use `returning()`** — avoid extra SELECT after INSERT/UPDATE
6. **Use `withTimezone: true`** on all timestamp columns
7. **Validate before inserting** — use Zod schemas to validate data before
   passing to Drizzle
8. **Cache read-heavy queries** — use async-cache-dedupe for frequently
   accessed data
