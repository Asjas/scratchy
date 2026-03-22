# Documentation Map

> Navigate Scratchy documentation by **Diátaxis** type or by topic.

---

## By Diátaxis Type

### Tutorials — learning-oriented

| Document                                | Description                                                   |
| --------------------------------------- | ------------------------------------------------------------- |
| [Getting Started](./getting-started.md) | First-time setup: scaffold, configure, and run a Scratchy app |

### How-to Guides — problem-oriented

| Document                                  | Description                                          |
| ----------------------------------------- | ---------------------------------------------------- |
| [Data Loading](./data-loading.md)         | routeLoader$, caching, streaming, revalidation       |
| [Forms & Actions](./forms-and-actions.md) | routeAction$, Form component, file uploads, CSRF     |
| [Middleware](./middleware.md)             | Fastify hooks, route middleware, scoped middleware   |
| [Sessions](./sessions.md)                 | Cookies, session storage, flash messages, auth flows |
| [Streaming](./streaming.md)               | Streaming SSR, progressive rendering, defer/Await    |
| [Testing](./testing.md)                   | Testing pyramid, Vitest, Fastify inject, Cypress     |
| [Error Handling](./error-handling.md)     | Layered error handling: Zod, tRPC, Fastify, Qwik     |

### Reference — information-oriented

| Document                                    | Description                                            |
| ------------------------------------------- | ------------------------------------------------------ |
| [API Design](./api-design.md)               | tRPC 11 (internal) + REST Fastify routes (external)    |
| [CLI](./cli.md)                             | `create-scratchy-app`, generators, and templates       |
| [Data Layer](./data-layer.md)               | Drizzle ORM, schemas, queries, caching                 |
| [Project Structure](./project-structure.md) | Directory layout and naming conventions                |
| [References](./references.md)               | External links to all technologies                     |
| [Security](./security.md)                   | Defense-in-depth: auth, CORS, CSRF, CSP, rate limiting |

### Explanation — understanding-oriented

| Document                                          | Description                                       |
| ------------------------------------------------- | ------------------------------------------------- |
| [Architecture](./architecture.md)                 | System design rationale and layer overview        |
| [Rendering Pipeline](./rendering.md)              | Worker Thread rendering, SSR/SSG/CSR trade-offs   |
| [Worker Communication](./worker-communication.md) | SharedArrayBuffer vs Redis communication patterns |
| [Nitro Inspiration](./nitro-inspiration.md)       | Design decisions compared with Nitro/Nuxt         |

---

## By Topic

### Getting Started

1. [Getting Started](./getting-started.md) — scaffold and run your first app
2. [Project Structure](./project-structure.md) — understand the directory layout
3. [Architecture](./architecture.md) — learn the system design

### Server & API

1. [API Design](./api-design.md) — tRPC + REST routing
2. [Middleware](./middleware.md) — hooks, guards, plugin ordering
3. [Error Handling](./error-handling.md) — error boundaries at every layer

### Data

1. [Data Layer](./data-layer.md) — Drizzle ORM, schemas, queries
2. [Data Loading](./data-loading.md) — routeLoader$, caching, revalidation
3. [Sessions](./sessions.md) — cookies, session storage, auth flows

### Rendering & Streaming

1. [Rendering Pipeline](./rendering.md) — Worker Thread rendering
2. [Streaming](./streaming.md) — progressive rendering, defer/Await
3. [Worker Communication](./worker-communication.md) — SharedArrayBuffer, Redis

### Forms & Actions

1. [Forms & Actions](./forms-and-actions.md) — routeAction$, Form component
2. [Sessions](./sessions.md) — flash messages after submissions

### Security & Auth

1. [Security](./security.md) — defense-in-depth reference
2. [Sessions](./sessions.md) — cookie signing, CSRF tokens

### Testing & Tooling

1. [Testing](./testing.md) — Vitest, Fastify inject, Cypress
2. [CLI](./cli.md) — generators and templates

### Background & Design

1. [Architecture](./architecture.md) — system design rationale
2. [Nitro Inspiration](./nitro-inspiration.md) — why Scratchy diverges from
   Nitro
3. [References](./references.md) — external links
