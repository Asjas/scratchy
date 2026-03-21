import type { PluginOption, UserConfig } from "vite";

/**
 * Options for the `scratchyVite` plugin array factory.
 */
export interface ScratchyViteOptions {
  /**
   * Enable React interop via `@builder.io/qwik-react`.
   * Requires `@builder.io/qwik-react` to be installed.
   * @default false
   */
  react?: boolean;

  /**
   * Enable Tailwind CSS via `@tailwindcss/vite`.
   * Requires `@tailwindcss/vite` to be installed.
   * @default true
   */
  tailwind?: boolean;
}

/**
 * Build configuration options for `createBuildConfig`.
 */
export interface BuildConfigOptions {
  /**
   * Build target for esbuild.
   * @default "es2022"
   */
  target?: string;

  /**
   * Enable source maps in production.
   * @default true
   */
  sourcemap?: boolean;

  /**
   * Manual chunk splitting configuration.
   * Provide a record mapping chunk names to arrays of module id substrings,
   * or a function that maps module ids to chunk names.
   */
  manualChunks?:
    | Record<string, string[]>
    | ((id: string) => string | undefined);
}

/**
 * Server configuration options for `createServerConfig`.
 */
export interface ServerConfigOptions {
  /**
   * Dev server port.
   * @default 4173
   */
  port?: number;

  /**
   * Backend server URL for API proxying.
   * @default "http://localhost:5000"
   */
  backendUrl?: string;

  /**
   * API path prefixes to proxy to the backend.
   * @default ["/trpc", "/external/api"]
   */
  proxyPaths?: string[];
}

/**
 * Full config options combining all sub-options.
 */
export interface ScratchyConfigOptions
  extends ScratchyViteOptions,
    BuildConfigOptions,
    ServerConfigOptions {}

/**
 * Tailwind CSS configuration options.
 */
export interface TailwindConfigOptions {
  /** Glob patterns for template files to scan for classes. */
  content?: string[];
  /** Dark mode strategy. @default "class" */
  darkMode?: "class" | "media";
}

/**
 * Tailwind CSS configuration object returned by `createTailwindConfig`.
 */
export interface TailwindConfig {
  content: string[];
  darkMode: "class" | "media";
  theme: {
    extend: {
      colors: Record<string, Record<string, string>>;
      fontFamily: Record<string, string[]>;
    };
  };
  plugins: unknown[];
}

const DEFAULT_PORT = 4173;
const DEFAULT_BACKEND_URL = "http://localhost:5000";
const DEFAULT_PROXY_PATHS = ["/trpc", "/external/api"];
const DEFAULT_TARGET = "es2022";
const DEFAULT_CONTENT_GLOBS = ["./src/**/*.{ts,tsx,mdx}"];

/**
 * Create an array of Vite plugins pre-configured for Scratchy.
 *
 * Includes Qwik City, Qwik, and `vite-tsconfig-paths` by default.
 * Optionally adds `@builder.io/qwik-react` and `@tailwindcss/vite`.
 */
export async function scratchyVite(
  opts?: ScratchyViteOptions,
): Promise<PluginOption[]> {
  const { react = false, tailwind = true } = opts ?? {};

  const { qwikCity } = await import("@builder.io/qwik-city/vite");
  const { qwikVite } = await import("@builder.io/qwik/optimizer");
  const tsconfigPaths = (await import("vite-tsconfig-paths")).default;

  const plugins: PluginOption[] = [
    ...qwikCity(),
    qwikVite(),
    tsconfigPaths(),
  ];

  if (react) {
    const { qwikReact } = await import("@builder.io/qwik-react/vite");
    plugins.push(qwikReact());
  }

  if (tailwind) {
    const tailwindPlugin = (await import("@tailwindcss/vite")).default;
    plugins.push(tailwindPlugin());
  }

  return plugins;
}

/**
 * Create a manual chunks function from a record of chunk name → module id
 * substrings, or pass through a custom function directly.
 */
function resolveManualChunks(
  manualChunks:
    | Record<string, string[]>
    | ((id: string) => string | undefined),
): (id: string) => string | undefined {
  if (typeof manualChunks === "function") {
    return manualChunks;
  }

  return (id: string): string | undefined => {
    for (const [chunkName, patterns] of Object.entries(manualChunks)) {
      if (patterns.some((pattern) => id.includes(pattern))) {
        return chunkName;
      }
    }
    return undefined;
  };
}

/**
 * Create the Vite `build` configuration with sensible defaults for Scratchy.
 */
export function createBuildConfig(opts?: BuildConfigOptions): UserConfig["build"] {
  const {
    target = DEFAULT_TARGET,
    sourcemap = true,
    manualChunks,
  } = opts ?? {};

  return {
    target,
    sourcemap,
    ...(manualChunks
      ? {
          rollupOptions: {
            output: {
              manualChunks: resolveManualChunks(manualChunks),
            },
          },
        }
      : {}),
  };
}

/**
 * Create the Vite `server` (and `preview`) configuration with proxy rules
 * for the Scratchy Fastify backend.
 */
export function createServerConfig(
  opts?: ServerConfigOptions,
): Pick<UserConfig, "server" | "preview"> {
  const {
    port = DEFAULT_PORT,
    backendUrl = DEFAULT_BACKEND_URL,
    proxyPaths = DEFAULT_PROXY_PATHS,
  } = opts ?? {};

  const proxy: Record<string, { target: string; changeOrigin: boolean }> = {};
  for (const path of proxyPaths) {
    proxy[path] = { target: backendUrl, changeOrigin: true };
  }

  return {
    server: { port, proxy },
    preview: { port },
  };
}

/**
 * Create a complete Vite `UserConfig` for a Scratchy application.
 *
 * Combines `scratchyVite` plugins, `createServerConfig`, and
 * `createBuildConfig` into a single config object.
 */
export async function createScratchyConfig(
  opts?: ScratchyConfigOptions,
): Promise<UserConfig> {
  const plugins = await scratchyVite(opts);
  const { server, preview } = createServerConfig(opts);
  const build = createBuildConfig(opts);

  return {
    plugins,
    server,
    preview,
    build,
  };
}

/**
 * Create a default Tailwind CSS configuration for Scratchy projects.
 *
 * Provides sensible defaults for content paths, dark mode, and theme
 * extensions (primary/accent colors and font families).
 */
export function createTailwindConfig(
  opts?: TailwindConfigOptions,
): TailwindConfig {
  const {
    content = DEFAULT_CONTENT_GLOBS,
    darkMode = "class",
  } = opts ?? {};

  return {
    content,
    darkMode,
    theme: {
      extend: {
        colors: {
          primary: {
            "50": "#f0f9ff",
            "100": "#e0f2fe",
            "200": "#bae6fd",
            "300": "#7dd3fc",
            "400": "#38bdf8",
            "500": "#0ea5e9",
            "600": "#0284c7",
            "700": "#0369a1",
            "800": "#075985",
            "900": "#0c4a6e",
          },
          accent: {
            "50": "#f5f3ff",
            "100": "#ede9fe",
            "200": "#ddd6fe",
            "300": "#c4b5fd",
            "400": "#a78bfa",
            "500": "#8b5cf6",
            "600": "#7c3aed",
            "700": "#6d28d9",
            "800": "#5b21b6",
            "900": "#4c1d95",
          },
        },
        fontFamily: {
          sans: ["Inter", "system-ui", "sans-serif"],
          mono: ["JetBrains Mono", "Fira Code", "monospace"],
        },
      },
    },
    plugins: [],
  };
}
