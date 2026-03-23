# @scratchyjs/example-streaming-ssr — Streaming SSR Application

A focused example demonstrating **HTTP streaming SSR** with the Scratchy
framework. HTML is split into ordered chunks and sent to the browser via chunked
transfer encoding, allowing the browser to begin rendering critical content
before the full body has arrived.

## What It Shows

| Layer           | Package                   | Role                                              |
| --------------- | ------------------------- | ------------------------------------------------- |
| HTTP server     | `@scratchyjs/core`        | Fastify with CORS, helmet, rate-limiting          |
| Streaming SSR   | `@scratchyjs/renderer`    | `createStreamingSSRHandler` + Piscina worker pool |
| Client bundling | `@scratchyjs/vite-plugin` | Vite + Qwik + Tailwind CSS                        |
| Utilities       | `@scratchyjs/utils`       | Request helpers                                   |

Unlike the [starter example](../starter), this example intentionally **omits the
database and authentication layers** to stay focused on the streaming rendering
pipeline.

## Pages

| Route       | Description                                                     |
| ----------- | --------------------------------------------------------------- |
| `/`         | Home — hero section, framework stats, and feature highlights    |
| `/about`    | About — mission, story, values, and team                        |
| `/features` | Features — detailed feature cards for every Scratchy capability |
| `/blog`     | Blog — list of articles with tags, author, and reading time     |
| `/contact`  | Contact — contact channels and a feedback form                  |

Every page route uses `createStreamingSSRHandler()`. The `/blog` and other
routes also pass **server-side props** to the worker, showing how to embed
structured data in the streamed response.

## How Streaming SSR Works

```
Browser         Fastify           Piscina Worker
  │               │                    │
  │  GET /blog    │                    │
  │──────────────►│                    │
  │               │  runTask({         │
  │               │   type:"ssr-stream"│
  │               │   route:"/blog"    │
  │               │   props:{posts:…}  │
  │               │  })                │
  │               │───────────────────►│
  │               │                    │  renderStreamingSSR()
  │               │                    │  → chunks[0]: <head>
  │◄──────────────│◄───────────────────│
  │  chunk[0]     │                    │  → chunks[1]: <body>
  │◄──────────────│◄───────────────────│
  │  chunk[1]     │                    │  → chunks[2]: </body>
  │◄──────────────│◄───────────────────│
  │  chunk[2]     │                    │
```

Fastify's `reply.send(Readable.from(chunks))` automatically applies
`Transfer-Encoding: chunked`, enabling the browser to parse and render HTML
progressively as each chunk arrives.

## Getting Started

### Prerequisites

- Node.js >= 24
- pnpm >= 10

> **No database or Docker required** — this example uses only in-memory / static
> data.

### 1. Configure environment

```bash
cp .env.example .env
```

The default `.env.example` already works without modification.

### 2. Install dependencies

```bash
# From the monorepo root
pnpm install
```

### 3. Start the server

```bash
# From examples/streaming-ssr/
pnpm dev
```

The server starts on `http://localhost:3001`.

## API Endpoints

| Method | URL         | Description                               |
| ------ | ----------- | ----------------------------------------- |
| GET    | `/health`   | Health check — returns `{ status: "ok" }` |
| GET    | `/`         | Streaming SSR — home page                 |
| GET    | `/about`    | Streaming SSR — about page                |
| GET    | `/features` | Streaming SSR — features page             |
| GET    | `/blog`     | Streaming SSR — blog listing              |
| GET    | `/contact`  | Streaming SSR — contact page              |
| GET    | `/*`        | Streaming SSR — catch-all                 |

## Project Structure

```
src/
├── index.ts              # Server entry point
├── server.ts             # Server factory (wires all packages + page routes)
├── config.ts             # App config (extends @scratchyjs/core)
├── types/
│   └── fastify.d.ts      # Fastify type augmentations
├── renderer/
│   └── worker.ts         # Piscina worker (delegates to @scratchyjs/renderer)
├── client/
│   ├── routes/
│   │   ├── layout.tsx    # Qwik root layout (shared nav with 5 links)
│   │   ├── index.tsx     # Home page
│   │   ├── about/
│   │   │   └── index.tsx # About page
│   │   ├── features/
│   │   │   └── index.tsx # Features page
│   │   ├── blog/
│   │   │   └── index.tsx # Blog listing
│   │   └── contact/
│   │       └── index.tsx # Contact page
│   └── styles/
│       └── global.css    # Tailwind CSS entry point
└── server.test.ts        # Integration tests
```

## Running Tests

```bash
# From the monorepo root
pnpm test
```

## Adding a New Page

1. Create `src/client/routes/my-page/index.tsx` with a Qwik component.
2. Add a route handler in `src/server.ts`:
   ```ts
   server.get(
     "/my-page",
     createStreamingSSRHandler({
       getProps: () => ({ page: "my-page", data: "…" }),
     }),
   );
   ```
3. Add a nav link in `src/client/routes/layout.tsx`.
