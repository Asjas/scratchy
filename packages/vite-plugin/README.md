# @scratchyjs/vite-plugin

Vite plugin preset and configuration helpers for Scratchy applications. Bundles
Qwik City, Qwik, and `vite-tsconfig-paths` into a single `scratchyVite()` call,
with optional Tailwind CSS and React interop, plus helpers for build and
dev-server configuration.

## Installation

```bash
pnpm add -D @scratchyjs/vite-plugin
```

## Usage

### Minimal `vite.config.ts`

```typescript
import { createScratchyConfig } from "@scratchyjs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig(async () => createScratchyConfig());
```

### With options

```typescript
import { createScratchyConfig } from "@scratchyjs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig(async () =>
  createScratchyConfig({
    // Rendering
    react: true, // enable @builder.io/qwik-react
    tailwind: true, // enable @tailwindcss/vite (default: true)

    // Dev server
    port: 4173,
    backendUrl: "http://localhost:5000",
    proxyPaths: ["/trpc", "/external/api"],

    // Build
    target: "es2022",
    sourcemap: true,
    manualChunks: { vendor: ["@builder.io/qwik"] },
  }),
);
```

### Tailwind config

```typescript
// tailwind.config.ts
import { createTailwindConfig } from "@scratchyjs/vite-plugin";

export default createTailwindConfig({
  content: ["./src/**/*.{ts,tsx,mdx}"],
  darkMode: "class",
});
```

## API

### `scratchyVite(options?): Promise<PluginOption[]>`

Returns an array of Vite plugins: Qwik City, Qwik, `vite-tsconfig-paths`, and
optionally `@builder.io/qwik-react` and `@tailwindcss/vite`.

**Options** (`ScratchyViteOptions`)

| Option     | Default | Description                      |
| ---------- | ------- | -------------------------------- |
| `react`    | `false` | Include `@builder.io/qwik-react` |
| `tailwind` | `true`  | Include `@tailwindcss/vite`      |

### `createBuildConfig(options?): UserConfig["build"]`

Returns a Vite `build` config with sensible Scratchy defaults.

**Options** (`BuildConfigOptions`)

| Option         | Default    | Description                                   |
| -------------- | ---------- | --------------------------------------------- |
| `target`       | `"es2022"` | esbuild target                                |
| `sourcemap`    | `true`     | Emit source maps                              |
| `manualChunks` | —          | Record or function for manual chunk splitting |

### `createServerConfig(options?): Pick<UserConfig, "server" \| "preview">`

Returns a Vite `server` + `preview` config that proxies API paths to the Fastify
backend.

**Options** (`ServerConfigOptions`)

| Option       | Default                      | Description             |
| ------------ | ---------------------------- | ----------------------- |
| `port`       | `4173`                       | Dev/preview server port |
| `backendUrl` | `"http://localhost:5000"`    | Fastify backend URL     |
| `proxyPaths` | `["/trpc", "/external/api"]` | Paths to proxy          |

### `createScratchyConfig(options?): Promise<UserConfig>`

Combines `scratchyVite`, `createServerConfig`, and `createBuildConfig` into a
single complete Vite `UserConfig`.

Accepts all options from `ScratchyViteOptions`, `BuildConfigOptions`, and
`ServerConfigOptions`.

### `createTailwindConfig(options?): TailwindConfig`

Returns a default Tailwind CSS configuration with Scratchy's theme extensions
(primary/accent colours, Inter + JetBrains Mono font families).

**Options** (`TailwindConfigOptions`)

| Option     | Default                       | Description            |
| ---------- | ----------------------------- | ---------------------- |
| `content`  | `["./src/**/*.{ts,tsx,mdx}"]` | Template glob patterns |
| `darkMode` | `"class"`                     | Dark mode strategy     |

## Documentation

[https://scratchyjs.com/rendering](https://scratchyjs.com/rendering)
