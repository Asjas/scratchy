# Data Loading

> **Diátaxis type: [How-to Guide](https://diataxis.fr/how-to-guides/)** —
> problem-oriented, shows how to load data on the server, stream deferred
> content, cache, and revalidate.

Scratchy provides a layered data-loading system that runs on the server during
SSR, streams deferred data to the client, and revalidates automatically on
navigation. Every loader is fully type-safe end-to-end — from the database query
through tRPC to the component that renders the result.

## Table of Contents

- [routeLoader$](#routeloader)
- [Multiple Loaders per Route](#multiple-loaders-per-route)
- [Loader Dependencies](#loader-dependencies)
- [tRPC Integration](#trpc-integration)
- [Caching Strategies](#caching-strategies)
- [Streaming Data with defer()](#streaming-data-with-defer)
- [Revalidation](#revalidation)
- [Request Deduplication](#request-deduplication)
- [Prefetching](#prefetching)
- [Server Functions](#server-functions)
- [Error Handling in Loaders](#error-handling-in-loaders)
- [Headers and Cache Control](#headers-and-cache-control)
- [Pagination Patterns](#pagination-patterns)
- [Search and Filtering](#search-and-filtering)
- [Best Practices](#best-practices)
- [Anti-Patterns](#anti-patterns)

---

## routeLoader$

`routeLoader$()` is the primary mechanism for loading data on the server before
a route renders. It runs on every navigation (including client-side), returns a
read-only signal in the component, and is fully type-safe without manual
generics.

```tsx
// routes/products/index.tsx
import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { findAllProducts } from "~/db/queries/products.js";

export const useProducts = routeLoader$(async () => {
  const products = await findAllProducts.execute();
  return products;
});

export default component$(() => {
  const products = useProducts();

  return (
    <ul>
      {products.value.map((product) => (
        <li key={product.id}>
          <h3 class="text-lg font-semibold">{product.name}</h3>
          <p class="text-gray-600 dark:text-gray-400">${product.price}</p>
        </li>
      ))}
    </ul>
  );
});
```

The loader function receives a `RequestEvent` object that exposes route params,
URL search params, the request, platform bindings, and helpers for error
responses:

```tsx
import { routeLoader$ } from "@builder.io/qwik-city";
import { findProductById } from "~/db/queries/products.js";

export const useProduct = routeLoader$(async (requestEvent) => {
  const productId = requestEvent.params.id;
  const [product] = await findProductById.execute({ id: productId });

  if (!product) {
    throw requestEvent.redirect(302, "/products");
  }

  return product;
});
```

---

## Multiple Loaders per Route

Define multiple `routeLoader$` exports in the same route module to load
independent data in parallel. Scratchy executes all loaders that have no
dependencies concurrently, reducing the overall waterfall.

```tsx
// routes/dashboard/index.tsx
import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { findNotifications } from "~/db/queries/notifications.js";
import { findRecentOrders } from "~/db/queries/orders.js";
import { findUserStats } from "~/db/queries/stats.js";

// These three loaders run in parallel — no dependency between them
export const useRecentOrders = routeLoader$(async ({ sharedMap }) => {
  const userId = sharedMap.get("userId") as string;
  return findRecentOrders.execute({ userId, limit: 10 });
});

export const useStats = routeLoader$(async ({ sharedMap }) => {
  const userId = sharedMap.get("userId") as string;
  return findUserStats.execute({ userId });
});

export const useNotifications = routeLoader$(async ({ sharedMap }) => {
  const userId = sharedMap.get("userId") as string;
  return findNotifications.execute({ userId, unreadOnly: true });
});

export default component$(() => {
  const orders = useRecentOrders();
  const stats = useStats();
  const notifications = useNotifications();

  return (
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section>
        <h2 class="text-xl font-bold">Recent Orders</h2>
        <p>{orders.value.length} orders</p>
      </section>
      <section>
        <h2 class="text-xl font-bold">Stats</h2>
        <p>Revenue: ${stats.value.totalRevenue}</p>
      </section>
      <section>
        <h2 class="text-xl font-bold">Notifications</h2>
        <p>{notifications.value.length} unread</p>
      </section>
    </div>
  );
});
```

> **Tip:** Keep loaders independent whenever possible. Independent loaders are
> automatically parallelized, while dependent loaders form a sequential chain.

---

## Loader Dependencies

When one loader needs data from another, call the dependent loader's hook inside
the second loader. Scratchy resolves the dependency graph and executes them in
the correct order.

```tsx
// routes/courses/[courseId]/index.tsx
import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { findCourseById } from "~/db/queries/courses.js";
import { findLessonsByCourse } from "~/db/queries/lessons.js";

export const useCourse = routeLoader$(async ({ params, status }) => {
  const [course] = await findCourseById.execute({ id: params.courseId });
  if (!course) {
    status(404);
    return null;
  }
  return course;
});

// This loader depends on useCourse — it runs after useCourse resolves
export const useCourseLessons = routeLoader$(async ({ resolveValue }) => {
  const course = await resolveValue(useCourse);
  if (!course) {
    return [];
  }
  return findLessonsByCourse.execute({ courseId: course.id });
});

export default component$(() => {
  const course = useCourse();
  const lessons = useCourseLessons();

  if (!course.value) {
    return <p class="text-gray-500">Course not found</p>;
  }

  return (
    <div>
      <h1 class="text-2xl font-bold">{course.value.title}</h1>
      <ul class="mt-4 space-y-2">
        {lessons.value.map((lesson) => (
          <li key={lesson.id}>{lesson.title}</li>
        ))}
      </ul>
    </div>
  );
});
```

---

## tRPC Integration

Route loaders can call tRPC procedures directly on the server using the
server-side tRPC caller. This keeps all business logic in tRPC routers while
using `routeLoader$` as the data-fetching entry point for the UI.

### Server-Side tRPC Caller

```typescript
// lib/trpc.server.ts
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { createContext } from "~/context.js";
import { appRouter } from "~/routers/index.js";

export function createServerCaller(opts: CreateFastifyContextOptions) {
  const caller = appRouter.createCaller(createContext(opts));
  return caller;
}
```

### Using tRPC in a Loader

```tsx
// routes/users/[id]/index.tsx
import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";

export const useUser = routeLoader$(async (requestEvent) => {
  const caller = createServerCaller({
    req: requestEvent.request,
    res: requestEvent.response,
  });

  const user = await caller.users.getById({ id: requestEvent.params.id });
  return user;
});

export default component$(() => {
  const user = useUser();

  return (
    <div>
      <h1 class="text-2xl font-bold">{user.value.name}</h1>
      <p class="text-gray-600">{user.value.email}</p>
    </div>
  );
});
```

### Client-Side tRPC with useResource$

For client-driven data loading (search-as-you-type, infinite scroll), use the
tRPC client combined with `useResource$`:

```tsx
import {
  Resource,
  component$,
  useResource$,
  useSignal,
} from "@builder.io/qwik";
import { trpc } from "~/lib/trpc.client";

export default component$(() => {
  const query = useSignal("");

  const searchResults = useResource$(async ({ track }) => {
    const q = track(() => query.value);
    if (q.length < 2) return [];
    return trpc.products.search.query({ query: q, limit: 20 });
  });

  return (
    <div>
      <input
        type="search"
        value={query.value}
        onInput$={(_, el) => (query.value = el.value)}
        placeholder="Search products..."
        class="w-full rounded-lg border border-gray-300 px-4 py-2"
      />
      <Resource
        value={searchResults}
        onPending={() => <p class="text-gray-500">Searching...</p>}
        onRejected={(error) => (
          <p class="text-red-600">Error: {error.message}</p>
        )}
        onResolved={(products) => (
          <ul class="mt-4 space-y-2">
            {products.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>
        )}
      />
    </div>
  );
});
```

---

## Caching Strategies

Scratchy supports multiple caching layers. Use Redis (or DragonflyDB) for shared
caches and in-memory caches for single-instance data.

### Redis Cache Helper

```typescript
// lib/cache.ts
import type { Redis } from "ioredis";

interface CacheOptions {
  ttlSeconds: number;
  staleWhileRevalidateSeconds?: number;
}

interface CachedValue<T> {
  data: T;
  cachedAt: number;
}

export async function cached<T>(
  redis: Redis,
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions,
): Promise<T> {
  const raw = await redis.get(key);

  if (raw) {
    const cached: CachedValue<T> = JSON.parse(raw);
    const age = (Date.now() - cached.cachedAt) / 1000;

    // Still fresh — return immediately
    if (age < options.ttlSeconds) {
      return cached.data;
    }

    // Stale but within the revalidation window — return stale data
    // and revalidate in the background
    if (
      options.staleWhileRevalidateSeconds &&
      age < options.ttlSeconds + options.staleWhileRevalidateSeconds
    ) {
      // Fire-and-forget revalidation
      void revalidateCache(redis, key, fetcher, options);
      return cached.data;
    }
  }

  // Cache miss or expired — fetch fresh data
  return revalidateCache(redis, key, fetcher, options);
}

async function revalidateCache<T>(
  redis: Redis,
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions,
): Promise<T> {
  const data = await fetcher();
  const totalTtl =
    options.ttlSeconds + (options.staleWhileRevalidateSeconds ?? 0);

  const value: CachedValue<T> = { data, cachedAt: Date.now() };
  await redis.set(key, JSON.stringify(value), "EX", totalTtl);

  return data;
}
```

### Using the Cache in a Loader

```tsx
import { routeLoader$ } from "@builder.io/qwik-city";
import { findFeaturedProducts } from "~/db/queries/products.js";
import { cached } from "~/lib/cache.js";
import { redis } from "~/lib/redis.js";

export const useFeaturedProducts = routeLoader$(async () => {
  return cached(
    redis,
    "featured-products",
    () => findFeaturedProducts.execute(),
    { ttlSeconds: 60, staleWhileRevalidateSeconds: 300 },
  );
});
```

### TTL-Based Cache Tiers

| Data Type        | TTL      | Stale Window | Example                    |
| ---------------- | -------- | ------------ | -------------------------- |
| Static content   | 1 hour   | 24 hours     | Marketing pages, FAQs      |
| Product listings | 1 minute | 5 minutes    | Category pages, search     |
| User-specific    | 30 sec   | 2 minutes    | Dashboard, preferences     |
| Real-time        | 0        | 0            | Notifications, live prices |

---

## Streaming Data with defer()

For routes where part of the data is fast and part is slow, use `defer()` to
stream the initial HTML immediately and fill in the slow data as it resolves.
This gives users instant feedback while heavy queries complete in the
background.

### Deferred Loader

```tsx
// routes/analytics/index.tsx
import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { findDetailedReport } from "~/db/queries/reports.js";
import { findSummaryStats } from "~/db/queries/stats.js";

// Fast query — included in the initial HTML
export const useSummary = routeLoader$(async ({ sharedMap }) => {
  const userId = sharedMap.get("userId") as string;
  return findSummaryStats.execute({ userId });
});

// Slow query — streamed after initial render
export const useDetailedReport = routeLoader$(async ({ sharedMap, defer }) => {
  const userId = sharedMap.get("userId") as string;

  return defer(() => findDetailedReport.execute({ userId }));
});

export default component$(() => {
  const summary = useSummary();
  const report = useDetailedReport();

  return (
    <div class="space-y-6">
      {/* Renders immediately with SSR */}
      <section>
        <h2 class="text-xl font-bold">Summary</h2>
        <p>Total revenue: ${summary.value.totalRevenue}</p>
        <p>Active users: {summary.value.activeUsers}</p>
      </section>

      {/* Streams in when the slow query completes */}
      <section>
        <h2 class="text-xl font-bold">Detailed Report</h2>
        <Resource
          value={report}
          onPending={() => (
            <div class="animate-pulse space-y-2">
              <div class="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
              <div class="h-4 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          )}
          onRejected={(error) => (
            <p class="text-red-600">Failed to load report: {error.message}</p>
          )}
          onResolved={(data) => (
            <table class="w-full text-left text-sm">
              <thead>
                <tr>
                  <th class="py-2">Metric</th>
                  <th class="py-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.metric}>
                    <td class="py-1">{row.metric}</td>
                    <td class="py-1">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        />
      </section>
    </div>
  );
});
```

> **When to defer:** Defer any query that takes more than ~200 ms. Always
> include enough data in the non-deferred loaders so the page is usable while
> deferred content streams in.

---

## Revalidation

Control when loaders re-run on client-side navigation with `shouldRevalidate()`.
By default, every loader re-runs on every navigation to the route. Override this
for performance-sensitive routes.

```tsx
// routes/settings/index.tsx
import { routeLoader$ } from "@builder.io/qwik-city";
import type { ShouldRevalidate } from "@builder.io/qwik-city";
import { findUserSettings } from "~/db/queries/settings.js";

export const useSettings = routeLoader$(async ({ sharedMap }) => {
  const userId = sharedMap.get("userId") as string;
  return findUserSettings.execute({ userId });
});

// Only revalidate when navigating from a route that might have changed settings
export const shouldRevalidate: ShouldRevalidate = ({
  defaultShouldRevalidate,
  url,
  prevUrl,
}) => {
  // Always revalidate if the URL changed
  if (url.pathname !== prevUrl.pathname) {
    return defaultShouldRevalidate;
  }

  // Skip revalidation for same-page search param changes
  return false;
};
```

### Common Revalidation Patterns

```tsx
// Revalidate only when specific search params change
export const shouldRevalidate: ShouldRevalidate = ({ url, prevUrl }) => {
  const relevantParams = ["page", "sort", "filter"];
  return relevantParams.some(
    (param) => url.searchParams.get(param) !== prevUrl.searchParams.get(param),
  );
};

// Never revalidate (fully static data)
export const shouldRevalidate: ShouldRevalidate = () => false;

// Always revalidate (real-time data)
export const shouldRevalidate: ShouldRevalidate = () => true;
```

---

## Request Deduplication

When the same data is needed by multiple components or loaders in a single
request, deduplicate the underlying fetch to avoid redundant database queries.

### Using sharedMap for Per-Request Deduplication

The `sharedMap` on the request event is shared across all loaders and middleware
within a single request. Use it to store and retrieve data that multiple loaders
need.

```tsx
// middleware/auth.ts — runs before any loader in the route
import { type RequestHandler } from "@builder.io/qwik-city";
import { findUserById } from "~/db/queries/users.js";

export const onRequest: RequestHandler = async ({ sharedMap, cookie }) => {
  const sessionToken = cookie.get("session")?.value;
  if (!sessionToken) return;

  const [user] = await findUserById.execute({ id: sessionToken });
  if (user) {
    sharedMap.set("userId", user.id);
    sharedMap.set("user", user);
  }
};
```

```tsx
// Any loader can access the shared user without a second query
export const useProfile = routeLoader$(async ({ sharedMap }) => {
  const user = sharedMap.get("user");
  return user ?? null;
});
```

### Deduplication with a Request-Scoped Cache

For more granular deduplication across arbitrary calls within a single request,
use a simple Map keyed by the query identifier:

```typescript
// lib/request-cache.ts
type FetcherFn<T> = () => Promise<T>;

const REQUEST_CACHE = new WeakMap<object, Map<string, Promise<unknown>>>();

export function dedupe<T>(
  requestKey: object,
  cacheKey: string,
  fetcher: FetcherFn<T>,
): Promise<T> {
  let cache = REQUEST_CACHE.get(requestKey);
  if (!cache) {
    cache = new Map();
    REQUEST_CACHE.set(requestKey, cache);
  }

  const existing = cache.get(cacheKey);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = fetcher();
  cache.set(cacheKey, promise);
  return promise;
}
```

```tsx
export const useProduct = routeLoader$(async (event) => {
  // Even if called from multiple places, the query runs only once per request
  return dedupe(event, `product:${event.params.id}`, () =>
    findProductById.execute({ id: event.params.id }),
  );
});
```

---

## Prefetching

Preload data before the user navigates to improve perceived performance.
Scratchy supports prefetching on hover, focus, and viewport intersection.

### Link Prefetching

Qwik City prefetches modules automatically on link visibility. Combine this with
data prefetching by warming the cache:

```tsx
import { component$ } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";

export const ProductCard = component$(
  ({ id, name }: { id: string; name: string }) => {
    return (
      <Link
        href={`/products/${id}`}
        prefetch
        class="block rounded-lg border p-4 transition-shadow hover:shadow-md"
      >
        <h3 class="font-semibold">{name}</h3>
      </Link>
    );
  },
);
```

### Programmatic Prefetching with server$()

For eager prefetching (e.g., on mouse enter), fire a server function that warms
the Redis cache so the subsequent navigation hits warm data:

```tsx
import { $, component$ } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";
import { findProductById } from "~/db/queries/products.js";
import { cached } from "~/lib/cache.js";
import { redis } from "~/lib/redis.js";

const warmProductCache = server$(async function (productId: string) {
  await cached(
    redis,
    `product:${productId}`,
    () => findProductById.execute({ id: productId }),
    { ttlSeconds: 60 },
  );
});

export const ProductLink = component$(
  ({ id, name }: { id: string; name: string }) => {
    const prefetch = $(() => {
      void warmProductCache(id);
    });

    return (
      <a
        href={`/products/${id}`}
        onMouseEnter$={prefetch}
        onFocus$={prefetch}
        class="text-primary-600 hover:text-primary-700 underline"
      >
        {name}
      </a>
    );
  },
);
```

---

## Server Functions

`server$()` creates ad-hoc server-side functions callable from the client. Use
them for one-off server operations that don't warrant a full tRPC procedure.

```tsx
import { component$, useSignal } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";
import { findRelatedProducts } from "~/db/queries/products.js";

const getRelatedProducts = server$(async function (productId: string) {
  const results = await findRelatedProducts.execute({ productId, limit: 5 });
  return results;
});

export default component$(() => {
  const related = useSignal<Awaited<
    ReturnType<typeof getRelatedProducts>
  > | null>(null);

  return (
    <div>
      <button
        onClick$={async () => {
          related.value = await getRelatedProducts("product-123");
        }}
        class="bg-primary-600 rounded-lg px-4 py-2 text-white"
      >
        Show Related
      </button>

      {related.value && (
        <ul class="mt-4 space-y-1">
          {related.value.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
});
```

> **When to use `server$()` vs tRPC:** Use `server$()` for simple, route-local
> operations. Use tRPC for shared business logic, validated inputs, and
> endpoints that might be consumed by multiple clients or tested independently.

---

## Error Handling in Loaders

Loaders have access to several error-handling primitives through the request
event.

### Redirects

```tsx
export const useProtectedData = routeLoader$(async (event) => {
  const user = event.sharedMap.get("user");
  if (!user) {
    // 302 redirect to login
    throw event.redirect(
      302,
      `/login?redirect=${encodeURIComponent(event.url.pathname)}`,
    );
  }
  return fetchProtectedData(user.id);
});
```

### Not Found

```tsx
export const usePost = routeLoader$(async ({ params, status }) => {
  const [post] = await findPostBySlug.execute({ slug: params.slug });
  if (!post) {
    status(404);
    return null;
  }
  return post;
});
```

### Error Responses

```tsx
export const useOrder = routeLoader$(async ({ params, fail }) => {
  const [order] = await findOrderById.execute({ id: params.orderId });

  if (!order) {
    return fail(404, { message: "Order not found" });
  }

  if (order.status === "cancelled") {
    return fail(410, { message: "This order has been cancelled" });
  }

  return order;
});
```

### Consuming Errors in Components

```tsx
export default component$(() => {
  const order = useOrder();

  if (order.value.failed) {
    return (
      <div class="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
        <p class="text-red-800 dark:text-red-200">{order.value.message}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 class="text-2xl font-bold">Order {order.value.id}</h1>
      <p>Status: {order.value.status}</p>
    </div>
  );
});
```

---

## Headers and Cache Control

Loaders can set response headers for CDN and browser caching. Use the
`headers()` export to control cache behavior per route.

```tsx
// routes/blog/[slug]/index.tsx
import { routeLoader$ } from "@builder.io/qwik-city";
import type {
  DocumentHead,
  StaticGenerateHandler,
} from "@builder.io/qwik-city";
import { findPostBySlug } from "~/db/queries/posts.js";

export const usePost = routeLoader$(async ({ params, status, headers }) => {
  const [post] = await findPostBySlug.execute({ slug: params.slug });
  if (!post) {
    status(404);
    return null;
  }

  // CDN caches for 60 seconds, serves stale for 10 minutes while revalidating
  headers.set(
    "Cache-Control",
    "public, max-age=60, s-maxage=60, stale-while-revalidate=600",
  );

  return post;
});

export const head: DocumentHead = ({ resolveValue }) => {
  const post = resolveValue(usePost);
  return {
    title: post?.title ?? "Not Found",
    meta: [{ name: "description", content: post?.excerpt ?? "" }],
  };
};
```

### Cache-Control Cheat Sheet

| Scenario           | Cache-Control Header                                                 |
| ------------------ | -------------------------------------------------------------------- |
| Public static page | `public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400` |
| Authenticated data | `private, no-store`                                                  |
| Semi-static (blog) | `public, max-age=60, s-maxage=60, stale-while-revalidate=600`        |
| API response       | `public, max-age=10, stale-while-revalidate=30`                      |
| Never cache        | `no-store, no-cache, must-revalidate, private`                       |

---

## Pagination Patterns

### Cursor-Based Pagination

Cursor-based pagination is more efficient for large datasets and works well with
real-time data that can shift between pages.

```tsx
// routes/posts/index.tsx
import { component$ } from "@builder.io/qwik";
import { Link, routeLoader$, useLocation } from "@builder.io/qwik-city";
import { gt } from "drizzle-orm";
import { db } from "~/db/index.js";
import { post } from "~/db/schema/post.js";

interface PaginatedPosts {
  items: (typeof post.$inferSelect)[];
  nextCursor: string | null;
}

export const usePosts = routeLoader$(
  async ({ url }): Promise<PaginatedPosts> => {
    const cursor = url.searchParams.get("cursor");
    const limit = 20;

    const query = db
      .select()
      .from(post)
      .orderBy(post.createdAt)
      .limit(limit + 1); // Fetch one extra to detect next page

    const items = cursor ? await query.where(gt(post.id, cursor)) : await query;

    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? (pageItems[pageItems.length - 1]?.id ?? null)
      : null;

    return { items: pageItems, nextCursor };
  },
);

export default component$(() => {
  const data = usePosts();

  return (
    <div>
      <ul class="space-y-4">
        {data.value.items.map((p) => (
          <li
            key={p.id}
            class="rounded-lg border p-4"
          >
            <h2 class="font-semibold">{p.title}</h2>
          </li>
        ))}
      </ul>

      {data.value.nextCursor && (
        <Link
          href={`/posts?cursor=${data.value.nextCursor}`}
          class="bg-primary-600 mt-4 inline-block rounded-lg px-4 py-2 text-white"
        >
          Load More
        </Link>
      )}
    </div>
  );
});
```

### Offset-Based Pagination

Offset pagination is simpler and works well for smaller datasets with
predictable page counts.

```tsx
import { routeLoader$ } from "@builder.io/qwik-city";
import { sql } from "drizzle-orm";
import { db } from "~/db/index.js";
import { product } from "~/db/schema/product.js";

interface PaginatedProducts {
  items: (typeof product.$inferSelect)[];
  total: number;
  page: number;
  totalPages: number;
}

export const useProducts = routeLoader$(
  async ({ url }): Promise<PaginatedProducts> => {
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const limit = 20;
    const offset = (page - 1) * limit;

    const [items, countResult] = await Promise.all([
      db.select().from(product).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(product),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  },
);
```

---

## Search and Filtering

Use URL search params as the source of truth for search and filter state. This
makes the state shareable via URL, works with the browser back button, and
triggers loader re-runs automatically.

```tsx
// routes/products/index.tsx
import { component$, useSignal } from "@builder.io/qwik";
import {
  Form,
  routeLoader$,
  useLocation,
  useNavigate,
} from "@builder.io/qwik-city";
import { and, asc, desc, eq, ilike } from "drizzle-orm";
import { db } from "~/db/index.js";
import { product } from "~/db/schema/product.js";

type SortField = "name" | "price" | "createdAt";
type SortOrder = "asc" | "desc";

export const useFilteredProducts = routeLoader$(async ({ url }) => {
  const query = url.searchParams.get("q") ?? "";
  const category = url.searchParams.get("category");
  const sortBy = (url.searchParams.get("sort") ?? "createdAt") as SortField;
  const order = (url.searchParams.get("order") ?? "desc") as SortOrder;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const limit = 20;

  const conditions = [];

  if (query) {
    conditions.push(ilike(product.name, `%${query}%`));
  }
  if (category) {
    conditions.push(eq(product.category, category));
  }

  const orderFn = order === "asc" ? asc : desc;

  const items = await db
    .select()
    .from(product)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(orderFn(product[sortBy]))
    .limit(limit)
    .offset((page - 1) * limit);

  return { items, query, category, sortBy, order, page };
});

export default component$(() => {
  const data = useFilteredProducts();
  const nav = useNavigate();
  const loc = useLocation();

  return (
    <div>
      <Form
        action={loc.url.pathname}
        method="get"
        class="flex gap-4"
      >
        <input
          name="q"
          type="search"
          value={data.value.query}
          placeholder="Search products..."
          class="flex-1 rounded-lg border px-4 py-2"
        />
        <select
          name="category"
          class="rounded-lg border px-4 py-2"
        >
          <option value="">All Categories</option>
          <option value="electronics">Electronics</option>
          <option value="clothing">Clothing</option>
          <option value="books">Books</option>
        </select>
        <button
          type="submit"
          class="bg-primary-600 rounded-lg px-6 py-2 text-white"
        >
          Search
        </button>
      </Form>

      <ul class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.value.items.map((p) => (
          <li
            key={p.id}
            class="rounded-lg border p-4"
          >
            <h3 class="font-semibold">{p.name}</h3>
            <p class="text-gray-600">${p.price}</p>
          </li>
        ))}
      </ul>

      {data.value.items.length === 0 && (
        <p class="mt-8 text-center text-gray-500">No products found</p>
      )}
    </div>
  );
});
```

---

## Best Practices

1. **Use `routeLoader$` for initial page data** — it runs on the server during
   SSR and ensures data is available before the component renders.

2. **Keep loaders thin** — loaders should call into tRPC procedures, database
   queries, or cache helpers. Business logic belongs in the service/mutation
   layer, not in the loader itself.

3. **Parallelize independent loaders** — define separate `routeLoader$` exports
   for each independent data source. They execute concurrently.

4. **Defer slow queries** — use `defer()` for any data fetch that takes longer
   than ~200 ms. Show a skeleton or loading state while it streams in.

5. **Cache aggressively** — use Redis with stale-while-revalidate to reduce
   database load. Set appropriate TTLs based on how frequently data changes.

6. **Use URL search params for state** — search, filter, sort, and pagination
   state belongs in the URL. This makes it shareable, bookmarkable, and
   compatible with the browser back button.

7. **Deduplicate within a request** — use `sharedMap` or a request-scoped cache
   to avoid running the same query multiple times within a single server
   request.

8. **Set cache headers** — every loader that returns public data should set
   `Cache-Control` headers so CDNs and browsers can cache the response.

9. **Handle errors explicitly** — always check for missing data and use
   `status()`, `fail()`, or `redirect()` instead of letting errors propagate as
   unhandled exceptions.

10. **Type everything** — use `$inferSelect` and `$inferInsert` from Drizzle
    schemas, and let TypeScript infer loader return types. Never use `any`.

---

## Anti-Patterns

### ❌ Don't fetch data inside components with useVisibleTask$

```tsx
// BAD — Client-side fetch causes a waterfall and flash of loading state
export default component$(() => {
  const data = useSignal<Product[]>([]);

  useVisibleTask$(async () => {
    const res = await fetch("/api/products");
    data.value = await res.json();
  });

  return <ProductList products={data.value} />;
});

// GOOD — Server-side loader, data available on first render
export const useProducts = routeLoader$(async () => {
  return findAllProducts.execute();
});

export default component$(() => {
  const products = useProducts();
  return <ProductList products={products.value} />;
});
```

### ❌ Don't put business logic in loaders

```tsx
// BAD — Pricing logic in the loader
export const useCart = routeLoader$(async ({ sharedMap }) => {
  const userId = sharedMap.get("userId") as string;
  const items = await findCartItems.execute({ userId });
  // Business logic should live elsewhere
  const total = items.reduce((sum, item) => {
    const discount = item.quantity > 5 ? 0.9 : 1;
    return sum + item.price * item.quantity * discount;
  }, 0);
  return { items, total };
});

// GOOD — Call a tRPC procedure that encapsulates business logic
export const useCart = routeLoader$(async (event) => {
  const caller = createServerCaller(event);
  return caller.cart.getSummary();
});
```

### ❌ Don't ignore errors from loaders

```tsx
// BAD — No null check, crashes if product is not found
export default component$(() => {
  const product = useProduct();
  return <h1>{product.value.name}</h1>;
});

// GOOD — Handle the null case
export default component$(() => {
  const product = useProduct();

  if (!product.value) {
    return <p class="text-gray-500">Product not found</p>;
  }

  return <h1>{product.value.name}</h1>;
});
```

### ❌ Don't create sequential loader chains for independent data

```tsx
// BAD — These run sequentially because of the dependency
export const useUser = routeLoader$(async ({ sharedMap }) => {
  return findUser.execute({ id: sharedMap.get("userId") as string });
});

export const useOrders = routeLoader$(async ({ resolveValue }) => {
  const user = await resolveValue(useUser);
  // Orders don't actually need user data — they just need the userId
  return findOrders.execute({ userId: user.id });
});

// GOOD — Both loaders read userId from sharedMap independently
export const useUser = routeLoader$(async ({ sharedMap }) => {
  return findUser.execute({ id: sharedMap.get("userId") as string });
});

export const useOrders = routeLoader$(async ({ sharedMap }) => {
  return findOrders.execute({ userId: sharedMap.get("userId") as string });
});
```

### ❌ Don't cache user-specific data with shared keys

```tsx
// BAD — All users see the same cached dashboard
return cached(redis, "dashboard", () => fetchDashboard(userId), {
  ttlSeconds: 60,
});

// GOOD — Cache key includes the user ID
return cached(redis, `dashboard:${userId}`, () => fetchDashboard(userId), {
  ttlSeconds: 60,
});
```

---

## Reference Links

- [Qwik City routeLoader$](https://qwik.dev/docs/route-loader/)
- [Qwik City server$](https://qwik.dev/docs/server$/)
- [tRPC Server-Side Calls](https://trpc.io/docs/server/server-side-calls)
- [Drizzle ORM Queries](https://orm.drizzle.team/docs/rqb)
- [Drizzle Prepared Statements](https://orm.drizzle.team/docs/perf-queries)
- [HTTP Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)

## Related Documentation

- [API Design](./api-design.md) — tRPC router structure and REST endpoints
- [Data Layer](./data-layer.md) — Drizzle schemas, queries, and prepared
  statements
- [Forms & Actions](./forms-and-actions.md) — `routeAction$` for write
  operations
- [Streaming](./streaming.md) — Progressive rendering with `defer()` and
  `<Await>`
- [Error Handling](./error-handling.md) — Error handling in loaders
- [Middleware](./middleware.md) — `onRequest` guards that run before loaders
