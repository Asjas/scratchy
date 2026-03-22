# Streaming & Progressive Rendering

> **Diátaxis type: [How-to Guide](https://diataxis.fr/how-to-guides/) +
> [Explanation](https://diataxis.fr/explanation/)** — shows how to stream HTML
> from workers, and explains the progressive rendering architecture and Qwik
> resumability model.

Scratchy streams HTML from Piscina workers to the client progressively,
delivering a fast shell first and filling in deferred content as it resolves.
Combined with Qwik's resumability model, the client becomes interactive with
near-zero JavaScript upfront.

## Architecture Overview

```
Client (Browser)
  ▲  chunked HTML stream
  │
Fastify Main Thread
  ▲  piped ReadableStream
  │
Piscina Worker Pool
  ├── Worker #1: renderToStream(route="/dashboard")
  ├── Worker #2: renderToStream(route="/settings")
  └── Worker #3: renderToStream(route="/blog/my-post")
```

1. A request hits Fastify on the main thread.
2. Fastify dispatches a render task to a Piscina worker.
3. The worker calls `renderToStream()`, which returns a `ReadableStream`.
4. Chunks are piped back to the main thread via the worker's message channel.
5. Fastify writes each chunk to the response with `Transfer-Encoding: chunked`.
6. The browser paints incrementally as chunks arrive.

### Worker-to-Main-Thread Streaming

Workers cannot return a stream directly from `Piscina.run()`. Instead, use a
message channel to push chunks as they are rendered:

```typescript
// renderer/worker.ts
import { parentPort } from "node:worker_threads";

interface StreamTask {
  type: "stream-ssr";
  route: string;
  props?: Record<string, unknown>;
}

export default async function handler(
  task: StreamTask,
): Promise<{ done: true }> {
  const port = parentPort;
  if (!port) {
    throw new Error("Worker must run inside a worker thread");
  }

  const stream = await renderRouteToStream({
    route: task.route,
    props: task.props,
  });
  const reader = stream.getReader();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    port.postMessage({ chunk: value });
  }

  port.postMessage({ chunk: null }); // signal end-of-stream
  return { done: true };
}
```

On the main thread, listen for messages and pipe chunks into the Fastify reply:

```typescript
// routes/pages/index.ts
import type { FastifyPluginAsync } from "fastify";

const routes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/*", async (request, reply) => {
    reply.raw.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "transfer-encoding": "chunked",
      "x-content-type-options": "nosniff",
    });

    // Stream the rendered HTML directly to the response.
    const stream = await renderRouteToStream(request.url);
    const reader = stream.getReader();

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        // `value` is typically a Uint8Array chunk of HTML.
        reply.raw.write(value);
      }
    } finally {
      // Always end the response once the stream finishes or errors.
      reply.raw.end();
    }
  });
};

export default routes;
```

## Qwik Resumability

Traditional SSR frameworks **hydrate**: they re-execute every component on the
client to attach event listeners and rebuild the component tree. Qwik
**resumes**: it serializes the application state into the HTML and recovers it
on the client without replaying component code.

### How Resumability Works

```
┌──────────────────────────────────────────────────┐
│  Server                                          │
│  1. Render components → HTML                     │
│  2. Serialize state, listeners, QRLs into HTML   │
│  3. Stream to client                             │
└──────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────┐
│  Client                                          │
│  1. Paint HTML immediately (zero JS executed)    │
│  2. On user interaction → load only the handler  │
│  3. Handler restores serialized state and runs   │
└──────────────────────────────────────────────────┘
```

The key difference from hydration:

| Aspect              | Hydration (React/Next.js)     | Resumability (Qwik)               |
| ------------------- | ----------------------------- | --------------------------------- |
| JS on initial load  | All component code downloaded | Zero JS until interaction         |
| Time to interactive | After hydration completes     | Instant (lazy per interaction)    |
| Serialization       | State lives in JS bundles     | State embedded in HTML attributes |
| Scaling             | More components → more JS     | More components → same JS (zero)  |

### Serialization Model

Qwik serializes into `<script type="qwik/json">` blocks embedded in the HTML.
When a user clicks a button, Qwik loads only the handler code for that button,
deserializes only the state it needs, and executes. No framework bootstrap
required.

```tsx
import { component$, useSignal } from "@builder.io/qwik";

export const Counter = component$(() => {
  const count = useSignal(0);

  // This handler is a QRL — a lazy-loadable reference.
  // It is NOT shipped to the client until the user clicks.
  return <button onClick$={() => count.value++}>Count: {count.value}</button>;
});
```

On the server, the rendered HTML includes the serialized signal value and a QRL
reference for the click handler. On the client, clicking the button triggers a
network request for only the click handler chunk.

## Progressive Rendering

Scratchy renders pages in three progressive phases:

```
Phase 1: Shell          Phase 2: Content         Phase 3: Interactive
┌──────────────────┐    ┌──────────────────┐     ┌──────────────────┐
│ <html>           │    │ <html>           │     │ <html>           │
│ <head>...</head> │    │ <head>...</head> │     │ <head>...</head> │
│ <body>           │    │ <body>           │     │ <body>           │
│   <nav>...</nav> │    │   <nav>...</nav> │     │   <nav>...</nav> │
│   ░░░░░░░░░░░░░░ │ →  │   <main>        │  →  │   <main>        │
│   ░░ loading ░░░ │    │     Real content │     │     Real content │
│   ░░░░░░░░░░░░░░ │    │   </main>       │     │     [interactive]│
│ </body>          │    │ </body>          │     │   </main>       │
│ </html>          │    │ </html>          │     │ </body></html>  │
└──────────────────┘    └──────────────────┘     └──────────────────┘
TTFB: ~50ms             FCP: ~150ms              TTI: on interaction
```

### Shell-First Streaming

Flush the document shell (doctype, head, navigation) before any data resolves:

```typescript
// renderer/stream-shell.ts
const SHELL_OPEN = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="/assets/global.css" />
</head>
<body>
  <nav><!-- static nav markup --></nav>
  <main>`;

const SHELL_CLOSE = `</main>
</body>
</html>`;

export function createShellStream(
  contentStream: ReadableStream<string>,
): ReadableStream<string> {
  return new ReadableStream({
    async start(controller) {
      // Flush the shell immediately
      controller.enqueue(SHELL_OPEN);

      const reader = contentStream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.enqueue(value);
      }

      controller.enqueue(SHELL_CLOSE);
      controller.close();
    },
  });
}
```

## Deferred Data with `defer()` and `<Await>`

Inspired by Remix's `defer()` pattern, Scratchy allows route loaders to return a
mix of resolved and pending data. Resolved data is included in the initial HTML;
pending data streams in later and replaces a placeholder.

### Route Loader with Deferred Data

```typescript
// routes/dashboard/index.tsx
import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { Await } from "~/components/qwik/await";

export const useDashboardData = routeLoader$(async ({ defer }) => {
  // Critical data — fetched before the shell is sent
  const user = await fetchCurrentUser();

  // Non-critical data — streamed in after the shell
  const analyticsPromise = fetchAnalytics(user.id);
  const notificationsPromise = fetchNotifications(user.id);

  return defer({
    user,
    analytics: analyticsPromise,
    notifications: notificationsPromise,
  });
});

export default component$(() => {
  const data = useDashboardData();

  return (
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Renders immediately with the shell */}
      <section class="lg:col-span-3">
        <h1>Welcome, {data.value.user.name}</h1>
      </section>

      {/* Streams in when analytics resolve */}
      <Await
        resolve={data.value.analytics}
        fallback={<AnalyticsSkeleton />}
      >
        {(analytics) => <AnalyticsPanel data={analytics} />}
      </Await>

      {/* Streams in when notifications resolve */}
      <Await
        resolve={data.value.notifications}
        fallback={<NotificationsSkeleton />}
      >
        {(notifications) => <NotificationsList items={notifications} />}
      </Await>
    </div>
  );
});
```

### Implementing the `<Await>` Component

```tsx
// components/qwik/await.tsx
import {
  Resource,
  type Signal,
  component$,
  useResource$,
} from "@builder.io/qwik";
import type { JSXOutput } from "@builder.io/qwik";

interface AwaitProps<T> {
  resolve: Promise<T> | T;
  fallback: JSXOutput;
  children: (data: T) => JSXOutput;
}

export const Await = component$(<T,>(props: AwaitProps<T>) => {
  const resource = useResource$(async () => {
    return await props.resolve;
  });

  return (
    <Resource
      value={resource}
      onPending={() => <>{props.fallback}</>}
      onRejected={(error) => (
        <div class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          Failed to load: {error.message}
        </div>
      )}
      onResolved={(data) => <>{props.children(data)}</>}
    />
  );
});
```

## Route-Level Loading States (`loading.tsx`)

Inspired by Next.js, each route directory can include a `loading.tsx` file that
provides an instant loading UI while the route's data resolves. The loading UI
is streamed as part of the shell and replaced once content is ready.

### File Convention

```
src/client/routes/
├── dashboard/
│   ├── index.tsx          # Route component (renders after data loads)
│   └── loading.tsx        # Loading skeleton (renders immediately)
├── blog/
│   ├── index.tsx
│   ├── loading.tsx
│   └── [slug]/
│       ├── index.tsx
│       └── loading.tsx    # Per-slug loading state
└── layout.tsx             # Shared layout (always in the shell)
```

### Loading Component

```tsx
// routes/dashboard/loading.tsx
import { component$ } from "@builder.io/qwik";

export default component$(() => {
  return (
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section class="lg:col-span-3">
        <div class="h-8 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      </section>
      <div class="animate-pulse rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div class="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
        <div class="mt-4 h-32 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
      <div class="animate-pulse rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div class="h-4 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
        <div class="mt-4 space-y-2">
          <div class="h-4 rounded bg-gray-200 dark:bg-gray-700" />
          <div class="h-4 rounded bg-gray-200 dark:bg-gray-700" />
          <div class="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    </div>
  );
});
```

### Rendering Pipeline with Loading States

When a route has a `loading.tsx`, the streaming pipeline works as follows:

```typescript
// renderer/route-renderer.ts
interface RouteRenderTask {
  route: string;
  hasLoadingState: boolean;
  props: Record<string, unknown>;
}

async function renderRouteWithLoading(
  task: RouteRenderTask,
): Promise<ReadableStream<string>> {
  if (!task.hasLoadingState) {
    return renderRouteToStream(task.route, task.props);
  }

  return new ReadableStream({
    async start(controller) {
      // Immediately flush the loading skeleton
      const loadingHtml = await renderLoadingComponent(task.route);
      controller.enqueue(`<div id="route-loading">${loadingHtml}</div>`);

      // Render the actual route content
      const contentHtml = await renderRouteContent(task.route, task.props);

      // Replace the loading skeleton with real content using an
      // inline script that swaps the DOM (out-of-order streaming)
      controller.enqueue(`<div hidden id="route-content">${contentHtml}</div>`);
      controller.enqueue(`<script>
        document.getElementById("route-loading").replaceWith(
          document.getElementById("route-content").firstElementChild
        );
        document.getElementById("route-content")?.remove();
      </script>`);

      controller.close();
    },
  });
}
```

## Suspense Boundaries

Place Suspense boundaries around independently-loadable sections of the page.
Each boundary streams its fallback immediately and replaces it with content when
ready. This lets different parts of the page resolve at different times.

### Boundary Placement Guidelines

```tsx
import { Resource, component$, useResource$ } from "@builder.io/qwik";

export default component$(() => {
  return (
    <div class="flex gap-6">
      {/* Sidebar: independent data, own loading state */}
      <aside class="w-64">
        <SuspendedSidebar />
      </aside>

      <div class="flex-1">
        {/* Main content: critical path, loads first */}
        <SuspendedMainContent />

        {/* Comments: below the fold, loads last */}
        <SuspendedComments />
      </div>
    </div>
  );
});

const SuspendedSidebar = component$(() => {
  const sidebarData = useResource$(async () => {
    return fetchSidebarData();
  });

  return (
    <Resource
      value={sidebarData}
      onPending={() => <SidebarSkeleton />}
      onRejected={(error) => <SidebarError message={error.message} />}
      onResolved={(data) => <Sidebar data={data} />}
    />
  );
});

const SuspendedMainContent = component$(() => {
  const content = useResource$(async () => {
    return fetchMainContent();
  });

  return (
    <Resource
      value={content}
      onPending={() => <ContentSkeleton />}
      onRejected={(error) => <ContentError message={error.message} />}
      onResolved={(data) => <MainContent data={data} />}
    />
  );
});

const SuspendedComments = component$(() => {
  const comments = useResource$(async () => {
    return fetchComments();
  });

  return (
    <Resource
      value={comments}
      onPending={() => <CommentsSkeleton />}
      onRejected={(error) => <CommentsError message={error.message} />}
      onResolved={(data) => <CommentsList items={data} />}
    />
  );
});
```

### Where to Place Boundaries

| Location                         | Reason                                            |
| -------------------------------- | ------------------------------------------------- |
| Around each data-dependent block | Each block resolves independently                 |
| Below the fold                   | Non-visible content can load later                |
| Around third-party widgets       | Isolate slow external data from the critical path |
| Around user-specific content     | Personalized data is often slower (no CDN cache)  |
| **NOT** around static content    | Static content should be in the shell             |

## Resource Component: `useResource$`

Qwik's `useResource$` is the primary mechanism for async data in components. It
tracks reactive dependencies and re-fetches when they change.

### Basic Usage

```tsx
import {
  Resource,
  component$,
  useResource$,
  useSignal,
} from "@builder.io/qwik";

interface Product {
  id: string;
  name: string;
  price: number;
}

export const ProductList = component$(() => {
  const category = useSignal("electronics");
  const page = useSignal(1);

  const products = useResource$<Product[]>(async ({ track, cleanup }) => {
    // Track reactive dependencies — re-fetch when these change
    const cat = track(() => category.value);
    const p = track(() => page.value);

    const controller = new AbortController();
    cleanup(() => controller.abort());

    const response = await fetch(
      `/trpc/products.list?category=${cat}&page=${p}`,
      {
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to load products: ${response.statusText}`);
    }

    return response.json();
  });

  return (
    <div>
      <select
        value={category.value}
        onChange$={(_, el) => {
          category.value = el.value;
          page.value = 1;
        }}
      >
        <option value="electronics">Electronics</option>
        <option value="books">Books</option>
      </select>

      <Resource
        value={products}
        onPending={() => <p class="text-gray-500">Loading products…</p>}
        onRejected={(error) => (
          <p class="text-red-600">Error: {error.message}</p>
        )}
        onResolved={(items) => (
          <ul class="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                class="rounded border p-3"
              >
                {item.name} — ${item.price}
              </li>
            ))}
          </ul>
        )}
      />

      <div class="mt-4 flex gap-2">
        <button
          disabled={page.value <= 1}
          onClick$={() => page.value--}
        >
          Previous
        </button>
        <button onClick$={() => page.value++}>Next</button>
      </div>
    </div>
  );
});
```

### Key Rules for `useResource$`

1. Always call `track()` for every reactive value the resource depends on.
2. Use `cleanup()` to abort in-flight requests when dependencies change.
3. Handle errors in `onRejected` — never let errors silently disappear.
4. Return typed data — avoid `unknown` in the resource generic.

## Streaming SSR in Workers

### `renderToStream` Implementation

Workers use Qwik's streaming render API to produce HTML chunks:

```typescript
// renderer/render-to-stream.ts
import { renderToStream as qwikRenderToStream } from "@builder.io/qwik/server";
import { manifest } from "@qwik-client-manifest";

interface RenderOptions {
  route: string;
  props: Record<string, unknown>;
  abortSignal?: AbortSignal;
}

export async function renderRouteToStream(
  options: RenderOptions,
): Promise<ReadableStream<string>> {
  const { route, props, abortSignal } = options;

  const { stream } = await qwikRenderToStream(
    <App route={route} {...props} />,
    {
      manifest,
      containerTagName: "div",
      qwikLoader: { include: "auto" },
      // Flush the head and shell as early as possible
      streaming: {
        flush: "auto",
      },
      serverData: {
        route,
        ...props,
      },
    },
  );

  return wrapWithAbort(stream, abortSignal);
}

function wrapWithAbort(
  stream: ReadableStream<string>,
  signal?: AbortSignal,
): ReadableStream<string> {
  if (!signal) return stream;

  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();
      const onAbort = () => {
        reader.cancel("Client disconnected");
        controller.close();
      };
      signal.addEventListener("abort", onAbort, { once: true });

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (error: unknown) {
        if (signal.aborted) {
          controller.close();
        } else {
          controller.error(error);
        }
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    },
  });
}
```

### Chunk Flushing Strategy

Control when chunks are flushed to balance latency and throughput:

```typescript
// renderer/flush-strategy.ts
interface FlushConfig {
  /** Flush immediately after the shell (head + nav). */
  flushShell: boolean;
  /** Minimum bytes to buffer before flushing content chunks. */
  minChunkBytes: number;
  /** Maximum time (ms) to buffer before forcing a flush. */
  maxBufferMs: number;
}

const DEFAULT_FLUSH_CONFIG: FlushConfig = {
  flushShell: true,
  minChunkBytes: 4096,
  maxBufferMs: 50,
};

export function createBufferedStream(
  source: ReadableStream<string>,
  config: FlushConfig = DEFAULT_FLUSH_CONFIG,
): ReadableStream<string> {
  const encoder = new TextEncoder();
  let buffer = "";
  let lastFlush = performance.now();
  let isShellFlushed = false;

  return new ReadableStream({
    async start(controller) {
      const reader = source.getReader();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += value;

        // Flush the shell as soon as it is complete
        if (!isShellFlushed && buffer.includes("</nav>")) {
          controller.enqueue(buffer);
          buffer = "";
          isShellFlushed = true;
          lastFlush = performance.now();
          continue;
        }

        const elapsed = performance.now() - lastFlush;
        const byteLength = encoder.encode(buffer).byteLength;

        if (
          byteLength >= config.minChunkBytes ||
          elapsed >= config.maxBufferMs
        ) {
          controller.enqueue(buffer);
          buffer = "";
          lastFlush = performance.now();
        }
      }

      // Flush remaining buffer
      if (buffer.length > 0) {
        controller.enqueue(buffer);
      }
      controller.close();
    },
  });
}
```

## HTTP Streaming

### Transfer-Encoding: chunked

Fastify streams responses using `Transfer-Encoding: chunked`. Set the correct
headers and disable buffering at every layer:

```typescript
// routes/pages/stream-handler.ts
import type { FastifyPluginAsync } from "fastify";

const routes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/*", async (request, reply) => {
    const raw = reply.raw;

    raw.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "transfer-encoding": "chunked",
      // Prevent proxy buffering (nginx, CloudFront, etc.)
      "x-accel-buffering": "no",
      "cache-control": "no-cache, no-transform",
      "x-content-type-options": "nosniff",
    });

    const stream = await renderRouteToStream({
      route: request.url,
      props: { user: request.user },
      abortSignal: request.raw.signal,
    });

    const reader = stream.getReader();

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      // write() returns false if the kernel buffer is full.
      // In that case, wait for the drain event before continuing.
      const canContinue = raw.write(value);
      if (!canContinue) {
        await new Promise<void>((resolve) => raw.once("drain", resolve));
      }
    }

    raw.end();
  });
};

export default routes;
```

### Early Flush

Send the `<head>` and critical CSS before any data fetching begins. This lets
the browser start downloading stylesheets and fonts while the server fetches
data:

```typescript
// renderer/early-flush.ts
export function buildEarlyFlushHead(route: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="stylesheet" href="/assets/global.css" />
  <link rel="preload" href="/assets/vendor-qwik.js" as="script" />
  ${getRouteSpecificHead(route)}
</head>
<body>`;
}

function getRouteSpecificHead(route: string): string {
  // Return route-specific preloads, meta tags, title, etc.
  return `<title>${routeToTitle(route)}</title>`;
}
```

## Out-of-Order Streaming

Out-of-order streaming sends placeholder elements first, then streams the real
content later and uses an inline script to swap them in place. This allows slow
data sources to resolve independently without blocking faster ones.

### How It Works

```
Time →

1. Server sends shell + placeholder divs:
   <div id="slot-analytics">⏳ Loading analytics…</div>
   <div id="slot-feed">⏳ Loading feed…</div>

2. Feed data resolves first. Server streams:
   <template id="c-feed"><div>Real feed content</div></template>
   <script>replaceSlot("feed")</script>

3. Analytics resolves later. Server streams:
   <template id="c-analytics"><div>Real analytics</div></template>
   <script>replaceSlot("analytics")</script>

4. Server ends the response.
```

### Implementation

```typescript
// renderer/out-of-order.ts
const REPLACE_SCRIPT = `<script>
function $rs(id) {
  var slot = document.getElementById("slot-" + id);
  var content = document.getElementById("c-" + id);
  if (slot && content) {
    slot.replaceWith(content.content);
    content.remove();
  }
}
</script>`;

interface SlotDefinition {
  id: string;
  fallback: string;
  resolve: () => Promise<string>;
}

export function createOutOfOrderStream(
  shellHtml: string,
  slots: SlotDefinition[],
): ReadableStream<string> {
  return new ReadableStream({
    async start(controller) {
      // Emit the shell with placeholders
      let html = shellHtml;
      for (const slot of slots) {
        html += `<div id="slot-${slot.id}">${slot.fallback}</div>`;
      }
      html += REPLACE_SCRIPT;
      controller.enqueue(html);

      // Resolve all slots concurrently, stream each as it completes
      const pending = slots.map(async (slot) => {
        const content = await slot.resolve();
        controller.enqueue(
          `<template id="c-${slot.id}">${content}</template>` +
            `<script>$rs("${slot.id}")</script>`,
        );
      });

      await Promise.allSettled(pending);
      controller.close();
    },
  });
}
```

### Usage in a Route

```typescript
const stream = createOutOfOrderStream(shellHtml, [
  {
    id: "analytics",
    fallback: '<div class="animate-pulse h-32 rounded bg-gray-200" />',
    resolve: () => renderAnalyticsPanel(userId),
  },
  {
    id: "feed",
    fallback: '<div class="animate-pulse h-64 rounded bg-gray-200" />',
    resolve: () => renderActivityFeed(userId),
  },
  {
    id: "recommendations",
    fallback: '<div class="animate-pulse h-48 rounded bg-gray-200" />',
    resolve: () => renderRecommendations(userId),
  },
]);
```

## Performance Monitoring

### Key Metrics

| Metric                    | Target    | Measurement Point                         |
| ------------------------- | --------- | ----------------------------------------- |
| Time to First Byte (TTFB) | < 100ms   | First byte of the response reaches client |
| First Contentful Paint    | < 200ms   | Shell + loading skeletons painted         |
| Largest Contentful Paint  | < 1.0s    | Primary content visible                   |
| Time to Interactive       | On-demand | Qwik loads handler on first interaction   |

### Server-Side Timing

```typescript
// hooks/stream-timing.ts
import fp from "fastify-plugin";

export default fp(async function streamTiming(fastify) {
  fastify.addHook("onRequest", async (request) => {
    request.streamMetrics = {
      requestStart: performance.now(),
      firstByteAt: 0,
      shellCompleteAt: 0,
      streamEndAt: 0,
    };
  });

  fastify.addHook("onSend", async (request) => {
    const metrics = request.streamMetrics;
    if (!metrics) return;

    metrics.firstByteAt = performance.now();
    const ttfb = metrics.firstByteAt - metrics.requestStart;

    request.log.info({ ttfb: Math.round(ttfb) }, "TTFB measured");
  });

  fastify.addHook("onResponse", async (request) => {
    const metrics = request.streamMetrics;
    if (!metrics) return;

    metrics.streamEndAt = performance.now();
    const totalStreamTime = metrics.streamEndAt - metrics.requestStart;

    request.log.info(
      {
        totalStreamTimeMs: Math.round(totalStreamTime),
        ttfbMs: Math.round(metrics.firstByteAt - metrics.requestStart),
      },
      "stream complete",
    );
  });
});
```

### Server-Timing Header

Expose timing data via the `Server-Timing` header for browser DevTools:

```typescript
reply.header(
  "server-timing",
  [
    `ttfb;dur=${Math.round(ttfb)}`,
    `render;dur=${Math.round(renderTime)}`,
    `stream;dur=${Math.round(totalStreamTime)}`,
  ].join(", "),
);
```

## Error Handling During Streaming

Once the response has started streaming, the status code is already sent (200).
Errors that occur mid-stream must be handled inline.

### Error During a Slot Resolution

```typescript
async function safeResolveSlot(slot: SlotDefinition): Promise<string> {
  try {
    return await slot.resolve();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Slot "${slot.id}" failed:`, message);

    return `<div class="rounded border border-red-200 bg-red-50 p-4 text-red-700">
      <p class="font-medium">Something went wrong loading this section.</p>
    </div>`;
  }
}
```

### Error During Full-Page Streaming

If the error occurs before the shell is flushed, return a standard error
response. If it occurs after, inject an error marker into the stream:

```typescript
// renderer/stream-error-handler.ts
export function handleStreamError(
  controller: ReadableStreamDefaultController<string>,
  error: unknown,
  shellFlushed: boolean,
): void {
  const message = error instanceof Error ? error.message : "Render failed";
  console.error("Stream error:", message);

  if (!shellFlushed) {
    // Shell not sent yet — we can still send a proper error page
    controller.enqueue(
      `<!DOCTYPE html><html><body>` +
        `<h1>500 — Server Error</h1>` +
        `<p>The page could not be rendered.</p>` +
        `</body></html>`,
    );
  } else {
    // Shell already sent — inject an error notice into the stream
    controller.enqueue(
      `<div style="position:fixed;bottom:1rem;right:1rem;background:#fee;border:1px solid #f00;padding:1rem;border-radius:0.5rem;z-index:9999">` +
        `<strong>Rendering error</strong><br>Part of this page failed to load.` +
        `</div>`,
    );
  }

  controller.close();
}
```

### Client Disconnect Handling

When the client disconnects mid-stream (navigates away, closes tab), abort the
render to free worker resources:

```typescript
// routes/pages/index.ts
fastify.get("/*", async (request, reply) => {
  const abortController = new AbortController();

  // Abort rendering when the client disconnects
  request.raw.on("close", () => {
    if (!request.raw.writableEnded) {
      abortController.abort("Client disconnected");
    }
  });

  const stream = await renderRouteToStream({
    route: request.url,
    props: {},
    abortSignal: abortController.signal,
  });

  // ... pipe stream to reply.raw
});
```

In the worker, check the abort signal before expensive operations:

```typescript
export default async function handler(task: StreamTask): Promise<void> {
  const signal = task.abortSignal;

  for (const section of sections) {
    if (signal?.aborted) {
      return; // Stop rendering, release the worker
    }
    await renderSection(section);
  }
}
```

## Best Practices

1. **Flush the shell immediately.** The browser needs the `<head>` to start
   downloading CSS and fonts. Never wait for data before sending the shell.

2. **Use out-of-order streaming for independent data.** If the sidebar and main
   content load from different sources, stream them independently so a slow
   sidebar does not block the main content.

3. **Set task timeouts on workers.** A runaway render should not hold a worker
   indefinitely. Use Piscina's `taskTimeout` option:

   ```typescript
   {
     taskTimeout: 10_000, // 10 seconds max per render
   }
   ```

4. **Disable proxy buffering.** Reverse proxies (nginx, CloudFront) may buffer
   chunked responses. Set `X-Accel-Buffering: no` and configure your proxy to
   pass chunks through.

5. **Provide meaningful skeletons.** Loading skeletons should match the layout
   of the final content to prevent layout shift (CLS).

6. **Abort on disconnect.** Always wire up the client's `close` event to an
   `AbortController` so workers stop rendering for disconnected clients.

7. **Monitor TTFB and stream duration.** Use the `Server-Timing` header and
   structured logging to track streaming performance in production.

8. **Keep serialized state small.** Qwik serializes state into the HTML. Avoid
   storing large arrays or objects in signals — fetch them lazily via
   `useResource$` instead.

## Anti-Patterns

### ❌ Don't await all data before streaming

```typescript
// BAD — Blocks the entire response until everything resolves
const [user, analytics, feed] = await Promise.all([
  fetchUser(),
  fetchAnalytics(),
  fetchFeed(),
]);
reply.send(renderFullPage(user, analytics, feed));

// GOOD — Stream the shell immediately, defer non-critical data
reply.raw.write(shell);
const stream = createOutOfOrderStream(shell, [
  { id: "analytics", fallback: skeleton, resolve: fetchAnalytics },
  { id: "feed", fallback: skeleton, resolve: fetchFeed },
]);
```

### ❌ Don't perform streaming renders on the main thread

```typescript
// BAD — Blocks the Fastify event loop
const html = await renderToString(<App />);
reply.send(html);

// GOOD — Offload to a Piscina worker
const result = await fastify.runTask({ type: "stream-ssr", route: request.url });
```

### ❌ Don't ignore backpressure

```typescript
// BAD — May overflow the kernel write buffer
for (const chunk of chunks) {
  raw.write(chunk); // ignores return value
}

// GOOD — Respect backpressure
for (const chunk of chunks) {
  const canContinue = raw.write(chunk);
  if (!canContinue) {
    await new Promise<void>((resolve) => raw.once("drain", resolve));
  }
}
```

### ❌ Don't send empty Suspense fallbacks

```tsx
{/* BAD — No visual feedback, looks broken */}
<Resource value={data} onPending={() => <></>} ... />

{/* GOOD — Skeleton matches final layout */}
<Resource
  value={data}
  onPending={() => (
    <div class="animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700 h-48 w-full" />
  )}
  ...
/>
```

### ❌ Don't create a new stream per chunk

```typescript
// BAD — Overhead of creating a stream for every piece of content
for (const section of sections) {
  const stream = new ReadableStream({ ... });
  await pipeToResponse(stream, reply);
}

// GOOD — Single stream, multiple chunks
const stream = new ReadableStream({
  async start(controller) {
    for (const section of sections) {
      controller.enqueue(await renderSection(section));
    }
    controller.close();
  },
});
```

## Reference Links

- [Qwik Streaming](https://qwik.dev/docs/guides/ssr/#streaming)
- [Qwik Resumability](https://qwik.dev/docs/concepts/resumable/)
- [Piscina Worker Pool](https://github.com/piscinajs/piscina)
- [Fastify Reply Streams](https://fastify.dev/docs/latest/Reference/Reply/#streams)
- [Node.js Web Streams API](https://nodejs.org/api/webstreams.html)
- [MDN Transfer-Encoding](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Transfer-Encoding)
- [web.dev Streaming SSR](https://web.dev/articles/streaming-ssr)

## Related Documentation

- [Rendering](./rendering.md) — Worker pool setup, SSR/SSG modes, data flow
- [Worker Communication](./worker-communication.md) — SharedArrayBuffer and
  Redis patterns for passing data to workers
- [Data Loading](./data-loading.md) — `defer()` and streaming data with loaders
- [Error Handling](./error-handling.md) — Error handling during streaming
- [Architecture](./architecture.md) — Where streaming fits in the system
