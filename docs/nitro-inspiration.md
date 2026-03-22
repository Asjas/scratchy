# Nitro v3 Inspiration

> **Diátaxis type: [Explanation](https://diataxis.fr/explanation/)** —
> understanding-oriented, explains what Scratchy adopts and skips from Nitro's
> architecture and why.

## Table of Contents

- [Overview](#overview)
- [Key Concepts from Nitro](#key-concepts-from-nitro)
- [Concepts We Adopt](#concepts-we-adopt)
- [Concepts We Skip](#concepts-we-skip)
- [Source Code Study Areas](#source-code-study-areas)
- [Key Takeaways](#key-takeaways)
- [Related Documentation](#related-documentation)

---

## Overview

[Nitro](https://nitro.build/) is a powerful server toolkit that powers
[Nuxt](https://nuxt.com/) and can be used standalone. Scratchy draws inspiration
from Nitro's architecture while building on top of Node.js and Fastify
specifically for hosted server deployments.

## Key Concepts from Nitro

### 1. File-Based Routing for APIs

**Nitro approach:** Files in `routes/` or `api/` directories automatically
become API endpoints. The file path maps to the URL path.

**Scratchy adaptation:** We use `@fastify/autoload` to achieve similar
auto-loading of route files:

```typescript
// Nitro
// server/api/users.get.ts
export default defineEventHandler((event) => {
  return { users: [] };
});

// Scratchy equivalent
// src/routes/external/api/v1/users/index.ts
const routes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/", async (request, reply) => {
    return { users: [] };
  });
};
export default routes;
```

**Key difference:** Nitro uses method-based file naming (`users.get.ts`,
`users.post.ts`). Scratchy uses directory-based routing with Fastify's method
registration inside the handler file.

### 2. Auto-Imports

**Nitro approach:** Automatically imports utilities, composables, and framework
functions without explicit import statements.

**Scratchy adaptation:** We use explicit imports for type safety and clarity,
but configure TypeScript path aliases for clean import paths:

```typescript
// Instead of auto-imports, use path aliases
import { db } from "~/db/index.js";
import { findUserById } from "~/db/queries/users.js";
import { protectedProcedure } from "~/router.js";
```

**Decision:** Scratchy opts for explicit imports because:

- Better IDE support and refactoring
- Clearer dependency tracking
- Easier to understand for new contributors
- TypeScript path aliases provide similar DX benefits

### 3. Storage Layer

**Nitro approach:** `useStorage()` provides a unified key-value storage API that
works with multiple drivers (memory, filesystem, Redis, S3, etc.).

**Scratchy adaptation:** We separate storage concerns into specific layers:

| Storage Need    | Scratchy Solution                        |
| --------------- | ---------------------------------------- |
| Database        | Drizzle ORM + PostgreSQL                 |
| Cache           | Redis (DragonflyDB) + async-cache-dedupe |
| File Storage    | Direct S3/filesystem access              |
| Session Storage | Redis-backed sessions                    |

**Possible future:** A unified storage abstraction similar to Nitro's could be
built on top of these, but explicit layers give more control and type safety.

### 4. Server Engine Abstraction

**Nitro approach:** Uses [unjs/h3](https://github.com/unjs/h3) as a minimal HTTP
framework that can deploy to any runtime (Node.js, Deno, Bun, Cloudflare
Workers, etc.).

**Scratchy approach:** We use Fastify directly because:

- We target hosted servers only (not serverless/edge)
- Fastify's plugin system provides superior composability
- Fastify's schema-based validation is fast and well-typed
- Fastify's lifecycle hooks give fine-grained control
- The ecosystem of Fastify plugins is mature and battle-tested

**Trade-off:** We sacrifice universal runtime support for a richer, more
opinionated server framework.

### 5. Tasks System

**Nitro approach:** Scheduled and on-demand tasks with `defineTask()` and
cron-like scheduling.

**Scratchy adaptation:** Heavy tasks run in Worker Threads via Piscina:

```typescript
// Nitro
// server/tasks/cleanup.ts
export default defineTask({
  meta: { description: "Clean up expired sessions" },
  run() {
    // cleanup logic
  },
});

// Scratchy equivalent
// Register as a Fastify plugin with a timer
export default fp(async function cleanup(fastify) {
  const interval = setInterval(
    async () => {
      await fastify.runTask({ type: "cleanup", target: "sessions" });
    },
    60 * 60 * 1000,
  ); // Every hour

  fastify.addHook("onClose", () => clearInterval(interval));
});
```

### 6. Rendering Integration

**Nitro approach:** Nitro provides `useRenderHandler()` to integrate with
frontend frameworks like Vue/Nuxt for SSR.

**Scratchy approach:** Rendering is explicitly handled via Worker Threads:

```
Nitro:    Request → h3 handler → Vue SSR (same thread) → Response
Scratchy: Request → Fastify → Piscina Worker → Qwik SSR → Response
```

**Key difference:** Scratchy offloads SSR to workers to keep the main thread
free for API responses. This is more complex but provides better isolation and
prevents SSR from blocking API performance.

### 7. Build System

**Nitro approach:** Uses Rollup to bundle the server code into a deployable
output with tree-shaking and preset-based configuration for different platforms.

**Scratchy approach:**

- Server code runs directly via Node.js type stripping (no build step)
- Client code is bundled by Vite with the Qwik optimizer
- Production deployment uses the source TypeScript directly

**Decision:** Node.js 22+ type stripping eliminates the need for a server build
step. This simplifies the development workflow and reduces build time.

## Concepts We Adopt

| Concept                | From Nitro           | Scratchy Implementation           |
| ---------------------- | -------------------- | --------------------------------- |
| File-based API routing | `routes/` directory  | `@fastify/autoload` with routes   |
| Plugin system          | `plugins/` directory | Fastify plugins with `fp()`       |
| Middleware             | `middleware/` dir    | Fastify hooks and tRPC middleware |
| Configuration          | `nitro.config.ts`    | `vite.config.ts` + `config.ts`    |
| Task scheduling        | `defineTask()`       | Piscina workers + cron plugins    |
| Error handling         | `createError()`      | Fastify error handlers + tRPC     |
| Development server     | Built-in HMR         | Vite dev server + Fastify watch   |

## Concepts We Skip

| Concept             | Nitro Feature   | Why We Skip It                   |
| ------------------- | --------------- | -------------------------------- |
| Universal runtime   | Multi-platform  | We target Node.js only           |
| Auto-imports        | Zero-import DX  | Prefer explicit imports          |
| Unified storage     | `useStorage()`  | Use specific layers (DB, Redis)  |
| Server build/bundle | Rollup bundling | Type stripping = no build needed |
| Preset system       | Deploy presets  | Single target (Node.js servers)  |

## Source Code Study Areas

When reading the [Nitro source code](https://github.com/nitrojs/nitro), focus on
these areas for inspiration:

1. **`src/core/`** — Framework initialization, plugin loading, route scanning
2. **`src/runtime/`** — Request handling, error management, context creation
3. **`src/presets/`** — How they abstract deployment targets (study the Node.js
   preset)
4. **`src/rollup/`** — Build pipeline (understand what we can skip with type
   stripping)
5. **`src/types/`** — TypeScript type system architecture

## Key Takeaways

1. **Convention over configuration** — Nitro's file-based patterns are
   developer-friendly. Adopt where possible.
2. **Plugin everything** — Both Nitro and Fastify share this philosophy. Make
   every feature a plugin.
3. **Type safety first** — Nitro's TypeScript integration is excellent. We
   should match or exceed it.
4. **Explicit > Magic** — Where Nitro uses auto-imports, we prefer explicit
   imports for clarity and tooling support.
5. **Server-specific optimization** — Since we don't need universal runtime
   support, we can leverage Node.js-specific features (Worker Threads,
   SharedArrayBuffer) that Nitro can't use in its universal model.

## Related Documentation

- [Architecture](./architecture.md) — Full system design and design decisions
- [Middleware](./middleware.md) — Fastify hooks vs. Nitro middleware
- [Rendering](./rendering.md) — Worker-based SSR vs. Nitro's same-thread
  approach
- [Worker Communication](./worker-communication.md) — SharedArrayBuffer and
  Redis patterns
- [Project Structure](./project-structure.md) — Directory conventions
