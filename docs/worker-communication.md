# Worker Communication

## Overview

Scratchy supports two communication patterns between the main Node.js thread
and Worker Threads:

1. **SharedArrayBuffer + Atomics** — for zero-copy, low-latency data sharing
   within a single server process
2. **Redis (DragonflyDB)** — for distributed state sharing across multiple
   server instances

## Choosing a Pattern

| Criteria                   | SharedArrayBuffer | Redis             |
| -------------------------- | ----------------- | ----------------- |
| **Latency**                | ~0 (shared memory)| ~1ms (network)    |
| **Serialization**          | Manual (binary)   | JSON (automatic)  |
| **Multi-server support**   | ❌ Single process  | ✅ Any topology   |
| **Data size limit**        | Pre-allocated     | Virtually unlimited|
| **Complexity**             | Higher            | Lower             |
| **Debugging**              | Harder            | Easier (inspect)  |
| **Best for**               | Large payloads    | Cached/shared data|

**Recommendation:**

- Start with **Redis** for simplicity — most rendering tasks work well with it
- Use **SharedArrayBuffer** when profiling shows serialization is a bottleneck
- Use **both** in production — Redis for cached data, SharedArrayBuffer for
  large per-request payloads

## Pattern 1: SharedArrayBuffer + Atomics

### Concept

SharedArrayBuffer creates a region of memory that is shared between the main
thread and worker threads. Changes made by one thread are immediately visible
to others. Atomics provide synchronization primitives (wait, notify, locks) to
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
import { readFromBuffer, createSharedBuffer } from "~/lib/shared-buffer.js";

export default async function handler(task: { sharedBuffer: SharedArrayBuffer }) {
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

For high-throughput scenarios (e.g., streaming rendered chunks), use a ring
buffer with atomic read/write pointers:

```typescript
// lib/ring-buffer.ts
export class SharedRingBuffer {
  private buffer: SharedArrayBuffer;
  private writePos: Int32Array;  // Atomic write pointer
  private readPos: Int32Array;   // Atomic read pointer
  private data: Uint8Array;
  private capacity: number;

  constructor(capacity: number) {
    // 8 bytes for pointers + capacity for data
    this.capacity = capacity;
    this.buffer = new SharedArrayBuffer(8 + capacity);
    this.writePos = new Int32Array(this.buffer, 0, 1);
    this.readPos = new Int32Array(this.buffer, 4, 1);
    this.data = new Uint8Array(this.buffer, 8, capacity);
  }

  write(chunk: Uint8Array): boolean {
    const wp = Atomics.load(this.writePos, 0);
    const rp = Atomics.load(this.readPos, 0);
    const available = this.capacity - (wp - rp);

    if (chunk.byteLength > available) return false; // Buffer full

    const offset = wp % this.capacity;
    this.data.set(chunk, offset);
    Atomics.store(this.writePos, 0, wp + chunk.byteLength);
    Atomics.notify(this.readPos, 0); // Wake reader
    return true;
  }

  read(maxBytes: number): Uint8Array | null {
    const wp = Atomics.load(this.writePos, 0);
    const rp = Atomics.load(this.readPos, 0);

    if (wp === rp) return null; // Buffer empty

    const available = wp - rp;
    const readSize = Math.min(maxBytes, available);
    const offset = rp % this.capacity;
    const chunk = this.data.slice(offset, offset + readSize);

    Atomics.store(this.readPos, 0, rp + readSize);
    return chunk;
  }

  getSharedBuffer(): SharedArrayBuffer {
    return this.buffer;
  }
}
```

## Pattern 2: Redis (DragonflyDB)

### Concept

Use Redis as a shared key-value store that both the main thread and workers
can read from and write to. This works across multiple server instances.

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
import { redis } from "~/lib/redis.js";
import { ulid } from "ulid";

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
    "EX", 60, // 60-second TTL
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

```typescript
// lib/cache-invalidation.ts
import { Redis } from "ioredis";

const publisher = new Redis(process.env.REDIS_URL);
const subscriber = new Redis(process.env.REDIS_URL);

async function deleteByPattern(pattern: string): Promise<void> {
  let cursor = "0";

  do {
    const [nextCursor, keys] = await publisher.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      1000,
    );

    cursor = nextCursor;

    if (keys.length > 0) {
      const pipeline = publisher.pipeline();
      for (const key of keys) {
        pipeline.del(key);
      }
      await pipeline.exec();
    }
  } while (cursor !== "0");
}

// Listen for invalidation messages
subscriber.subscribe("cache:invalidate");
subscriber.on("message", async (channel, message) => {
  if (channel === "cache:invalidate") {
    const { pattern } = JSON.parse(message);
    await deleteByPattern(pattern);
  }
});

// Publish invalidation from any thread/server
export async function invalidateCache(pattern: string) {
  await publisher.publish(
    "cache:invalidate",
    JSON.stringify({ pattern }),
  );
}

// Usage after a mutation
await invalidateCache("html:/blog/*");
```

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

| Feature                | Redis              | DragonflyDB            |
| ---------------------- | ------------------ | ---------------------- |
| Threading model        | Single-threaded    | Multi-threaded         |
| Memory efficiency      | Good               | Better (no jemalloc)   |
| Max throughput         | ~1M ops/sec        | ~25M ops/sec           |
| Snapshotting           | Fork-based (COW)   | Non-blocking           |
| Compatibility          | —                  | Redis API compatible   |

## Performance Comparison

Benchmarks for different communication patterns (rendering a medium-complexity
page):

| Method                     | Latency (p50) | Latency (p99) | Throughput      |
| -------------------------- | ------------- | ------------- | --------------- |
| SharedArrayBuffer (64KB)   | 0.5ms         | 2ms           | Highest         |
| Redis (local, DragonflyDB) | 1.5ms         | 5ms           | High            |
| Redis (remote)             | 3ms           | 15ms          | Medium          |
| JSON serialization (task)  | 2ms           | 8ms           | Medium-High     |

*Note: These are approximate values. Actual performance depends on hardware,
payload size, and network topology.*

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
