---
name: vite-bundling
description:
  "Guides Vite configuration and bundling patterns for the Scratchy framework's
  client-side code. Use when configuring Vite, setting up plugins, optimizing
  builds, configuring dev server proxying, or handling static assets. Trigger
  terms: Vite, bundling, build, dev server, HMR, plugin, chunk, code splitting,
  proxy, static assets."
metadata:
  tags: vite, bundling, build, dev-server, hmr, frontend
applyTo: "**/vite.config.ts,**/vite.config.js"
---

# Vite in Scratchy

## When to Use

Use these patterns when:

- Configuring the Vite build for client-side code
- Setting up the development server with HMR
- Adding Vite plugins (Qwik, React, Tailwind)
- Optimizing production builds
- Configuring proxy rules for API routes
- Handling static assets

## Configuration

### Basic Vite Config for Scratchy

```typescript
// vite.config.ts
import { qwikCity } from "@builder.io/qwik-city/vite";
import { qwikVite } from "@builder.io/qwik/optimizer";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [qwikCity(), qwikVite(), tsconfigPaths()],
  server: {
    port: 4173,
    // Proxy API requests to the Fastify backend
    proxy: {
      "/trpc": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      "/external/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["@builder.io/qwik"],
        },
      },
    },
  },
  optimizeDeps: {
    // Force Vite to pre-bundle these dependencies
    include: ["@builder.io/qwik", "@builder.io/qwik-city"],
  },
});
```

### With React Support (qwik-react)

```typescript
import { qwikCity } from "@builder.io/qwik-city/vite";
import { qwikReact } from "@builder.io/qwik-react/vite";
import { qwikVite } from "@builder.io/qwik/optimizer";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    qwikCity(),
    qwikVite(),
    qwikReact(), // Enable React component support
    tsconfigPaths(),
  ],
  // ... rest of config
});
```

### Tailwind CSS Integration

```typescript
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    // ... other plugins
    tailwindcss(),
  ],
});
```

## Development Server

### Proxy Configuration

Route API requests to the Fastify backend during development:

```typescript
server: {
  proxy: {
    // tRPC requests
    "/trpc": {
      target: "http://localhost:5000",
      changeOrigin: true,
    },
    // External API requests
    "/external/api": {
      target: "http://localhost:5000",
      changeOrigin: true,
    },
    // WebSocket support (for HMR or live features)
    "/ws": {
      target: "ws://localhost:5000",
      ws: true,
    },
  },
},
```

### Environment Variables

Vite exposes environment variables prefixed with `VITE_`:

```typescript
// Only VITE_ prefixed vars are exposed to client code
const apiUrl = import.meta.env.VITE_API_URL;
const appName = import.meta.env.VITE_APP_NAME;

// Server-only vars (not exposed to client)
// DATABASE_URL, SECRET_KEY, etc. — accessed via process.env on the server
```

```bash
# .env
VITE_API_URL=http://localhost:5000
VITE_APP_NAME=My Scratchy App

# .env.production
VITE_API_URL=https://api.example.com
VITE_APP_NAME=My App
```

## Build Optimization

### Code Splitting

Qwik handles code splitting automatically via the optimizer. Additional manual
chunks can be defined for shared vendor code:

```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: (id) => {
        if (id.includes("node_modules")) {
          // Group large dependencies into separate chunks
          if (id.includes("@builder.io/qwik")) return "vendor-qwik";
          if (id.includes("react")) return "vendor-react";
          return "vendor";
        }
      },
    },
  },
},
```

### Asset Handling

```typescript
build: {
  // Asset size warning threshold
  chunkSizeWarningLimit: 500, // KB

  // Asset output configuration
  assetsDir: "assets",
  assetsInlineLimit: 4096, // Inline assets < 4KB as base64
},
```

### CSS Configuration

```typescript
css: {
  // PostCSS config (if not using @tailwindcss/vite)
  postcss: "./postcss.config.js",

  // CSS modules
  modules: {
    localsConvention: "camelCaseOnly",
  },
},
```

## Static Assets

Place static files in the `public/` directory:

```
public/
├── favicon.ico
├── robots.txt
├── manifest.json
└── images/
    └── logo.svg
```

Reference in components:

```tsx
<img
  src="/images/logo.svg"
  alt="Logo"
  width={120}
  height={40}
/>
```

## Anti-Patterns

### ❌ Don't import server-only code in client modules

```typescript
// BAD — This will bundle server code into the client
import { db } from "~/db/index";
// GOOD — Use tRPC to call server code from the client
import { trpc } from "~/lib/trpc.client";

const users = await trpc.users.list.query();
```

### ❌ Don't hardcode API URLs

```typescript
// BAD
fetch("http://localhost:5000/trpc/users.list");

// GOOD — Use proxy in development, environment variables in production
fetch("/trpc/users.list");
```

## Reference Links

- [Vite Documentation](https://vite.dev/guide/)
- [Vite Configuration](https://vite.dev/config/)
- [Vite Server Proxy](https://vite.dev/config/server-options.html#server-proxy)
- [Vite Environment Variables](https://vite.dev/guide/env-and-mode.html)
- [Qwik Vite Plugin](https://qwik.dev/docs/integrations/vite/)
- [@tailwindcss/vite](https://tailwindcss.com/docs/installation/using-vite)
