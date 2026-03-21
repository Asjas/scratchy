import {
  createBuildConfig,
  createScratchyConfig,
  createServerConfig,
  createTailwindConfig,
  scratchyVite,
} from "./index.js";
import { describe, expect, it } from "vitest";

describe("scratchyVite", () => {
  it("should return an array of Vite plugins", async () => {
    const plugins = await scratchyVite();

    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThan(0);
  });

  it("should include Qwik City, Qwik, tsconfig paths, and Tailwind by default", async () => {
    const plugins = await scratchyVite();

    // qwikCity() returns an array so we flatten into the plugins list
    // Minimum: qwikCity plugins + qwikVite + tsconfigPaths + tailwindcss
    expect(plugins.length).toBeGreaterThanOrEqual(4);
  });

  it("should include more plugins when react is enabled", async () => {
    const withoutReact = await scratchyVite({ react: false });
    const withReact = await scratchyVite({ react: true });

    expect(withReact.length).toBeGreaterThan(withoutReact.length);
  });

  it("should exclude Tailwind when tailwind is false", async () => {
    const withTailwind = await scratchyVite({ tailwind: true });
    const withoutTailwind = await scratchyVite({ tailwind: false });

    expect(withTailwind.length).toBeGreaterThan(withoutTailwind.length);
  });

  it("should work with default options (no arguments)", async () => {
    const plugins = await scratchyVite();
    expect(plugins).toBeDefined();
    expect(Array.isArray(plugins)).toBe(true);
  });
});

describe("createBuildConfig", () => {
  it("should return default build config", () => {
    const config = createBuildConfig();

    expect(config).toBeDefined();
    expect(config?.target).toBe("es2022");
    expect(config?.sourcemap).toBe(true);
  });

  it("should accept a custom target", () => {
    const config = createBuildConfig({ target: "es2024" });
    expect(config?.target).toBe("es2024");
  });

  it("should accept a custom sourcemap setting", () => {
    const config = createBuildConfig({ sourcemap: false });
    expect(config?.sourcemap).toBe(false);
  });

  it("should include manual chunks when provided as a record", () => {
    const config = createBuildConfig({
      manualChunks: {
        vendor: ["@builder.io/qwik"],
        react: ["react", "react-dom"],
      },
    });

    expect(config?.rollupOptions?.output).toBeDefined();
    const output = config?.rollupOptions?.output;

    // Should be an object with manualChunks function
    expect(output).not.toBeInstanceOf(Array);
    const singleOutput = output as Record<string, unknown>;
    expect(typeof singleOutput.manualChunks).toBe("function");

    // Test the generated function
    const fn = singleOutput.manualChunks as (id: string) => string | undefined;
    expect(fn("node_modules/@builder.io/qwik/core.js")).toBe("vendor");
    expect(fn("node_modules/react/index.js")).toBe("react");
    expect(fn("src/app.tsx")).toBeUndefined();
  });

  it("should accept manual chunks as a function", () => {
    const customFn = (id: string) =>
      id.includes("node_modules") ? "vendor" : undefined;

    const config = createBuildConfig({ manualChunks: customFn });
    const output = config?.rollupOptions?.output as Record<string, unknown>;
    expect(output.manualChunks).toBe(customFn);
  });

  it("should not include rollupOptions when no manual chunks provided", () => {
    const config = createBuildConfig();
    expect(config?.rollupOptions).toBeUndefined();
  });
});

describe("createServerConfig", () => {
  it("should return default server and preview config", () => {
    const { server, preview } = createServerConfig();

    expect(server?.port).toBe(4173);
    expect(preview?.port).toBe(4173);
  });

  it("should include default proxy paths", () => {
    const { server } = createServerConfig();
    const proxy = server?.proxy as Record<string, unknown>;

    expect(proxy["/trpc"]).toBeDefined();
    expect(proxy["/external/api"]).toBeDefined();
  });

  it("should proxy to localhost:5000 by default", () => {
    const { server } = createServerConfig();
    const proxy = server?.proxy as Record<
      string,
      { target: string; changeOrigin: boolean }
    >;

    expect(proxy["/trpc"]?.target).toBe("http://localhost:5000");
    expect(proxy["/trpc"]?.changeOrigin).toBe(true);
  });

  it("should accept a custom port", () => {
    const { server, preview } = createServerConfig({ port: 3000 });

    expect(server?.port).toBe(3000);
    expect(preview?.port).toBe(3000);
  });

  it("should accept a custom backend URL", () => {
    const { server } = createServerConfig({
      backendUrl: "http://api.example.com",
    });
    const proxy = server?.proxy as Record<
      string,
      { target: string; changeOrigin: boolean }
    >;

    expect(proxy["/trpc"]?.target).toBe("http://api.example.com");
  });

  it("should accept custom proxy paths", () => {
    const { server } = createServerConfig({
      proxyPaths: ["/api/v1", "/graphql"],
    });
    const proxy = server?.proxy as Record<string, unknown>;

    expect(proxy["/api/v1"]).toBeDefined();
    expect(proxy["/graphql"]).toBeDefined();
    expect(proxy["/trpc"]).toBeUndefined();
  });
});

describe("createScratchyConfig", () => {
  it("should return a complete Vite UserConfig", async () => {
    const config = await createScratchyConfig();

    expect(config.plugins).toBeDefined();
    expect(Array.isArray(config.plugins)).toBe(true);
    expect(config.server).toBeDefined();
    expect(config.preview).toBeDefined();
    expect(config.build).toBeDefined();
  });

  it("should combine plugin, server, and build config", async () => {
    const config = await createScratchyConfig({
      react: true,
      port: 3000,
      target: "es2024",
    });

    expect(config.server?.port).toBe(3000);
    expect(config.build?.target).toBe("es2024");
    expect(
      (config.plugins as unknown[]).length,
    ).toBeGreaterThan(0);
  });
});

describe("createTailwindConfig", () => {
  it("should return a valid Tailwind CSS config", () => {
    const config = createTailwindConfig();

    expect(config.content).toEqual(["./src/**/*.{ts,tsx,mdx}"]);
    expect(config.darkMode).toBe("class");
    expect(config.theme.extend.colors.primary).toBeDefined();
    expect(config.theme.extend.colors.accent).toBeDefined();
    expect(config.theme.extend.fontFamily.sans).toBeDefined();
    expect(config.theme.extend.fontFamily.mono).toBeDefined();
    expect(config.plugins).toEqual([]);
  });

  it("should accept custom content paths", () => {
    const config = createTailwindConfig({
      content: ["./app/**/*.tsx", "./components/**/*.tsx"],
    });

    expect(config.content).toEqual([
      "./app/**/*.tsx",
      "./components/**/*.tsx",
    ]);
  });

  it("should accept media dark mode strategy", () => {
    const config = createTailwindConfig({ darkMode: "media" });
    expect(config.darkMode).toBe("media");
  });

  it("should include primary color palette with standard shades", () => {
    const config = createTailwindConfig();
    const primary = config.theme.extend.colors["primary"];

    expect(primary).toBeDefined();
    expect(primary?.["50"]).toBeDefined();
    expect(primary?.["500"]).toBeDefined();
    expect(primary?.["900"]).toBeDefined();
  });

  it("should include accent color palette with standard shades", () => {
    const config = createTailwindConfig();
    const accent = config.theme.extend.colors["accent"];

    expect(accent).toBeDefined();
    expect(accent?.["50"]).toBeDefined();
    expect(accent?.["500"]).toBeDefined();
    expect(accent?.["900"]).toBeDefined();
  });

  it("should include Inter and JetBrains Mono fonts", () => {
    const config = createTailwindConfig();

    expect(config.theme.extend.fontFamily.sans).toContain("Inter");
    expect(config.theme.extend.fontFamily.mono).toContain("JetBrains Mono");
  });
});
