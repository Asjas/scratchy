# Scratchy Framework Architecture

## Overview

Scratchy is a full-stack TypeScript framework designed for building APIs and websites on hosted/dedicated servers. It is **not** a serverless framework — it is built for long-running Node.js processes with persistent connections, worker pools, and in-memory caching.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                         │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Qwik Pages   │  │ React Islands│  │ Tailwind CSS Styles  │  │
│  │ (Resumable)  │  │ (qwikify$)   │  │ (Utility-first)      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘  │
│         │                 │                                     │
│  ┌──────┴─────────────────┴──────┐                              │
│  │   tRPC Client (internal)      │                              │
│  │   REST Client (external APIs) │                              │
│  └──────────────┬────────────────┘                              │
└─────────────────┼───────────────────────────────────────────────┘
                  │ HTTP/WebSocket
┌─────────────────┼───────────────────────────────────────────────┐
│                 ▼                                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Fastify Server                          │   │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐  │   │
│  │  │ tRPC     │  │ REST     │  │ Static Asset Serving   │  │   │
│  │  │ /trpc/*  │  │ /ext/api │  │ (Vite build output)    │  │   │
│  │  └────┬─────┘  └────┬─────┘  └────────────────────────┘  │   │
│  │       │              │                                     │   │
│  │  ┌────┴──────────────┴────────┐                            │   │
│  │  │  Plugins & Middleware      │                            │   │
│  │  │  (Auth, CORS, Rate Limit,  │                            │   │
│  │  │   Helmet, Logging)         │                            │   │
│  │  └────────────┬───────────────┘                            │   │
│  └───────────────┼───────────────────────────────────────────┘   │
│                  │                                                │
│  ┌───────────────┼───────────────────────────────────────────┐   │
│  │               ▼                                            │   │
│  │  ┌────────────────────┐  ┌──────────────────────────────┐ │   │
│  │  │  Piscina Worker    │  │  Data Layer                  │ │   │
│  │  │  Pool              │  │                              │ │   │
│  │  │  ┌──────┐┌──────┐  │  │  ┌────────────┐  ┌────────┐ │ │   │
│  │  │  │ SSR  ││ SSG  │  │  │  │ Drizzle ORM│  │ Redis  │ │ │   │
│  │  │  │Worker││Worker│  │  │  │ (PostgreSQL)│  │(Cache) │ │ │   │
│  │  │  └──────┘└──────┘  │  │  └────────────┘  └────────┘ │ │   │
│  │  └────────────────────┘  └──────────────────────────────┘ │   │
│  │         Node.js Server Process                             │   │
│  └────────────────────────────────────────────────────────────┘   │
│                              Host Server                          │
└───────────────────────────────────────────────────────────────────┘
```

## Design Decisions

### 1. Server-First, Not Serverless

**Decision:** Build for hosted/dedicated servers with long-running processes.

**Rationale:**
- Persistent connections to databases and Redis reduce cold start overhead
- Worker Thread pools can be pre-warmed and kept alive
- In-memory caching (LRU, async-cache-dedupe) is effective with long-lived processes
- Connection pooling is straightforward without serverless lifecycle concerns
- WebSocket and SSE connections are natively supported

**Trade-off:** No auto-scaling per-request; scaling is done via horizontal server instances behind a load balancer.

### 2. Worker Threads for Rendering

**Decision:** Use Piscina Worker Thread pools for SSR and SSG instead of rendering on the main thread.

**Rationale:**
- SSR can be CPU-intensive (serializing component trees to HTML)
- Blocking the main thread would delay API responses
- Worker Threads have their own V8 isolate — garbage collection doesn't affect the main thread
- Piscina manages thread lifecycle, queuing, and resource limits
- `fastify-piscina` integrates cleanly with Fastify's plugin system

**Trade-off:** Slightly higher memory usage (each worker has its own V8 heap) and communication overhead for small payloads.

### 3. Qwik as Primary Renderer (Not React)

**Decision:** Use Qwik for rendering with React as an escape hatch via `qwikify$()`.

**Rationale:**
- Qwik's resumability means zero JavaScript is shipped until interaction
- Fine-grained lazy loading at the component and handler level
- Smaller initial JavaScript payload compared to React SSR + hydration
- React interop allows using the React ecosystem when needed
- Server-first architecture aligns with Qwik's design philosophy

**Trade-off:** Smaller ecosystem than React; developers need to learn Qwik's `$()` convention.

### 4. tRPC for Internal, REST for External

**Decision:** Use tRPC for all internal API communication and Fastify REST routes for external APIs.

**Rationale:**
- tRPC provides end-to-end type safety without code generation
- Internal clients (our own frontend) benefit from shared TypeScript types
- External consumers (third-party integrations) need standard REST with OpenAPI docs
- CORS is enabled only on `/external/api` routes, reducing attack surface
- tRPC's batching and streaming reduce round trips for internal use

**Trade-off:** Two API patterns to maintain, but the boundary is clear.

### 5. Drizzle ORM over Prisma

**Decision:** Use Drizzle ORM as the data layer.

**Rationale:**
- SQL-first approach — generated queries are predictable and inspectable
- No runtime query engine (unlike Prisma's Rust engine)
- Type-safe queries derived from schema definitions
- Lightweight — doesn't require a separate process or binary
- Schema definitions are plain TypeScript (easy to version control and review)
- Prepared statements are first-class citizens
- Supports raw SQL when needed without escaping the type system

**Trade-off:** Less "magic" than Prisma — requires writing more explicit queries.

### 6. Communication Patterns

**Decision:** Support both SharedArrayBuffer+Atomics and Redis for worker communication.

**Rationale:**
- SharedArrayBuffer for zero-copy, low-latency data sharing on a single server
- Redis (DragonflyDB) for distributed scenarios and cross-server state
- Let the developer choose based on deployment topology
- SharedArrayBuffer is ideal for large payloads (e.g., serialized component trees)
- Redis is ideal for cached data that multiple servers need to access

### 7. Convention-Based CLI Scaffolding

**Decision:** Provide CLI commands to scaffold models, views, APIs, and controllers.

**Rationale:**
- Reduces boilerplate and human error
- Enforces consistent project structure and naming conventions
- Inspired by Laravel's `artisan` and RedwoodJS's `generate` commands
- New team members can be productive immediately
- Generated code follows all framework conventions automatically

## Layer Responsibilities

| Layer              | Responsibility                                           | Key Technology       |
| ------------------ | -------------------------------------------------------- | -------------------- |
| **Client**         | UI rendering, state management, user interaction         | Qwik, React, Vite    |
| **API (Internal)** | Type-safe RPC between client and server                  | tRPC, superjson       |
| **API (External)** | RESTful endpoints for third-party consumers              | Fastify routes, CORS  |
| **Server**         | HTTP handling, plugins, middleware, lifecycle management  | Fastify               |
| **Workers**        | SSR, SSG, heavy computation off the main thread          | Piscina, Worker Threads |
| **Data**           | Database access, schema management, migrations           | Drizzle ORM, PostgreSQL |
| **Cache**          | Response caching, request deduplication                  | Redis/DragonflyDB, async-cache-dedupe |
| **CLI**            | Project scaffolding, code generation                     | Custom CLI tool        |

## Security Layers

1. **CORS** — Enabled only on `/external/api` routes
2. **Helmet** — Security headers on all responses
3. **Rate Limiting** — Per-route and global rate limits
4. **Authentication** — Session-based via Better Auth (or equivalent)
5. **Authorization** — tRPC middleware (isAuthenticated, isOwner, isAdmin)
6. **Input Validation** — Zod schemas on all inputs (tRPC and REST)
7. **SQL Injection Prevention** — Drizzle ORM parameterized queries

## Scalability Model

```
                  Load Balancer
                  ┌─────────┐
                  │  Nginx / │
                  │  HAProxy │
                  └────┬────┘
           ┌──────────┼──────────┐
           ▼          ▼          ▼
      ┌─────────┐┌─────────┐┌─────────┐
      │ Server 1 ││ Server 2 ││ Server 3 │
      │ (Fastify)││ (Fastify)││ (Fastify)│
      │ +Workers ││ +Workers ││ +Workers │
      └────┬─────┘└────┬─────┘└────┬─────┘
           │           │           │
           └─────┬─────┘           │
                 ▼                 ▼
          ┌────────────┐   ┌────────────┐
          │ PostgreSQL  │   │   Redis    │
          │ (Primary +  │   │ (DragonflyDB)
          │  Replicas)  │   │            │
          └────────────┘   └────────────┘
```

- Each server instance has its own Piscina worker pool
- PostgreSQL handles data persistence with connection pooling
- Redis handles caching, session storage, and inter-server communication
- Horizontal scaling by adding more server instances
