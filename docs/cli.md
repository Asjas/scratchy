# CLI Scaffolding

## Overview

Scratchy provides CLI commands to scaffold out common patterns, reducing
boilerplate and ensuring consistency. Inspired by
[Laravel Artisan](https://laravel.com/docs/13.x/artisan) and
[RedwoodJS Generate](https://docs.redwoodjs.com/docs/cli-commands#generate-alias-g).

## Commands

### `scratchy make:model <Name>`

Generates a Drizzle ORM schema file, queries, and mutations for a new database
entity.

```bash
pnpm scratchy make:model Post
```

**Creates:**
```
src/db/schema/post.ts          # Table definition with types and relations
src/db/queries/post.ts         # Prepared statement queries
src/db/mutations/post.ts       # CRUD mutation functions
```

**Generated schema file:**
```typescript
// src/db/schema/post.ts
import { relations } from "drizzle-orm";
import { text, boolean, index } from "drizzle-orm/pg-core";
import { mySchema } from "~/db/my-schema.js";
import { timestamps } from "~/db/schema/columns.helpers.js";

// Types
export type Post = typeof post.$inferSelect;
export type NewPost = typeof post.$inferInsert;

// Table
export const post = mySchema.table(
  "post",
  {
    id: text().primaryKey(),
    ...timestamps,
  },
  (table) => [],
);

// Relations
export const postRelations = relations(post, ({ one, many }) => ({
  // Define relations here
}));
```

**Generated queries file:**
```typescript
// src/db/queries/post.ts
import { eq, sql } from "drizzle-orm";
import { db } from "~/db/index.js";
import { post } from "~/db/schema/post.js";

export const findPostById = db
  .select()
  .from(post)
  .where(eq(post.id, sql.placeholder("id")))
  .prepare("find_post_by_id");

export const findAllPosts = db
  .select()
  .from(post)
  .prepare("find_all_posts");

export type FindPostById = Awaited<ReturnType<typeof findPostById.execute>>;
export type FindAllPosts = Awaited<ReturnType<typeof findAllPosts.execute>>;
```

**Generated mutations file:**
```typescript
// src/db/mutations/post.ts
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "~/db/index.js";
import { post, type NewPost } from "~/db/schema/post.js";

export async function createPost(data: Omit<NewPost, "id">) {
  const [result] = await db
    .insert(post)
    .values({ id: ulid(), ...data })
    .returning();
  return result;
}

export async function updatePost(id: string, data: Partial<NewPost>) {
  const [result] = await db
    .update(post)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(post.id, id))
    .returning();
  return result;
}

export async function deletePost(id: string) {
  const [result] = await db
    .delete(post)
    .where(eq(post.id, id))
    .returning();
  return result;
}
```

**Options:**
```bash
pnpm scratchy make:model Post --columns "title:text,content:text,published:boolean"
pnpm scratchy make:model Post --with-router    # Also generates tRPC router
```

---

### `scratchy make:router <name>`

Generates a tRPC router with queries and mutations.

```bash
pnpm scratchy make:router posts
```

**Creates:**
```
src/routers/posts/queries.ts     # Query procedures
src/routers/posts/mutations.ts   # Mutation procedures
```

**Generated queries file:**
```typescript
// src/routers/posts/queries.ts
import { z } from "zod";
import { publicProcedure, protectedProcedure } from "~/router.js";
import { findPostById, findAllPosts } from "~/db/queries/post.js";
import { TRPCError } from "@trpc/server";

export const postQueries = {
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const [post] = await findPostById.execute({ id: input.id });
      if (!post) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }
      return post;
    }),

  list: publicProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      const posts = await findAllPosts.execute();
      const start = (input.page - 1) * input.limit;
      return posts.slice(start, start + input.limit);
    }),
};
```

**Generated mutations file:**
```typescript
// src/routers/posts/mutations.ts
import { z } from "zod";
import { protectedProcedure } from "~/router.js";
import { createPost, updatePost, deletePost } from "~/db/mutations/post.js";

export const postMutations = {
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
      }),
    )
    .mutation(async ({ input }) => {
      return createPost(input);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(200).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updatePost(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await deletePost(input.id);
      return { success: true };
    }),
};
```

**After generating**, register the router in `src/routers/index.ts`:
```typescript
import { postQueries } from "~/routers/posts/queries.js";
import { postMutations } from "~/routers/posts/mutations.js";

export const appRouter = router({
  // ... existing routers
  posts: router({
    ...postQueries,
    ...postMutations,
  }),
});
```

---

### `scratchy make:route <path>`

Generates a Fastify REST route for external APIs.

```bash
pnpm scratchy make:route /external/api/v1/products
```

**Creates:**
```
src/routes/external/api/v1/products/index.ts
```

**Generated route file:**
```typescript
// src/routes/external/api/v1/products/index.ts
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const routes: FastifyPluginAsync = async function (fastify) {
  await fastify.register(import("@fastify/cors"), {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
  });

  fastify.get(
    "/",
    {
      schema: {
        querystring: z.object({
          page: z.coerce.number().min(1).default(1),
          limit: z.coerce.number().min(1).max(100).default(20),
        }),
      },
    },
    async (request, reply) => {
      // Implement list logic
      return { data: [], meta: { page: 1, limit: 20, total: 0 } };
    },
  );

  fastify.get(
    "/:id",
    {
      schema: {
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      // Implement get by ID logic
      return { data: null };
    },
  );

  fastify.post(
    "/",
    {
      schema: {
        body: z.object({
          // Define input schema
        }),
      },
    },
    async (request, reply) => {
      // Implement create logic
      return reply.status(201).send({ data: null });
    },
  );
};

export default routes;
```

---

### `scratchy make:component <name>`

Generates a Qwik component file.

```bash
pnpm scratchy make:component user-profile
```

**Creates:**
```
src/client/components/qwik/user-profile.tsx
```

**Generated component file:**
```typescript
// src/client/components/qwik/user-profile.tsx
import { component$ } from "@builder.io/qwik";

interface UserProfileProps {
  // Define props here
}

export const UserProfile = component$<UserProfileProps>((props) => {
  return (
    <div>
      <h2>UserProfile</h2>
    </div>
  );
});
```

**Options:**
```bash
pnpm scratchy make:component chart --react    # Creates a React component with qwikify$
pnpm scratchy make:component hero --page      # Creates a page component in routes/
```

---

### `scratchy make:page <path>`

Generates a Qwik page component with route loader.

```bash
pnpm scratchy make:page blog/[slug]
```

**Creates:**
```
src/client/routes/blog/[slug]/index.tsx
```

**Generated page file:**
```typescript
// src/client/routes/blog/[slug]/index.tsx
import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";

export const usePageData = routeLoader$(async ({ params, status }) => {
  const { slug } = params;
  // Fetch data for this page
  return { slug };
});

export default component$(() => {
  const data = usePageData();

  return (
    <div>
      <h1>Page: {data.value.slug}</h1>
    </div>
  );
});
```

---

### `scratchy make:plugin <name>`

Generates a Fastify plugin file.

```bash
pnpm scratchy make:plugin email-service
```

**Creates:**
```
src/plugins/app/email-service.ts
```

**Generated plugin file:**
```typescript
// src/plugins/app/email-service.ts
import fp from "fastify-plugin";

export default fp(
  async function emailService(fastify) {
    // Initialize the plugin

    // Decorate fastify instance if needed
    // fastify.decorate("emailService", service);

    // Register cleanup on close
    fastify.addHook("onClose", async () => {
      // Cleanup resources
    });

    fastify.log.info("email-service plugin initialized");
  },
  {
    name: "email-service",
    // dependencies: ["database"],  // List plugin dependencies
  },
);
```

---

## Full Scaffold

### `scratchy make:scaffold <Name>`

Generates a complete feature scaffold including model, router, page, and
component.

```bash
pnpm scratchy make:scaffold Product
```

**Creates:**
```
src/db/schema/product.ts
src/db/queries/product.ts
src/db/mutations/product.ts
src/routers/products/queries.ts
src/routers/products/mutations.ts
src/client/routes/products/index.tsx
src/client/routes/products/[id]/index.tsx
src/client/components/qwik/product-card.tsx
src/client/components/qwik/product-form.tsx
```

## Implementation Notes

The CLI tool should be implemented as a Node.js script using:

- **Commander.js** or **Citty** for CLI argument parsing
- **Handlebars** or **EJS** for template rendering
- **Inquirer** or **Prompts** for interactive mode
- Templates stored in the `templates/` directory

### Future Commands to Consider

```bash
scratchy make:migration <name>     # Create an empty migration
scratchy make:middleware <name>     # Create a tRPC middleware
scratchy make:test <path>          # Generate a test file
scratchy make:seed <name>          # Create a database seeder
scratchy db:seed                   # Run all seeders
scratchy db:fresh                  # Drop and recreate database
scratchy routes:list               # List all registered routes
scratchy cache:clear               # Clear all caches
```
