# Rendering Pipeline

## Overview

Scratchy uses a **Worker Thread-based rendering pipeline** for both Server-Side
Rendering (SSR) and Static Site Generation (SSG). The main Fastify thread never
performs rendering work — all HTML generation is offloaded to Piscina worker
threads.

## Rendering Modes

### Server-Side Rendering (SSR)

HTML is generated on every request in a Worker Thread:

```
Browser Request → Fastify → Worker Pool → Qwik SSR → HTML Response
```

**When to use SSR:**

- Pages with user-specific content (dashboards, profiles)
- Pages requiring real-time data
- Pages with authentication-gated content
- SEO-important pages with dynamic content

### Static Site Generation (SSG)

HTML is pre-generated at build time or on first request:

```
Build/First Request → Worker Pool → Qwik SSG → HTML Cache → Serve from Cache
```

**When to use SSG:**

- Marketing pages
- Blog posts and documentation
- Product listings that change infrequently
- Any page where content is the same for all users

### Client-Side Rendering (CSR)

Qwik handles client-side interactions via **resumability**:

```
HTML (SSR/SSG) → Browser → Qwik Resumes on Interaction → Lazy-load Handlers
```

No JavaScript is downloaded until the user interacts with the page. Event
handlers are lazy-loaded on demand.

## Architecture

### Worker Pool Setup

```typescript
// plugins/app/worker-pool.ts
import fp from "fastify-plugin";
import { resolve } from "node:path";

export default fp(async function workerPool(fastify) {
  await fastify.register(import("fastify-piscina"), {
    worker: resolve(import.meta.dirname, "..", "..", "renderer", "worker.ts"),
    minThreads: 2,
    maxThreads: Math.max(4, navigator.hardwareConcurrency || 4),
    idleTimeout: 60_000,
    taskTimeout: 30_000,
    resourceLimits: {
      maxOldGenerationSizeMb: 512,
    },
  });
});
```

### SSR Request Flow

```
1. Browser sends GET /about
2. Fastify receives request
3. Route handler calls fastify.runTask({ type: "ssr", route: "/about", ... })
4. Piscina queues the task to an available worker
5. Worker imports Qwik's SSR function
6. Worker renders the component tree to HTML
7. Worker returns { html, head, statusCode }
8. Fastify sends the HTML response
9. Browser renders HTML immediately (no JS needed)
10. On user interaction, Qwik lazy-loads the needed JS
```

### Worker Entry Point

```typescript
// renderer/worker.ts

interface RenderTask {
  type: "ssr" | "ssg";
  route: string;
  props?: Record<string, unknown>;
  headers?: Record<string, string>;
}

interface RenderResult {
  html: string;
  head: string;
  statusCode: number;
  headers?: Record<string, string>;
}

export default async function handler(task: RenderTask): Promise<RenderResult> {
  switch (task.type) {
    case "ssr":
      return renderSSR(task);
    case "ssg":
      return renderSSG(task);
    default:
      throw new Error(`Unknown render type: ${task.type}`);
  }
}

async function renderSSR(task: RenderTask): Promise<RenderResult> {
  // 1. Resolve the route to a Qwik component
  // 2. Gather data (via tRPC or direct DB queries)
  // 3. Render with Qwik's SSR API
  // 4. Return HTML with proper head tags

  const { renderToString } = await import("@builder.io/qwik/server");

  const result = await renderToString(
    // Qwik rendering configuration
    {
      url: task.route,
      containerTagName: "div",
      qwikLoader: { include: "auto" },
    },
  );

  return {
    html: wrapInShell(result.html, result.head),
    head: result.head,
    statusCode: 200,
  };
}

async function renderSSG(task: RenderTask): Promise<RenderResult> {
  // Similar to SSR but results are cached
  const result = await renderSSR(task);
  return result;
}

function wrapInShell(body: string, head: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${head}
</head>
<body>
  ${body}
</body>
</html>`;
}
```

### SSG with Caching

```typescript
// Route handler for SSG pages
import type { FastifyPluginAsync } from "fastify";

const routes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/blog/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };

    // Check cache first
    const cached = await fastify.cache.get(`ssg:blog:${slug}`);
    if (cached) {
      return reply
        .header("content-type", "text/html; charset=utf-8")
        .header("x-cache", "HIT")
        .send(cached);
    }

    // Render in worker
    const result = await fastify.runTask({
      type: "ssg",
      route: `/blog/${slug}`,
    });

    // Cache the result
    await fastify.cache.set(`ssg:blog:${slug}`, result.html, 3600); // 1 hour

    return reply
      .status(result.statusCode)
      .header("content-type", "text/html; charset=utf-8")
      .header("x-cache", "MISS")
      .send(result.html);
  });
};

export default routes;
```

## Data Flow for SSR

### Option 1: Pass Data via Task Payload

The main thread fetches data and passes it to the worker:

```typescript
fastify.get("/dashboard", async (request, reply) => {
  // Fetch data on the main thread
  const user = await findUserById.execute({ id: request.user.id });
  const courses = await findUserCourses.execute({ userId: request.user.id });

  // Pass data to worker for rendering
  const result = await fastify.runTask({
    type: "ssr",
    route: "/dashboard",
    props: {
      user,
      courses,
    },
  });

  return reply
    .header("content-type", "text/html; charset=utf-8")
    .send(result.html);
});
```

### Option 2: Worker Fetches Data via SharedArrayBuffer

For large payloads, use SharedArrayBuffer to avoid serialization overhead:

```typescript
// See worker-communication.md for detailed patterns
```

### Option 3: Worker Fetches Data via Redis

For cached or distributed data:

```typescript
// Worker reads from Redis cache
const userData = await redis.get(`user:${userId}`);
```

## Qwik Resumability

### How It Works

1. **Server renders HTML** with serialized state (Qwik's "pause" state)
2. **Browser displays HTML** immediately — fully interactive-looking
3. **No JavaScript downloaded** until user interaction
4. **On interaction** (click, hover, etc.), Qwik's tiny loader:
   - Downloads only the handler for that specific interaction
   - Resumes the component state from serialized HTML
   - Executes the handler
5. **Subsequent interactions** may load additional code chunks

### Benefits for Scratchy

- **Instant page loads**: Full HTML rendered by workers, displayed immediately
- **Minimal JavaScript**: Only ~1KB loader until interaction
- **Progressive enhancement**: Page works without JS for content viewing
- **Worker offloading**: Main thread stays free for API requests

## Performance Considerations

### Streaming SSR

Scratchy supports streaming HTML responses for faster Time to First Byte (TTFB).
Instead of waiting for the entire page to render, the server sends HTML chunks
as they become available. See [streaming.md](streaming.md) for detailed
patterns.

Key streaming features:

- **Progressive rendering**: Shell → content → interactive (defer + Await)
- **loading.tsx**: Route-level loading skeletons shown while data loads
- **Out-of-order streaming**: Placeholder slots filled as data resolves
- **Early flush**: Send `<head>` and shell immediately

```typescript
// Route handler with streaming
fastify.get("/dashboard", async (request, reply) => {
  const result = await fastify.runTask({
    type: "stream-ssr",
    route: "/dashboard",
    props: { userId: request.user.id },
  });

  reply
    .header("content-type", "text/html; charset=utf-8")
    .header("transfer-encoding", "chunked");

  for await (const chunk of result.stream) {
    reply.raw.write(chunk);
  }
  reply.raw.end();
});
```

### Worker Pool Sizing

```
CPU cores:     8
Main thread:   1 (Fastify + API)
OS overhead:   1
Worker pool:   6 (max)
```

Rule of thumb: `maxThreads = CPU cores - 2`

### Monitoring

Track these metrics for the rendering pipeline:

| Metric                | Description                           | Alert Threshold |
| --------------------- | ------------------------------------- | --------------- |
| `render_duration_ms`  | Time to render a page in a worker     | > 500ms         |
| `worker_queue_depth`  | Number of tasks waiting for a worker  | > 10            |
| `worker_active_count` | Number of workers currently rendering | = maxThreads    |
| `cache_hit_rate`      | SSG cache hit percentage              | < 80%           |
| `worker_error_count`  | Number of render failures             | > 0             |

### Optimization Tips

1. **Pre-render critical routes** at startup for instant first responses
2. **Cache aggressively** — SSG pages should be cached in Redis
3. **Stream HTML** when possible to start sending bytes while still rendering
4. **Keep worker payloads small** — pass IDs, not full objects, when workers can
   fetch from cache
5. **Set task timeouts** — kill workers that take too long (prevent memory
   leaks)
6. **Monitor heap usage** — use `resourceLimits.maxOldGenerationSizeMb` to
   constrain worker memory

## Related Documentation

- [streaming.md](streaming.md) — Streaming SSR, progressive rendering,
  defer/Await
- [data-loading.md](data-loading.md) — routeLoader$, caching, revalidation
- [error-handling.md](error-handling.md) — Error handling in workers and
  rendering
- [worker-communication.md](worker-communication.md) — SharedArrayBuffer and
  Redis patterns
