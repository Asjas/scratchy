import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";

/**
 * Server-side data loader for the features page.
 */
export const useFeaturesData = routeLoader$(() => ({
  intro:
    "Everything you need to build fast, resilient, server-rendered applications — batteries included.",
  features: [
    {
      icon: "⚡",
      title: "Streaming SSR",
      badge: "Core",
      description:
        "HTML is split into ordered chunks and streamed via HTTP chunked transfer encoding. The browser starts painting critical above-the-fold content from the first chunk — before the full body has even been generated.",
      details: [
        "Chunked transfer encoding out of the box",
        "Worker-based streaming isolates render time from API latency",
        "Progressive enhancement — works without JavaScript",
      ],
    },
    {
      icon: "🧵",
      title: "Piscina Worker Threads",
      badge: "Core",
      description:
        "All SSR work runs in a managed Piscina Worker Thread pool. The main Fastify event loop handles only I/O, keeping request throughput high even under heavy render load.",
      details: [
        "Configurable min/max thread counts",
        "Per-task timeout to prevent hung renders",
        "Automatic pool drain on graceful shutdown",
      ],
    },
    {
      icon: "🔁",
      title: "Qwik Resumability",
      badge: "Renderer",
      description:
        "Qwik serialises application state into the HTML on the server. The client resumes from that state without replaying any component logic — achieving true zero-hydration cost.",
      details: [
        "Zero JavaScript shipped until user interaction",
        "Fine-grained lazy loading at component boundaries",
        "Full React interop via qwikify$()",
      ],
    },
    {
      icon: "🚀",
      title: "Fastify 5",
      badge: "Server",
      description:
        "Fastify provides world-class JSON throughput, a schema-first route definition model with Zod, and a powerful plugin lifecycle that keeps your codebase modular.",
      details: [
        "Zod schema validation and serialisation",
        "@fastify/autoload for zero-config plugin loading",
        "Built-in rate limiting, CORS, and security headers",
      ],
    },
    {
      icon: "🔒",
      title: "Type-safe End-to-End",
      badge: "DX",
      description:
        "TypeScript strict mode from the PostgreSQL schema to the last Qwik component. tRPC provides compile-time safe API calls with superjson serialisation — no code generation required.",
      details: [
        "Drizzle ORM with inferred types from schema",
        "tRPC 11 with superjson transformer",
        "No `any` types — use `unknown` and type guards",
      ],
    },
    {
      icon: "🎨",
      title: "Tailwind CSS",
      badge: "Styling",
      description:
        "Utility-first styling co-located with your Qwik components. The Vite plugin integrates Tailwind's JIT compiler so unused styles are purged automatically in production.",
      details: [
        "@tailwindcss/vite for zero-config integration",
        "Dark mode via the `dark:` variant",
        "Mobile-first responsive utilities",
      ],
    },
  ],
}));

/**
 * Features page — detailed feature cards with descriptions and bullet points.
 */
export default component$(() => {
  const data = useFeaturesData();
  const { intro, features } = data.value;

  const badgeColours: Record<string, string> = {
    Core: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    Renderer:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
    Server:
      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    DX: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
    Styling: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  };

  return (
    <div>
      {/* Page header */}
      <section class="mb-12">
        <h1 class="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
          Features
        </h1>
        <p class="mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
          {intro}
        </p>
      </section>

      {/* Feature cards */}
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {features.map(({ icon, title, badge, description, details }) => (
          <div
            key={title}
            class="flex flex-col rounded-xl border border-gray-200 p-6 dark:border-gray-800"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="text-3xl">{icon}</div>
              <span
                class={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeColours[badge] ?? "bg-gray-100 text-gray-800"}`}
              >
                {badge}
              </span>
            </div>
            <h2 class="mt-3 text-xl font-bold text-gray-900 dark:text-white">
              {title}
            </h2>
            <p class="mt-2 flex-1 text-sm text-gray-600 dark:text-gray-400">
              {description}
            </p>
            <ul class="mt-4 space-y-1">
              {details.map((detail) => (
                <li
                  key={detail}
                  class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <span
                    class="mt-0.5 text-blue-500 dark:text-blue-400"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  {detail}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
});
