# @scratchyjs/renderer

Worker-thread SSR and SSG for the Scratchy framework. Manages a
[Piscina](https://github.com/piscinajs/piscina) worker pool for server-side
rendering, exposes a Fastify plugin, an SSR route handler factory, an SSG
pipeline, and low-level SharedArrayBuffer / Redis communication helpers for
main-thread ↔ worker data exchange.

## Installation

```bash
pnpm add @scratchyjs/renderer
```

## Usage

### Register the worker-pool plugin

```typescript
import rendererPlugin from "@scratchyjs/renderer/plugin";
import { resolve } from "node:path";

await server.register(rendererPlugin, {
  worker: resolve(import.meta.dirname, "worker.js"),
  minThreads: 2,
  maxThreads: 8,
  taskTimeout: 30_000,
});

// Now available:
//   server.piscina   — the Piscina pool
//   server.runTask() — dispatch a render task
```

### SSR route handler

```typescript
import { createSSRHandler } from "@scratchyjs/renderer";

fastify.get(
  "/*",
  createSSRHandler({
    getProps: (request) => ({ user: request.user }),
  }),
);
```

### SSG pipeline

```typescript
import { runSsgPipeline } from "@scratchyjs/renderer";

const results = await runSsgPipeline({
  routes: ["/", "/about", "/blog"],
  runTask: server.runTask,
  outputDir: "./dist",
});
```

### SharedArrayBuffer communication (zero-copy)

```typescript
import {
  BufferStatus,
  createSharedBuffer,
  readFromBuffer,
  writeToBuffer,
} from "@scratchyjs/renderer";

// Main thread — create and write
const shared = createSharedBuffer(64 * 1024); // 64 KB payload area
writeToBuffer(shared, { route: "/about", user: null });

// Worker thread — read
const data = readFromBuffer<{ route: string }>(shared);
```

### Redis communication (distributed)

```typescript
import {
  cleanupRenderContext,
  getRenderContext,
  storeRenderContext,
  storeRenderResult,
} from "@scratchyjs/renderer";

// Main thread
await storeRenderContext(redis, requestId, { route, props });

// Worker thread
const context = await getRenderContext(redis, requestId);
const html = await render(context);
await storeRenderResult(redis, requestId, html);

// Cleanup
await cleanupRenderContext(redis, requestId);
```

### HTML shell wrapper

```typescript
import { wrapInShell } from "@scratchyjs/renderer";

const fullHtml = wrapInShell(renderedBody, {
  title: "My App",
  lang: "en",
  head: '<meta name="description" content="My App">',
});
```

## API

### `rendererPlugin` (Fastify plugin)

Registers a Piscina pool and decorates the server with `fastify.piscina` and
`fastify.runTask()`. The pool is closed automatically on server shutdown.

**Options** (`RendererPluginOptions`)

| Option                   | Default        | Description                            |
| ------------------------ | -------------- | -------------------------------------- |
| `worker`                 | —              | Absolute path to the worker entry file |
| `minThreads`             | `2`            | Minimum live worker threads            |
| `maxThreads`             | `max(4, cpus)` | Maximum worker threads                 |
| `idleTimeout`            | `60000`        | ms before an idle worker is terminated |
| `taskTimeout`            | `30000`        | ms before a task is aborted            |
| `maxOldGenerationSizeMb` | `512`          | V8 heap limit per worker (MB)          |

### `createSSRHandler(options?): FastifyRouteHandler`

Returns a Fastify route handler that dispatches an SSR task via
`fastify.runTask()` and sends the resulting HTML.

### `runSsgPipeline(options): Promise<SsgPipelineResult>`

Generates static HTML for a list of routes and writes them to `outputDir`.

### `createSharedBuffer(payloadSize?): SharedBuffer`

Creates a `SharedArrayBuffer`-backed buffer for zero-copy inter-thread
communication.

### `writeToBuffer(shared, data): void`

Serialises `data` to JSON, writes it into the shared buffer, and signals
`DATA_READY`.

### `readFromBuffer<T>(shared, timeoutMs?): T`

Waits for `DATA_READY`, deserialises, and returns the payload. Throws on timeout
or error status.

### `BufferStatus`

Constants: `IDLE`, `DATA_READY`, `CONSUMED`, `ERROR`.

### `storeRenderContext / getRenderContext / storeRenderResult / cleanupRenderContext`

Redis helpers for distributed main-thread ↔ worker communication with
configurable TTLs.

### `wrapInShell(body, options): string`

Wraps a rendered HTML body in a full HTML shell.

## Documentation

[https://scratchyjs.com/rendering](https://scratchyjs.com/rendering)
