# Forms & Server Actions

Scratchy provides a **progressive enhancement-first** form system built on Qwik
City's `routeAction$()` primitive, tRPC mutations, and Fastify multipart
handling. Forms work without JavaScript, gain SPA-like behavior when JavaScript
is available, and remain fully type-safe from the Zod schema to the rendered
error message.

---

## Table of Contents

- [Overview](#overview)
- [Route Actions](#route-actions)
  - [Defining a routeAction$](#defining-a-routeaction)
  - [Zod Validation with zod$](#zod-validation-with-zod)
  - [Returning Errors with action.fail()](#returning-errors-with-actionfail)
  - [Action State Tracking](#action-state-tracking)
- [Form Component](#form-component)
  - [Progressive Enhancement](#progressive-enhancement)
  - [SPA Reset](#spa-reset)
  - [Submission Completed Callback](#submission-completed-callback)
- [Validation](#validation)
  - [Field-Level Errors](#field-level-errors)
  - [Cross-Field Validation](#cross-field-validation)
  - [Reusable Schemas](#reusable-schemas)
- [Server Functions](#server-functions)
  - [server$() for RPC-Like Calls](#server-for-rpc-like-calls)
  - [Calling tRPC from Components](#calling-trpc-from-components)
- [File Uploads](#file-uploads)
  - [Multipart Configuration](#multipart-configuration)
  - [Streaming Upload Handler](#streaming-upload-handler)
  - [Client-Side Upload Form](#client-side-upload-form)
  - [Size Limits and Validation](#size-limits-and-validation)
- [Optimistic Updates](#optimistic-updates)
  - [Pending State with isRunning](#pending-state-with-isrunning)
  - [Optimistic UI Pattern](#optimistic-ui-pattern)
- [Fetcher Pattern](#fetcher-pattern)
  - [Non-Navigation Mutations](#non-navigation-mutations)
  - [Inline Delete Example](#inline-delete-example)
- [Revalidation](#revalidation)
  - [Invalidating Cached Data](#invalidating-cached-data)
  - [Revalidation After Mutation](#revalidation-after-mutation)
- [CSRF Protection](#csrf-protection)
  - [Token Generation and Verification](#token-generation-and-verification)
  - [Embedding Tokens in Forms](#embedding-tokens-in-forms)
- [Multi-Step Forms and Wizards](#multi-step-forms-and-wizards)
  - [Step State Management](#step-state-management)
  - [Server-Side Step Validation](#server-side-step-validation)
- [Best Practices](#best-practices)
- [Anti-Patterns](#anti-patterns)
- [Reference Links](#reference-links)

---

## Overview

```
┌──────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│                                                              │
│  ┌──────────────────────────────────────────────────┐        │
│  │  <Form action={createPost}>                      │        │
│  │    <input name="title" />                        │        │
│  │    <textarea name="content" />                   │        │
│  │    <button type="submit">Create</button>         │        │
│  │  </Form>                                         │        │
│  └──────────────────┬───────────────────────────────┘        │
│                     │                                        │
│          JS enabled │  JS disabled                           │
│          SPA fetch  │  Full-page POST                        │
│                     │                                        │
└─────────────────────┼────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────────┐
│  Fastify Server (Main Thread)                                │
│                                                              │
│  routeAction$ ─── zod$() validates ─── handler executes      │
│       │                                                      │
│       ├── Success → return value (serialized to client)      │
│       └── Failure → action.fail({ fieldErrors })             │
│                                                              │
│  tRPC mutation ─── Zod validates ─── mutation executes       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Scratchy form handling rests on two pillars:

1. **`routeAction$()`** — server-side actions co-located with route modules,
   used with the `<Form>` component for progressive enhancement
2. **tRPC mutations** — type-safe RPC calls for internal API operations that
   don't require traditional form semantics (see [API Design](./api-design.md))

Both approaches validate input with **Zod** and are fully type-safe.

---

## Route Actions

### Defining a routeAction$

A `routeAction$()` defines a server-side handler that runs when the user submits
a `<Form>`. The action has access to the request context and returns data that
the component can read reactively.

```typescript
// routes/posts/create/index.tsx
import { component$ } from "@builder.io/qwik";
import { routeAction$, Form, zod$, z } from "@builder.io/qwik-city";

export const useCreatePost = routeAction$(
  async (data, { fail }) => {
    const [error, post] = await createPostInDb(data);
    if (error) {
      return fail(500, { message: "Could not create post. Please try again." });
    }
    return { id: post.id, title: post.title };
  },
  zod$({
    title: z.string().min(1, "Title is required").max(200, "Title is too long"),
    content: z.string().min(10, "Content must be at least 10 characters"),
    published: z.coerce.boolean().default(false),
  }),
);

export default component$(() => {
  const action = useCreatePost();

  return (
    <Form action={action} spaReset>
      <fieldset disabled={action.isRunning}>
        <label for="title" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
        />
        {action.value?.fieldErrors?.title && (
          <p class="mt-1 text-sm text-red-600">{action.value.fieldErrors.title}</p>
        )}

        <label for="content" class="mt-4 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Content
        </label>
        <textarea
          id="content"
          name="content"
          rows={6}
          class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
        />
        {action.value?.fieldErrors?.content && (
          <p class="mt-1 text-sm text-red-600">{action.value.fieldErrors.content}</p>
        )}

        <button
          type="submit"
          class="mt-6 rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700"
        >
          {action.isRunning ? "Creating…" : "Create Post"}
        </button>
      </fieldset>

      {action.value?.message && (
        <p class="mt-4 text-sm text-red-600">{action.value.message}</p>
      )}
    </Form>
  );
});
```

### Zod Validation with zod$

The `zod$()` wrapper transforms a Zod schema into a Qwik-City validator. When
validation fails, Scratchy **short-circuits** — the action handler never runs,
and field errors are returned immediately.

```typescript
import { zod$ } from "@builder.io/qwik-city";
import { z } from "zod";

const updateProfileValidator = zod$({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
  bio: z.string().max(500, "Bio cannot exceed 500 characters").optional(),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});
```

Scratchy automatically maps Zod issues to `fieldErrors` keyed by the field name.
Nested objects produce dot-notation keys (e.g., `address.city`).

### Returning Errors with action.fail()

Use `fail()` inside the action handler to return a non-success response while
keeping the form populated with the user's input:

```typescript
export const useUpdateEmail = routeAction$(
  async (data, { fail }) => {
    const existing = await findUserByEmail(data.email);
    if (existing) {
      return fail(409, {
        fieldErrors: { email: "This email is already in use" },
      });
    }

    await updateUserEmail(data.userId, data.email);
    return { success: true };
  },
  zod$({
    userId: z.string().min(1),
    email: z.string().email(),
  }),
);
```

`fail()` accepts two arguments:

| Argument     | Type     | Description                                    |
| ------------ | -------- | ---------------------------------------------- |
| `statusCode` | `number` | HTTP status code (400, 409, 422, 500, etc.)    |
| `data`       | `object` | Arbitrary error data returned to the component |

### Action State Tracking

Every `routeAction$` returns an action object with reactive properties:

| Property    | Type                    | Description                                      |
| ----------- | ----------------------- | ------------------------------------------------ |
| `value`     | `T \| undefined`        | Return value from the action handler or `fail()` |
| `formData`  | `FormData \| undefined` | The raw `FormData` submitted by the user         |
| `submitted` | `boolean`               | `true` after first submission                    |
| `isRunning` | `boolean`               | `true` while the server is processing            |
| `status`    | `number \| undefined`   | HTTP status code (200 on success, or fail code)  |

```typescript
export default component$(() => {
  const action = useCreatePost();

  return (
    <div>
      {action.isRunning && <Spinner />}
      {action.submitted && action.status === 200 && (
        <p class="text-green-600">Post created: {action.value?.title}</p>
      )}
      {action.submitted && action.status !== 200 && (
        <p class="text-red-600">{action.value?.message ?? "Something went wrong"}</p>
      )}
    </div>
  );
});
```

---

## Form Component

### Progressive Enhancement

The `<Form>` component renders a standard HTML `<form>` element. When JavaScript
is available it intercepts the submission and sends the data as an SPA fetch.
When JavaScript is disabled it falls back to a traditional full-page POST — the
form works either way.

```typescript
import { Form } from "@builder.io/qwik-city";

// With JavaScript: SPA fetch, no page reload
// Without JavaScript: standard form POST, full page reload
<Form action={action} method="post">
  <input name="title" />
  <button type="submit">Submit</button>
</Form>
```

**Key props:**

| Prop                 | Type          | Description                                       |
| -------------------- | ------------- | ------------------------------------------------- |
| `action`             | `ActionStore` | The `routeAction$` to submit to                   |
| `method`             | `string`      | HTTP method (defaults to `"post"`)                |
| `spaReset`           | `boolean`     | Reset form fields after successful SPA submission |
| `reloadDocument`     | `boolean`     | Force a full-page submission (skip SPA)           |
| `onSubmitCompleted$` | `QRL`         | Callback fired after the server responds          |

### SPA Reset

When `spaReset` is present, the form fields reset to their default values after
a successful submission. This is useful for "add another" workflows:

```tsx
<Form
  action={addComment}
  spaReset
>
  <textarea
    name="body"
    placeholder="Write a comment…"
  />
  <button type="submit">Post Comment</button>
</Form>
```

### Submission Completed Callback

`onSubmitCompleted$` fires after the server action completes. Use it for
post-submission side effects like scrolling, toasts, or navigation:

```tsx
import { $, component$ } from "@builder.io/qwik";
import { Form } from "@builder.io/qwik-city";

export default component$(() => {
  const action = useCreatePost();

  const onCompleted = $((event: CustomEvent) => {
    const detail = event.detail as { status: number };
    if (detail.status === 200) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  return (
    <Form
      action={action}
      onSubmitCompleted$={onCompleted}
    >
      {/* fields */}
    </Form>
  );
});
```

---

## Validation

### Field-Level Errors

Zod validation errors are automatically structured into `fieldErrors`. Display
them next to the corresponding input:

```tsx
export default component$(() => {
  const action = useRegister();

  return (
    <Form action={action}>
      <div>
        <input
          name="email"
          type="email"
        />
        {action.value?.fieldErrors?.email && (
          <p
            class="text-sm text-red-600"
            role="alert"
          >
            {action.value.fieldErrors.email}
          </p>
        )}
      </div>

      <div>
        <input
          name="password"
          type="password"
        />
        {action.value?.fieldErrors?.password && (
          <p
            class="text-sm text-red-600"
            role="alert"
          >
            {action.value.fieldErrors.password}
          </p>
        )}
      </div>

      <button type="submit">Register</button>
    </Form>
  );
});
```

### Cross-Field Validation

Use Zod's `.refine()` or `.superRefine()` for validation rules that span
multiple fields:

```typescript
export const useRegister = routeAction$(
  async (data, { fail }) => {
    const existing = await findUserByEmail(data.email);
    if (existing) {
      return fail(409, { fieldErrors: { email: "Email already registered" } });
    }
    await createUser(data);
    return { success: true };
  },
  zod$(
    z
      .object({
        email: z.string().email(),
        password: z.string().min(8, "Minimum 8 characters"),
        confirmPassword: z.string(),
      })
      .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
      }),
  ),
);
```

### Reusable Schemas

Define schemas in a shared module so both `routeAction$` and tRPC procedures can
reuse them:

```typescript
// lib/schemas/post.ts
import { z } from "zod";

export const CreatePostSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  content: z.string().min(10, "Content must be at least 10 characters"),
  published: z.coerce.boolean().default(false),
  tags: z.array(z.string().max(50)).max(10, "Maximum 10 tags").default([]),
});

export type CreatePost = z.infer<typeof CreatePostSchema>;

// Used in routeAction$
export const useCreatePost = routeAction$(handler, zod$(CreatePostSchema));

// Used in tRPC
export const postMutations = {
  create: protectedProcedure.input(CreatePostSchema).mutation(handler),
};
```

---

## Server Functions

### server$() for RPC-Like Calls

`server$()` creates a server-side function callable from the client without a
`<Form>`. It is ideal for imperative mutations triggered by button clicks,
toggles, or other events that do not map to form submissions.

```typescript
// components/like-button.tsx
import { component$, useSignal } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

const toggleLike = server$(async function (postId: string) {
  const userId = this.cookie.get("userId")?.value;
  if (!userId) {
    throw new Error("Authentication required");
  }
  return togglePostLike(postId, userId);
});

export const LikeButton = component$<{ postId: string; liked: boolean }>(
  ({ postId, liked }) => {
    const isLiked = useSignal(liked);
    const isPending = useSignal(false);

    return (
      <button
        onClick$={async () => {
          isPending.value = true;
          const result = await toggleLike(postId);
          isLiked.value = result.liked;
          isPending.value = false;
        }}
        disabled={isPending.value}
        class={isLiked.value ? "text-red-500" : "text-gray-400"}
      >
        {isPending.value ? "…" : isLiked.value ? "♥" : "♡"}
      </button>
    );
  },
);
```

**Rules for `server$()`:**

- The function body runs exclusively on the server — it is never shipped to the
  client
- Access the request context through `this` (the Qwik `RequestEvent`)
- Arguments and return values must be serializable (no functions, no class
  instances)
- Use `server$()` for one-off mutations; prefer `routeAction$()` for form-based
  flows

### Calling tRPC from Components

For mutations that already exist as tRPC procedures, call them through the tRPC
client instead of duplicating logic in a `server$()`:

```typescript
import { component$, useSignal } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

const deletePost = server$(async function (postId: string) {
  // Call the existing tRPC mutation on the server side
  const { trpc } = await import("~/lib/trpc.server.js");
  await trpc.posts.delete.mutate({ id: postId });
  return { deleted: true };
});
```

---

## File Uploads

### Multipart Configuration

Register `@fastify/multipart` globally in the plugin layer:

```typescript
// plugins/external/multipart.ts
import fp from "fastify-plugin";

export default fp(async function multipart(fastify) {
  await fastify.register(import("@fastify/multipart"), {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB per file
      files: 5, // max 5 files per request
      fieldSize: 1024 * 1024, // 1 MB per field value
    },
  });
});
```

### Streaming Upload Handler

Process uploads without buffering the entire file into memory:

```typescript
// routes/uploads/index.ts
import type { FastifyPluginAsync } from "fastify";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { ulid } from "ulid";

const UPLOAD_DIR = "/var/data/uploads";
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const routes: FastifyPluginAsync = async function (fastify) {
  fastify.post("/uploads", async (request, reply) => {
    const parts = request.parts();
    const results: Array<{ id: string; filename: string; size: number }> = [];

    for await (const part of parts) {
      if (part.type !== "file") continue;

      if (!ALLOWED_MIME.has(part.mimetype)) {
        return reply.status(400).send({
          error: `Unsupported file type: ${part.mimetype}`,
        });
      }

      const id = ulid();
      const ext = part.filename.split(".").pop() ?? "bin";
      const dest = join(UPLOAD_DIR, `${id}.${ext}`);

      await pipeline(part.file, createWriteStream(dest));

      if (part.file.truncated) {
        return reply.status(413).send({
          error: `File exceeds the ${MAX_FILE_SIZE / 1024 / 1024} MB limit`,
        });
      }

      results.push({
        id,
        filename: part.filename,
        size: part.file.bytesRead,
      });
    }

    return reply.status(201).send({ files: results });
  });
};

export default routes;
```

### Client-Side Upload Form

Use a standard `<form>` with `enctype="multipart/form-data"` or a `server$()`
for programmatic uploads:

```tsx
import { component$, useSignal } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

const uploadAvatar = server$(async function (formData: FormData) {
  const file = formData.get("avatar");
  if (!(file instanceof File)) {
    throw new Error("No file provided");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("File must be under 5 MB");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = await saveAvatar(bytes, file.name);
  return { avatarId: id };
});

export const AvatarUpload = component$(() => {
  const status = useSignal<"idle" | "uploading" | "done" | "error">("idle");

  return (
    <form
      preventdefault:submit
      onSubmit$={async (_, form) => {
        status.value = "uploading";
        try {
          const formData = new FormData(form);
          await uploadAvatar(formData);
          status.value = "done";
        } catch {
          status.value = "error";
        }
      }}
    >
      <input
        name="avatar"
        type="file"
        accept="image/*"
      />
      <button
        type="submit"
        disabled={status.value === "uploading"}
        class="bg-primary-600 rounded-lg px-4 py-2 text-white"
      >
        {status.value === "uploading" ? "Uploading…" : "Upload Avatar"}
      </button>
      {status.value === "error" && (
        <p class="text-sm text-red-600">Upload failed. Please try again.</p>
      )}
    </form>
  );
});
```

### Size Limits and Validation

| Limit       | Default   | Configured In                 |
| ----------- | --------- | ----------------------------- |
| Per file    | 10 MB     | `@fastify/multipart` `limits` |
| Total files | 5         | `@fastify/multipart` `limits` |
| Field value | 1 MB      | `@fastify/multipart` `limits` |
| MIME types  | Allowlist | Route handler validation      |

Always validate MIME types server-side — client-side `accept` attributes are
suggestions, not enforcement.

---

## Optimistic Updates

### Pending State with isRunning

The simplest optimistic pattern uses `action.isRunning` to disable the form and
show a loading indicator:

```tsx
export default component$(() => {
  const action = useUpdateProfile();

  return (
    <Form action={action}>
      <fieldset disabled={action.isRunning}>
        <input
          name="name"
          value={action.formData?.get("name")?.toString() ?? ""}
        />
        <button type="submit">{action.isRunning ? "Saving…" : "Save"}</button>
      </fieldset>
    </Form>
  );
});
```

### Optimistic UI Pattern

For instant visual feedback before the server responds, apply the change locally
and roll back on failure:

```tsx
import { $, component$, useSignal } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

const toggleBookmark = server$(async function (postId: string) {
  const userId = this.cookie.get("userId")?.value;
  if (!userId) throw new Error("Not authenticated");
  return toggleBookmarkInDb(postId, userId);
});

export const BookmarkButton = component$<{ postId: string; saved: boolean }>(
  ({ postId, saved }) => {
    const isSaved = useSignal(saved);
    const isPending = useSignal(false);

    const handleClick = $(async () => {
      // Optimistic: flip immediately
      const previous = isSaved.value;
      isSaved.value = !previous;
      isPending.value = true;

      try {
        const result = await toggleBookmark(postId);
        isSaved.value = result.bookmarked;
      } catch {
        // Rollback on failure
        isSaved.value = previous;
      } finally {
        isPending.value = false;
      }
    });

    return (
      <button
        onClick$={handleClick}
        disabled={isPending.value}
      >
        {isSaved.value ? "★ Saved" : "☆ Save"}
      </button>
    );
  },
);
```

---

## Fetcher Pattern

### Non-Navigation Mutations

Not every mutation navigates to a new page. The **fetcher pattern** wraps
`server$()` in a reusable hook that tracks submission state — similar to Remix's
`useFetcher()`:

```typescript
// hooks/use-fetcher.ts
import { $, useSignal } from "@builder.io/qwik";

interface FetcherState<T> {
  data: T | undefined;
  isRunning: boolean;
  error: string | undefined;
}

export function useFetcher<TInput, TOutput>(
  serverFn: (input: TInput) => Promise<TOutput>,
) {
  const state = useSignal<FetcherState<TOutput>>({
    data: undefined,
    isRunning: false,
    error: undefined,
  });

  const submit = $(async (input: TInput) => {
    state.value = { ...state.value, isRunning: true, error: undefined };
    try {
      const data = await serverFn(input);
      state.value = { data, isRunning: false, error: undefined };
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      state.value = { data: undefined, isRunning: false, error: message };
      throw error;
    }
  });

  return { state, submit };
}
```

### Inline Delete Example

A delete button in a list row that removes the item without a full navigation:

```tsx
import { component$ } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";
import { useFetcher } from "~/hooks/use-fetcher";

const deleteComment = server$(async function (commentId: string) {
  const userId = this.cookie.get("userId")?.value;
  if (!userId) throw new Error("Not authenticated");
  await removeComment(commentId, userId);
  return { deleted: true };
});

export const CommentRow = component$<{ id: string; body: string }>(
  ({ id, body }) => {
    const { state, submit } = useFetcher(deleteComment);

    return (
      <div class={state.value.data?.deleted ? "opacity-50" : ""}>
        <p>{body}</p>
        <button
          onClick$={() => submit(id)}
          disabled={state.value.isRunning}
          class="text-sm text-red-600 hover:text-red-800"
        >
          {state.value.isRunning ? "Deleting…" : "Delete"}
        </button>
        {state.value.error && (
          <p class="text-sm text-red-600">{state.value.error}</p>
        )}
      </div>
    );
  },
);
```

---

## Revalidation

### Invalidating Cached Data

After a mutation changes server state, stale data in `routeLoader$` results or
SSG caches must be invalidated. Scratchy supports two strategies:

1. **Re-running loaders** — returning from a `routeAction$` automatically
   re-runs all `routeLoader$` functions on the same page
2. **Cache tag invalidation** — explicitly invalidating Redis-cached SSG pages

### Revalidation After Mutation

When a `routeAction$` completes, Qwik City re-invokes every `routeLoader$` on
the current route. This means data displayed on the page updates automatically:

```typescript
// routeLoader$ re-runs after routeAction$ completes
export const useComments = routeLoader$(async ({ params }) => {
  return findCommentsByPostId(params.postId);
});

export const useAddComment = routeAction$(
  async (data) => {
    await insertComment(data);
    // No explicit revalidation needed — useComments re-runs automatically
    return { success: true };
  },
  zod$({
    postId: z.string(),
    body: z.string().min(1).max(2000),
  }),
);
```

For SSG pages cached in Redis, explicitly invalidate the cache key after
mutation:

```typescript
export const usePublishPost = routeAction$(
  async (data, { sharedMap }) => {
    await publishPost(data.postId);

    // Invalidate the SSG cache so the next request renders fresh HTML
    const cache = sharedMap.get("cache") as CacheInstance;
    await cache.del(`ssg:blog:${data.slug}`);

    return { published: true };
  },
  zod$({
    postId: z.string(),
    slug: z.string(),
  }),
);
```

---

## CSRF Protection

### Token Generation and Verification

Scratchy generates a per-session CSRF token and validates it on every state-
changing request. The implementation lives in a Fastify plugin and integrates
with the session layer (see [Sessions](./sessions.md)):

```typescript
// plugins/app/csrf.ts
import fp from "fastify-plugin";
import { randomBytes, timingSafeEqual } from "node:crypto";

export default fp(async function csrf(fastify) {
  const CSRF_HEADER = "x-csrf-token";
  const CSRF_FIELD = "_csrf";
  const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

  // Use preHandler (not onRequest) so request.body is available for form submissions
  fastify.addHook("preHandler", async (request, reply) => {
    if (SAFE_METHODS.has(request.method)) return;

    const session = request.session;
    if (!session) return;

    const expected = session.get("csrfToken") as string | undefined;
    if (!expected) {
      return reply.status(403).send({ error: "Missing CSRF session token" });
    }

    // Check header first (JS clients), then form body field (non-JS fallback)
    const received =
      request.headers[CSRF_HEADER]?.toString() ??
      (request.body as Record<string, string>)?.[CSRF_FIELD];

    if (!received) {
      return reply.status(403).send({ error: "Missing CSRF token" });
    }

    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(received);

    if (
      expectedBuf.length !== receivedBuf.length ||
      !timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      return reply.status(403).send({ error: "Invalid CSRF token" });
    }
  });

  fastify.decorateRequest("csrfToken", "");

  fastify.addHook("preHandler", async (request) => {
    const session = request.session;
    if (!session) return;

    let token = session.get("csrfToken") as string | undefined;
    if (!token) {
      token = randomBytes(32).toString("base64url");
      session.set("csrfToken", token);
    }
    request.csrfToken = token;
  });
});
```

### Embedding Tokens in Forms

Include the CSRF token as a hidden field so forms work without JavaScript. When
JavaScript is available, the `<Form>` component sends it as a header
automatically:

```tsx
import { component$ } from "@builder.io/qwik";
import { Form, routeLoader$ } from "@builder.io/qwik-city";

export const useCsrfToken = routeLoader$(async ({ sharedMap }) => {
  return sharedMap.get("csrfToken") as string;
});

export default component$(() => {
  const csrf = useCsrfToken();
  const action = useDeleteAccount();

  return (
    <Form action={action}>
      <input
        type="hidden"
        name="_csrf"
        value={csrf.value}
      />
      <button
        type="submit"
        class="text-red-600"
      >
        Delete my account
      </button>
    </Form>
  );
});
```

---

## Multi-Step Forms and Wizards

### Step State Management

Use `useStore` to track the current step and accumulated form data. Each step
validates its own slice before advancing:

```tsx
import { $, component$, useStore } from "@builder.io/qwik";
import { Form, routeAction$, z, zod$ } from "@builder.io/qwik-city";

interface WizardState {
  step: number;
  account: { email: string; password: string };
  profile: { name: string; bio: string };
}

export const useCompleteSignup = routeAction$(
  async (data, { fail }) => {
    const [error] = await createUserWithProfile(data);
    if (error) {
      return fail(500, { message: "Registration failed" });
    }
    return { success: true };
  },
  zod$({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1).max(100),
    bio: z.string().max(500).default(""),
  }),
);

export default component$(() => {
  const wizard = useStore<WizardState>({
    step: 1,
    account: { email: "", password: "" },
    profile: { name: "", bio: "" },
  });

  const action = useCompleteSignup();

  const nextStep = $(() => {
    if (wizard.step === 1) {
      // Client-side validation before advancing
      if (!wizard.account.email || !wizard.account.password) return;
      wizard.step = 2;
    }
  });

  const prevStep = $(() => {
    if (wizard.step > 1) wizard.step--;
  });

  return (
    <div>
      <nav
        class="flex gap-4 text-sm text-gray-500"
        aria-label="Progress"
      >
        <span class={wizard.step >= 1 ? "text-primary-600 font-bold" : ""}>
          1. Account
        </span>
        <span class={wizard.step >= 2 ? "text-primary-600 font-bold" : ""}>
          2. Profile
        </span>
      </nav>

      {wizard.step === 1 && (
        <div class="mt-6 space-y-4">
          <input
            name="email"
            type="email"
            placeholder="Email"
            value={wizard.account.email}
            onInput$={(_, el) => (wizard.account.email = el.value)}
            class="block w-full rounded-lg border px-3 py-2"
          />
          <input
            name="password"
            type="password"
            placeholder="Password (min 8 chars)"
            value={wizard.account.password}
            onInput$={(_, el) => (wizard.account.password = el.value)}
            class="block w-full rounded-lg border px-3 py-2"
          />
          <button
            onClick$={nextStep}
            class="bg-primary-600 rounded-lg px-4 py-2 text-white"
          >
            Next →
          </button>
        </div>
      )}

      {wizard.step === 2 && (
        <Form
          action={action}
          class="mt-6 space-y-4"
        >
          {/* Carry forward step 1 data as hidden fields */}
          <input
            type="hidden"
            name="email"
            value={wizard.account.email}
          />
          <input
            type="hidden"
            name="password"
            value={wizard.account.password}
          />

          <input
            name="name"
            placeholder="Display name"
            value={wizard.profile.name}
            onInput$={(_, el) => (wizard.profile.name = el.value)}
            class="block w-full rounded-lg border px-3 py-2"
          />
          <textarea
            name="bio"
            placeholder="Tell us about yourself"
            value={wizard.profile.bio}
            onInput$={(_, el) => (wizard.profile.bio = el.value)}
            class="block w-full rounded-lg border px-3 py-2"
          />

          <div class="flex gap-4">
            <button
              type="button"
              onClick$={prevStep}
              class="rounded-lg border px-4 py-2"
            >
              ← Back
            </button>
            <button
              type="submit"
              disabled={action.isRunning}
              class="bg-primary-600 rounded-lg px-4 py-2 text-white"
            >
              {action.isRunning ? "Creating Account…" : "Complete Signup"}
            </button>
          </div>

          {action.value?.message && (
            <p class="text-sm text-red-600">{action.value.message}</p>
          )}
        </Form>
      )}
    </div>
  );
});
```

### Server-Side Step Validation

For wizards where each step is its own `routeAction$`, validate per-step and
accumulate results in the session:

```typescript
export const useStepOne = routeAction$(
  async (data, { sharedMap, redirect }) => {
    const session = sharedMap.get("session") as SessionInstance;
    session.set("wizardStep1", data);
    throw redirect(302, "/signup/step-2");
  },
  zod$({
    email: z.string().email(),
    password: z.string().min(8),
  }),
);

export const useStepTwo = routeAction$(
  async (data, { sharedMap, fail }) => {
    const session = sharedMap.get("session") as SessionInstance;
    const step1 = session.get("wizardStep1") as
      | { email: string; password: string }
      | undefined;

    if (!step1) {
      return fail(400, { message: "Please complete step 1 first" });
    }

    await createUserWithProfile({ ...step1, ...data });
    session.unset("wizardStep1");
    return { success: true };
  },
  zod$({
    name: z.string().min(1).max(100),
    bio: z.string().max(500).default(""),
  }),
);
```

---

## Best Practices

- ✅ Always validate with `zod$()` — never trust client input
- ✅ Use `<Form>` with `routeAction$()` for forms that change server state
- ✅ Use `server$()` for imperative one-off mutations (like, bookmark, toggle)
- ✅ Keep business logic in service modules — actions should be thin wrappers
- ✅ Return structured `fieldErrors` from `fail()` so the UI can highlight
  individual fields
- ✅ Use `spaReset` for "add another" workflows (comment boxes, todo lists)
- ✅ Include CSRF tokens in all state-changing forms
- ✅ Validate MIME types and file sizes server-side, not just in `accept`
  attributes
- ✅ Share Zod schemas between `routeAction$` and tRPC to avoid duplication
- ✅ Disable submit buttons with `action.isRunning` to prevent double submission
- ✅ Use `role="alert"` on error messages for screen reader accessibility

---

## Anti-Patterns

### ❌ Don't skip server-side validation

```tsx
// BAD — client-only validation, server handler trusts input
export const useCreate = routeAction$(async (data) => {
  await db.insert(post).values(data); // raw input into the database
});

// GOOD — always validate with zod$()
export const useCreate = routeAction$(
  async (data) => {
    await db.insert(post).values(data); // data is validated by Zod
  },
  zod$({ title: z.string().min(1), content: z.string().min(10) }),
);
```

### ❌ Don't put business logic in the action handler

```tsx
// BAD — action handler does too much
export const useCreateOrder = routeAction$(async (data, { fail }) => {
  const inventory = await checkInventory(data.productId);
  if (inventory < data.quantity) return fail(400, { message: "Out of stock" });
  const price = await getPrice(data.productId);
  const total = price * data.quantity;
  const tax = calculateTax(total, data.region);
  await chargePayment(data.paymentMethod, total + tax);
  await createOrder({ ...data, total, tax });
  await sendConfirmationEmail(data.email);
  return { success: true };
});

// GOOD — delegate to a service
export const useCreateOrder = routeAction$(
  async (data, { fail }) => {
    const [error, order] = await placeOrder(data);
    if (error) return fail(error.status, { message: error.message });
    return { orderId: order.id };
  },
  zod$(PlaceOrderSchema),
);
```

### ❌ Don't use GET requests for mutations

```tsx
// BAD — mutation via query parameter
<a href="/api/delete-post?id=123">Delete</a>

// GOOD — mutation via POST form
<Form action={deletePost}>
  <input type="hidden" name="id" value="123" />
  <button type="submit">Delete</button>
</Form>
```

### ❌ Don't forget progressive enhancement

```tsx
// BAD — only works with JavaScript
<button onClick$={async () => {
  await fetch("/api/subscribe", { method: "POST" });
}}>
  Subscribe
</button>

// GOOD — works with and without JavaScript
<Form action={subscribe}>
  <button type="submit">Subscribe</button>
</Form>
```

### ❌ Don't buffer entire files into memory

```typescript
// BAD — entire file in memory
const file = await request.file();
const buffer = await file.toBuffer(); // could be 100MB+

// GOOD — stream to disk
const file = await request.file();
await pipeline(file.file, createWriteStream(dest));
```

---

## Reference Links

- [Qwik City Actions](https://qwik.dev/docs/action/)
- [Qwik City Form Component](https://qwik.dev/docs/action/#form)
- [Qwik City Server Functions](https://qwik.dev/docs/server$/)
- [Qwik City Route Loaders](https://qwik.dev/docs/route-loader/)
- [Zod Documentation](https://zod.dev/)
- [@fastify/multipart](https://github.com/fastify/fastify-multipart)
- [Fastify Request Validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
