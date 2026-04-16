# Worker Communication

> **Diátaxis type: [How-to Guide](https://diataxis.fr/how-to-guides/) +
> [Explanation](https://diataxis.fr/explanation/)** — shows how to pass data
> between the main thread and Worker Threads using SharedArrayBuffer and Redis,
> and explains when to use each approach.

## Table of Contents

- [Overview](#overview)
- [Choosing a Pattern](#choosing-a-pattern)
- [Pattern 1: SharedArrayBuffer + Atomics](#pattern-1-sharedarraybuffer--atomics)
- [Pattern 2: Redis (DragonflyDB)](#pattern-2-redis-dragonflydb)
  - [Redis Pub/Sub for Cache Invalidation](#redis-pubsub-for-cache-invalidation)
- [DragonflyDB](#dragonflydb)
- [Performance Comparison](#performance-comparison)
- [Best Practices](#best-practices)
- [Related Documentation](#related-documentation)

---

## Overview

Scratchy supports two communication patterns between the main Node.js thread and
Worker Threads:

1. **SharedArrayBuffer + Atomics** — for zero-copy, low-latency data sharing
   within a single server process
2. **Redis (DragonflyDB)** — for distributed state sharing across multiple
   server instances

## Choosing a Pattern

| Criteria                 | SharedArrayBuffer  | Redis               |
| ------------------------ | ------------------ | ------------------- |
| **Latency**              | ~0 (shared memory) | ~1ms (network)      |
| **Serialization**        | Manual (binary)    | JSON (automatic)    |
| **Multi-server support** | ❌ Single process  | ✅ Any topology     |
| **Data size limit**      | Pre-allocated      | Virtually unlimited |
| **Complexity**           | Higher             | Lower               |
| **Debugging**            | Harder             | Easier (inspect)    |
| **Best for**             | Large payloads     | Cached/shared data  |

**Recommendation:**

- Start with **Redis** for simplicity — most rendering tasks work well with it
- Use **SharedArrayBuffer** when profiling shows serialization is a bottleneck
- Use **both** in production — Redis for cached data, SharedArrayBuffer for
  large per-request payloads

## Pattern 1: SharedArrayBuffer + Atomics

### Concept

SharedArrayBuffer creates a region of memory that is shared between the main
thread and worker threads. Changes made by one thread are immediately visible to
others. Atomics provide synchronization primitives (wait, notify, locks) to
coordinate access.

### Buffer Layout Design

```
┌──────────────────────────────────────────────┐
│ SharedArrayBuffer (Header + Data)             │
├──────────┬───────────┬───────────────────────┤
│ Status   │ Data Len  │ Data Payload           │
│ (4 bytes)│ (4 bytes) │ (N bytes)              │
│ Int32[0] │ Int32[1]  │ Uint8Array             │
├──────────┴───────────┴───────────────────────┤
│ Status values:                                │
│   0 = idle/empty                              │
│   1 = data written by producer                │
│   2 = data consumed by consumer               │
│   3 = error                                   │
└──────────────────────────────────────────────┘
```

### Implementation

#### Shared Utilities

```typescript
// lib/shared-buffer.ts
const HEADER_SIZE = 8; // 4 bytes status + 4 bytes data length

export const BufferStatus = {
  IDLE: 0,
  DATA_READY: 1,
  CONSUMED: 2,
  ERROR: 3,
} as const;

export function createSharedBuffer(dataSize: number) {
  const buffer = new SharedArrayBuffer(HEADER_SIZE + dataSize);
  return {
    buffer,
    status: new Int32Array(buffer, 0, 1),
    dataLength: new Int32Array(buffer, 4, 1),
    data: new Uint8Array(buffer, HEADER_SIZE, dataSize),
  };
}

export function writeToBuffer(
  shared: ReturnType<typeof createSharedBuffer>,
  payload: object,
): void {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(JSON.stringify(payload));

  if (encoded.byteLength > shared.data.byteLength) {
    throw new Error(
      `Payload too large: ${encoded.byteLength} > ${shared.data.byteLength}`,
    );
  }

  // Write data
  shared.data.set(encoded);
  Atomics.store(shared.dataLength, 0, encoded.byteLength);

  // Signal data is ready
  Atomics.store(shared.status, 0, BufferStatus.DATA_READY);
  Atomics.notify(shared.status, 0);
}

export function readFromBuffer(
  shared: ReturnType<typeof createSharedBuffer>,
  timeoutMs: number = 5000,
): object {
  // Wait for data
  const result = Atomics.wait(shared.status, 0, BufferStatus.IDLE, timeoutMs);
  if (result === "timed-out") {
    throw new Error("Timed out waiting for data in shared buffer");
  }

  const length = Atomics.load(shared.dataLength, 0);
  const decoder = new TextDecoder();
  const data = JSON.parse(decoder.decode(shared.data.slice(0, length)));

  // Signal consumed and reset to IDLE for next cycle
  Atomics.store(shared.status, 0, BufferStatus.IDLE);
  Atomics.notify(shared.status, 0);

  return data;
}
```

#### Main Thread (Producer)

```typescript
// In a Fastify route handler
import { createSharedBuffer, writeToBuffer } from "~/lib/shared-buffer.js";

fastify.get("/page/:route", async (request, reply) => {
  const shared = createSharedBuffer(64 * 1024); // 64KB buffer

  // Write render context to shared buffer
  writeToBuffer(shared, {
    route: request.params.route,
    user: request.user,
    headers: request.headers,
  });

  // Send buffer reference to worker
  const result = await fastify.runTask({
    sharedBuffer: shared.buffer,
  });

  return reply
    .header("content-type", "text/html; charset=utf-8")
    .send(result.html);
});
```

#### Worker Thread (Consumer)

```typescript
// renderer/worker.ts
import { createSharedBuffer, readFromBuffer } from "~/lib/shared-buffer.js";

export default async function handler(task: {
  sharedBuffer: SharedArrayBuffer;
}) {
  const HEADER_SIZE = 8;
  const shared = {
    buffer: task.sharedBuffer,
    status: new Int32Array(task.sharedBuffer, 0, 1),
    dataLength: new Int32Array(task.sharedBuffer, 4, 1),
    data: new Uint8Array(task.sharedBuffer, HEADER_SIZE),
  };

  // Read context from shared buffer
  const context = readFromBuffer(shared);

  // Render the page
  const html = await renderPage(context);

  return { html, statusCode: 200 };
}
```

### Advanced: Lock-Free Ring Buffer

For high-throughput scenarios (e.g., streaming rendered chunks), use
`SharedRingBuffer` from `@scratchyjs/renderer`. It implements a Single-Producer
/ Single-Consumer (SPSC) lock-free ring buffer backed by a `SharedArrayBuffer`.

```typescript
import { SharedRingBuffer } from "@scratchyjs/renderer";

// Producer (main thread) — create the ring buffer and pass it to the worker
const ring = new SharedRingBuffer(64 * 1024); // 64 KB ring

ring.write(encoder.encode("<html>...first chunk...</html>"));

const result = await fastify.runTask({
  type: "streaming-ssr",
  sharedBuffer: ring.getSharedBuffer(), // transfer to worker
});
```

```typescript
import { SharedRingBuffer } from "@scratchyjs/renderer";

// Consumer (worker thread) — reconstruct from the transferred SharedArrayBuffer
export default async function handler(task: {
  sharedBuffer: SharedArrayBuffer;
}) {
  const ring = SharedRingBuffer.fromSharedBuffer(task.sharedBuffer);

  const chunk = ring.read(4096); // returns Uint8Array | null
  if (chunk) {
    const html = new TextDecoder().decode(chunk);
    // … process chunk
  }
}
```

#### API

| Member                                       | Description                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| `new SharedRingBuffer(capacity)`             | Allocates a new ring backed by a `SharedArrayBuffer` of `8 + capacity` bytes. |
| `SharedRingBuffer.fromSharedBuffer(sab)`     | Reconstructs a ring from an existing `SharedArrayBuffer` (worker side).       |
| `write(chunk: Uint8Array): boolean`          | Writes `chunk` atomically. Returns `false` if the ring is full.               |
| `read(maxBytes: number): Uint8Array \| null` | Reads up to `maxBytes` bytes. Returns `null` if the ring is empty.            |
| `availableToRead`                            | Bytes currently ready to read (snapshot).                                     |
| `availableToWrite`                           | Bytes available for writing (snapshot).                                       |
| `isEmpty`                                    | `true` when there is no data to read.                                         |
| `isFull`                                     | `true` when there is no space to write.                                       |
| `capacity`                                   | Data region size in bytes.                                                    |
| `byteLength`                                 | Total `SharedArrayBuffer` size (`8 + capacity`).                              |
| `getSharedBuffer()`                          | Returns the underlying `SharedArrayBuffer` for transfer to a worker.          |

#### Design notes

- **SPSC lock-free** — `writePos` is advanced only by the producer and `readPos`
  only by the consumer, making concurrent access safe without locks.
- **Monotonic pointers** — both pointers grow indefinitely; the actual buffer
  position is `pointer % capacity`, which keeps arithmetic race-free.
- **Ring wrapping** — writes and reads that span the end of the buffer are split
  automatically and reassembled transparently.
- **Notifications** — `write()` calls `Atomics.notify(writePos, 0)` after each
  successful write; `read()` calls `Atomics.notify(readPos, 0)` after each read.
  These wake any agent that is blocking via `Atomics.wait`, enabling future
  blocking-consumer or blocking-producer extensions without API changes.

## Pattern 2: Redis (DragonflyDB)

### Concept

Use Redis as a shared key-value store that both the main thread and workers can
read from and write to. This works across multiple server instances.

### Implementation

#### Redis Client Setup

```typescript
// lib/redis.ts
import { Redis } from "ioredis";

export const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableReadyCheck: true,
});

redis.on("error", (err) => {
  console.error("Redis connection error:", err);
});

redis.on("connect", () => {
  console.log("Connected to Redis");
});
```

#### Main Thread: Store Render Context

```typescript
// In a Fastify route handler
import { ulid } from "ulid";
import { redis } from "~/lib/redis.js";

fastify.get("/page/:route", async (request, reply) => {
  const requestId = ulid();

  // Store context in Redis
  await redis.set(
    `render:${requestId}`,
    JSON.stringify({
      route: request.params.route,
      user: request.user,
      headers: Object.fromEntries(
        Object.entries(request.headers).filter(([k]) =>
          ["accept-language", "user-agent"].includes(k),
        ),
      ),
    }),
    "EX",
    60, // 60-second TTL
  );

  // Send request ID to worker
  const result = await fastify.runTask({ requestId });

  return reply
    .header("content-type", "text/html; charset=utf-8")
    .send(result.html);
});
```

#### Worker: Read Context and Cache Result

```typescript
// renderer/worker.ts
import { Redis } from "ioredis";

// Each worker has its own Redis connection
const redis = new Redis(process.env.REDIS_URL);

export default async function handler(task: { requestId: string }) {
  // Read context from Redis
  const raw = await redis.get(`render:${task.requestId}`);
  if (!raw) throw new Error(`No render context for ${task.requestId}`);

  const context = JSON.parse(raw);

  // Check for cached result
  const cacheKey = `html:${context.route}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return { html: cached, statusCode: 200, cached: true };
  }

  // Render the page
  const html = await renderPage(context);

  // Cache the result (5-minute TTL)
  await redis.set(cacheKey, html, "EX", 300);

  // Clean up context
  await redis.del(`render:${task.requestId}`);

  return { html, statusCode: 200, cached: false };
}
```

### Redis Pub/Sub for Cache Invalidation

`@scratchyjs/renderer` ships `createCacheInvalidator` and
`subscribeToCacheInvalidation` for multi-server cache invalidation over Redis
Pub/Sub. When any server mutates data it broadcasts the stale key names to all
other nodes; each node then evicts those entries from its local in-memory cache.

#### Publisher (one per mutation path)

Create a **single** `Redis` client for publishing and reuse it for the lifetime
of the process:

```typescript
// src/plugins/app/cache-invalidator.ts
import { createCacheInvalidator } from "@scratchyjs/renderer";
import fp from "fastify-plugin";
import Redis from "ioredis";

export default fp(async function cacheInvalidatorPlugin(fastify) {
  const publisher = new Redis(fastify.config.REDIS_URL);
  const invalidator = createCacheInvalidator({ publisher });

  fastify.decorate("invalidateCache", invalidator.publish.bind(invalidator));

  fastify.addHook("onClose", async () => {
    await publisher.quit();
  });
});

declare module "fastify" {
  interface FastifyInstance {
    invalidateCache: (keys: string[]) => Promise<void>;
  }
}
```

Then call it from any mutation handler:

```typescript
// After updating a blog post:
await fastify.invalidateCache([`page:/blog/${slug}`, "page:/blog"]);
```

#### Subscriber (every server instance)

Create a **dedicated** `Redis` client for subscribing — ioredis clients enter
subscriber mode after calling `subscribe()` and can no longer issue regular
commands:

```typescript
// src/plugins/app/cache-subscriber.ts
import { subscribeToCacheInvalidation } from "@scratchyjs/renderer";
import fp from "fastify-plugin";
import Redis from "ioredis";

export default fp(async function cacheSubscriberPlugin(fastify) {
  const subscriber = new Redis(fastify.config.REDIS_URL);

  const handle = await subscribeToCacheInvalidation({
    subscriber,
    onInvalidate: (keys) => {
      for (const key of keys) {
        fastify.cache.delete(key); // evict from your local LRU cache
      }
    },
    onError: (err) => {
      fastify.log.warn({ err }, "cache invalidation error");
    },
  });

  fastify.addHook("onClose", async () => {
    await handle.unsubscribe();
    await subscriber.quit();
  });
});
```

#### API reference

| Export                               | Description                                                  |
| ------------------------------------ | ------------------------------------------------------------ |
| `createCacheInvalidator(opts)`       | Returns a `CacheInvalidator` for publishing events.          |
| `subscribeToCacheInvalidation(opts)` | Subscribes to events; returns a handle with `unsubscribe()`. |
| `DEFAULT_CACHE_INVALIDATION_CHANNEL` | Default channel name: `"scratchy:cache:invalidate"`.         |

**`CacheInvalidatorOptions`**

| Option      | Type     | Default                       | Description                    |
| ----------- | -------- | ----------------------------- | ------------------------------ |
| `publisher` | `Redis`  | required                      | ioredis client for publishing. |
| `channel`   | `string` | `"scratchy:cache:invalidate"` | Pub/Sub channel name.          |

**`CacheInvalidationSubscriberOptions`**

| Option         | Type                                        | Default                       | Description                                          |
| -------------- | ------------------------------------------- | ----------------------------- | ---------------------------------------------------- |
| `subscriber`   | `Redis`                                     | required                      | Dedicated ioredis client (enters subscriber mode).   |
| `onInvalidate` | `(keys: string[]) => void \| Promise<void>` | required                      | Called with the keys to evict on each event.         |
| `channel`      | `string`                                    | `"scratchy:cache:invalidate"` | Pub/Sub channel name.                                |
| `onError`      | `(err: Error) => void`                      | `undefined`                   | Called on parse errors or `onInvalidate` rejections. |

## DragonflyDB

[DragonflyDB](https://www.dragonflydb.io/) is a Redis-compatible in-memory
datastore that is significantly faster for multi-threaded workloads. It is a
drop-in replacement for Redis:

```bash
# Docker Compose
services:
  dragonfly:
    image: docker.dragonflydb.io/dragonflydb/dragonfly
    ports:
      - "6379:6379"
    volumes:
      - dragonfly_data:/data
```

No code changes are needed — DragonflyDB uses the same protocol as Redis.

### Why DragonflyDB?

| Feature           | Redis            | DragonflyDB          |
| ----------------- | ---------------- | -------------------- |
| Threading model   | Single-threaded  | Multi-threaded       |
| Memory efficiency | Good             | Better (no jemalloc) |
| Max throughput    | ~1M ops/sec      | ~25M ops/sec         |
| Snapshotting      | Fork-based (COW) | Non-blocking         |
| Compatibility     | —                | Redis API compatible |

## Performance Comparison

Benchmarks for different communication patterns (rendering a medium-complexity
page):

| Method                     | Latency (p50) | Latency (p99) | Throughput  |
| -------------------------- | ------------- | ------------- | ----------- |
| SharedArrayBuffer (64KB)   | 0.5ms         | 2ms           | Highest     |
| Redis (local, DragonflyDB) | 1.5ms         | 5ms           | High        |
| Redis (remote)             | 3ms           | 15ms          | Medium      |
| JSON serialization (task)  | 2ms           | 8ms           | Medium-High |

_Note: These are approximate values. Actual performance depends on hardware,
payload size, and network topology._

## Best Practices

1. **Start with Redis** — simpler to implement and debug
2. **Profile before optimizing** — only move to SharedArrayBuffer if
   serialization is a measured bottleneck
3. **Set TTLs on all Redis keys** — prevent memory leaks from orphaned data
4. **Use connection pooling** in workers — don't create new Redis connections
   per task
5. **Monitor memory usage** — SharedArrayBuffer pre-allocates memory;
   over-provisioning wastes RAM
6. **Clean up after yourself** — delete render context from Redis after the
   worker is done
7. **Handle failures gracefully** — if Redis is down, fall back to passing data
   through the Piscina task payload

## Related Documentation

- [Rendering](./rendering.md) — Worker pool setup, SSR/SSG data flow
- [Streaming](./streaming.md) — Streaming HTML chunks from workers
- [Architecture](./architecture.md) — Why Worker Threads for rendering
- [Nitro Inspiration](./nitro-inspiration.md) — Comparison with Nitro's
  same-thread rendering
- [Data Layer](./data-layer.md) — Caching with async-cache-dedupe and Redis
