import { createScratchyConfig } from "@scratchyjs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig(async ({ mode }) => {
  if (mode === "test" || process.env.VITEST) {
    // Keep Vitest startup lightweight and avoid Qwik City route validation.
    return {};
  }

  return createScratchyConfig({
    // Enable Tailwind CSS (requires @tailwindcss/vite to be installed)
    tailwind: true,
    // Enable React interop if you need to use React components via qwikify$()
    react: false,
    // Backend URL for API proxying during development
    backendUrl: "http://localhost:3001",
    proxyPaths: ["/external/api"],
  });
});
