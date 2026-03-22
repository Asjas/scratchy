---
name: worker-threads-piscina
description:
  "Guides development of Worker Thread patterns using Piscina within the
  Scratchy framework for SSR, SSG, and heavy computation. Use when setting up
  the worker pool, creating worker entry points, communicating between main
  thread and workers, implementing SharedArrayBuffer, or configuring
  fastify-piscina. Trigger terms: Worker Threads, Piscina, worker pool,
  SharedArrayBuffer, Atomics, SSR worker, SSG worker, fastify-piscina,
  off-main-thread."
metadata:
  tags: worker-threads, piscina, concurrency, ssr, ssg, performance
applyTo: "**/worker*.ts,**/pool.ts,**/renderer/**/*.ts"
---

# Worker Threads in Scratchy

## When to Use

Use Worker Threads when:

- Performing server-side rendering (SSR) of Qwik components
- Generating static HTML pages (SSG)
- Running CPU-intensive computations (image processing, data transformation)
- Avoiding blocking the main event loop with synchronous work
- Any heavy computation that would delay API response times

**Never block the main event loop** — offload heavy work to Worker Threads.

## Architecture Overview

```
┌─────────────────────────────┐
│       Main Thread           │
│  (Fastify + tRPC + API)     │
│                             │
│  ┌───────────────────────┐  │
│  │  Piscina Worker Pool  │  │
│  │  (fastify-piscina)    │  │
│  └───────┬───────────────┘  │
└──────────┼──────────────────┘
           │
    ┌──────┼──────┐
    │      │      │
    ▼      ▼      ▼
┌──────┐┌──────┐┌──────┐
│Worker││Worker││Worker│   ← SSR/SSG/Heavy computation
│  #1  ││  #2  ││  #3  │
└──────┘└──────┘└──────┘
```

## Setup with fastify-piscina

### Plugin Registration

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
  });

  fastify.log.info(
    {
      minThreads: 2,
      maxThreads: Math.max(4, navigator.hardwareConcurrency || 4),
    },
    "worker pool initialized",
  );
});
```

### TypeScript Augmentation

```typescript
// types/fastify.d.ts
import type Piscina from "piscina";

declare module "fastify" {
  interface FastifyInstance {
    runTask: Piscina["run"];
  }
}
```

### Worker Entry Point

```typescript
// renderer/worker.ts
import { parentPort } from "node:worker_threads";

interface RenderTask {
  type: "ssr" | "ssg";
  route: string;
  props?: Record<string, unknown>;
}

interface RenderResult {
  html: string;
  head: string;
  statusCode: number;
}

export default async function handler(task: RenderTask): Promise<RenderResult> {
  switch (task.type) {
    case "ssr":
      return renderSSR(task.route, task.props);
    case "ssg":
      return renderSSG(task.route, task.props);
    default:
      throw new Error(`Unknown task type: ${task.type}`);
  }
}

async function renderSSR(
  route: string,
  props?: Record<string, unknown>,
): Promise<RenderResult> {
  // Qwik SSR rendering logic here
  const html = `<!DOCTYPE html><html><body>SSR: ${route}</body></html>`;
  return { html, head: "", statusCode: 200 };
}

async function renderSSG(
  route: string,
  props?: Record<string, unknown>,
): Promise<RenderResult> {
  // Qwik SSG rendering logic here
  const html = `<!DOCTYPE html><html><body>SSG: ${route}</body></html>`;
  return { html, head: "", statusCode: 200 };
}
```

### Using the Worker Pool in Routes

```typescript
// routes/pages/index.ts
import type { FastifyPluginAsync } from "fastify";

const routes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/*", async (request, reply) => {
    const result = await fastify.runTask({
      type: "ssr",
      route: request.url,
      props: {
        user: request.user,
      },
    });

    reply
      .status(result.statusCode)
      .header("content-type", "text/html; charset=utf-8")
      .send(result.html);
  });
};

export default routes;
```

## Communication Patterns

### Pattern 1: SharedArrayBuffer + Atomics

Use for **zero-copy data sharing** between the main thread and workers. Best for
large data that would be expensive to serialize.

```typescript
// Shared data structure for rendering context
const HEADER_SIZE = 4; // 4 bytes for status flags
const DATA_SIZE = 1024 * 64; // 64KB for shared data

function createSharedBuffer() {
  const sharedBuffer = new SharedArrayBuffer(HEADER_SIZE + DATA_SIZE);
  const statusArray = new Int32Array(sharedBuffer, 0, 1);
  const dataArray = new Uint8Array(sharedBuffer, HEADER_SIZE, DATA_SIZE);
  return { sharedBuffer, statusArray, dataArray };
}
```

#### Main Thread (Producer)

```typescript
const { sharedBuffer, statusArray, dataArray } = createSharedBuffer();

// Write data to shared buffer
const encoder = new TextEncoder();
const data = encoder.encode(
  JSON.stringify({ route: "/about", user: { id: "123" } }),
);
dataArray.set(data);

// Signal the worker that data is ready
Atomics.store(statusArray, 0, 1); // 1 = data ready
Atomics.notify(statusArray, 0);

// Send the shared buffer to the worker
const result = await fastify.runTask({
  sharedBuffer,
  dataLength: data.byteLength,
});
```

#### Worker Thread (Consumer)

```typescript
export default async function handler(task: {
  sharedBuffer: SharedArrayBuffer;
  dataLength: number;
}) {
  const statusArray = new Int32Array(task.sharedBuffer, 0, 1);
  const dataArray = new Uint8Array(task.sharedBuffer, 4, task.dataLength);

  // Wait for data to be ready (with timeout)
  const result = Atomics.wait(statusArray, 0, 0, 5000); // 5s timeout
  if (result === "timed-out") {
    throw new Error("Timed out waiting for shared data");
  }

  // Read the data
  const decoder = new TextDecoder();
  const data = JSON.parse(decoder.decode(dataArray));

  // Process and return result
  const html = await renderPage(data.route, data.user);

  // Signal completion
  Atomics.store(statusArray, 0, 2); // 2 = processing complete
  Atomics.notify(statusArray, 0);

  return { html, statusCode: 200 };
}
```

### Pattern 2: Redis (DragonflyDB) Communication

Use for **distributed scenarios** where workers need to access shared state
across multiple server instances.

```typescript
// lib/worker-redis.ts
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

// Main thread: Store render context in Redis
export async function storeRenderContext(requestId: string, context: object) {
  await redis.set(
    `render:${requestId}`,
    JSON.stringify(context),
    "EX",
    60, // 60 second TTL
  );
}

// Worker: Retrieve render context from Redis
export async function getRenderContext(requestId: string) {
  const data = await redis.get(`render:${requestId}`);
  if (!data) throw new Error(`No render context for ${requestId}`);
  return JSON.parse(data);
}

// Worker: Store rendered result in Redis
export async function storeRenderResult(requestId: string, html: string) {
  await redis.set(
    `result:${requestId}`,
    html,
    "EX",
    300, // 5 minute cache
  );
}
```

#### Worker with Redis

```typescript
// renderer/worker.ts
import { getRenderContext, storeRenderResult } from "~/lib/worker-redis.js";

export default async function handler(task: { requestId: string }) {
  // Get context from Redis
  const context = await getRenderContext(task.requestId);

  // Render the page
  const html = await renderPage(context.route, context.props);

  // Optionally cache the result in Redis
  await storeRenderResult(task.requestId, html);

  return { html, statusCode: 200 };
}
```

### Choosing a Communication Pattern

| Factor       | SharedArrayBuffer + Atomics | Redis (DragonflyDB)        |
| ------------ | --------------------------- | -------------------------- |
| Latency      | Lowest (zero-copy)          | Higher (network roundtrip) |
| Data size    | Limited by buffer size      | Virtually unlimited        |
| Multi-server | Single process only         | Works across instances     |
| Complexity   | Higher (manual memory mgmt) | Lower (key-value API)      |
| Best for     | Large payloads, same server | Distributed, cached data   |

## Piscina Configuration Options

```typescript
{
  // Worker file path
  worker: "./renderer/worker.ts",

  // Thread pool sizing
  minThreads: 2,                    // Minimum workers alive
  maxThreads: 8,                    // Maximum workers
  concurrentTasksPerWorker: 1,      // Tasks per worker (usually 1 for CPU-bound)

  // Timeouts
  idleTimeout: 60_000,              // Kill idle workers after 60s
  taskTimeout: 30_000,              // Kill task after 30s (prevent hangs)

  // Memory limits
  resourceLimits: {
    maxOldGenerationSizeMb: 512,    // V8 heap limit per worker
    maxYoungGenerationSizeMb: 64,
  },

  // Environment
  env: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
  },
}
```

## Best Practices

1. **Size the pool correctly** — Use `navigator.hardwareConcurrency` as a
   baseline, but leave headroom for the main thread and OS.
2. **Set task timeouts** — Prevent runaway workers from consuming resources.
3. **Monitor pool health** — Track queue depth, active workers, and task
   completion times.
4. **Graceful shutdown** — Drain the pool before closing the server:
   ```typescript
   fastify.addHook("onClose", async () => {
     await fastify.piscina.destroy();
   });
   ```
5. **Avoid transferring large objects** — Use SharedArrayBuffer for large data,
   or Redis for distributed access.
6. **Keep workers stateless** — Workers should receive all needed data via the
   task payload or shared memory.

## Anti-Patterns

### ❌ Don't perform SSR on the main thread

```typescript
// BAD — Blocks the event loop
fastify.get("/*", async (request, reply) => {
  const html = renderToString(<App />); // Synchronous, blocks!
  return reply.send(html);
});

// GOOD — Offload to worker pool
fastify.get("/*", async (request, reply) => {
  const result = await fastify.runTask({ type: "ssr", route: request.url });
  return reply.send(result.html);
});
```

### ❌ Don't create workers on every request

```typescript
// BAD — Creates a new worker per request
fastify.get("/*", async (request, reply) => {
  const worker = new Worker("./renderer/worker.ts");
  // ...
});

// GOOD — Use the persistent Piscina pool
fastify.get("/*", async (request, reply) => {
  const result = await fastify.runTask({ type: "ssr", route: request.url });
  return reply.send(result.html);
});
```

## Reference Links

- [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html)
- [Piscina — Worker Thread Pool](https://github.com/piscinajs/piscina)
- [fastify-piscina Plugin](https://github.com/piscinajs/fastify-piscina)
- [SharedArrayBuffer MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [Atomics MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics)
- [DragonflyDB](https://www.dragonflydb.io/)
