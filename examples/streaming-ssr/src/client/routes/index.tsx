import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";

/**
 * Server-side data loader for the home page.
 * In a real app this would fetch from a database or external API.
 */
export const useHomeData = routeLoader$(() => ({
  headline: "Ship faster with Scratchy",
  subline:
    "A server-first TypeScript framework combining Fastify, Qwik, and streaming SSR.",
  stats: [
    { label: "Packages", value: "8" },
    { label: "Worker Threads", value: "∞" },
    { label: "JS until interact", value: "0" },
  ],
  highlights: [
    {
      icon: "⚡",
      title: "Streaming SSR",
      description:
        "HTML arrives in ordered chunks so the browser paints critical content before the full body is ready.",
    },
    {
      icon: "🧵",
      title: "Worker Threads",
      description:
        "Piscina keeps all SSR work off the main event loop so API requests are never blocked.",
    },
    {
      icon: "🔁",
      title: "Qwik Resumability",
      description:
        "Zero hydration cost — Qwik resumes from server-serialised state without re-running components.",
    },
    {
      icon: "🔒",
      title: "Type-safe",
      description:
        "TypeScript strict mode from database schema to client components with tRPC for the API layer.",
    },
  ],
}));

/**
 * Home page — landing page with hero, stats, and feature highlights.
 * All data is loaded server-side via `routeLoader$` for immediate rendering.
 */
export default component$(() => {
  const data = useHomeData();
  const { headline, subline, stats, highlights } = data.value;

  return (
    <div>
      {/* Hero */}
      <section class="py-16 text-center sm:py-24">
        <h1 class="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl dark:text-white">
          {headline}
        </h1>
        <p class="mx-auto mt-6 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
          {subline}
        </p>
        <div class="mt-8 flex flex-wrap justify-center gap-4">
          <a
            href="/features"
            class="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
          >
            Explore Features
          </a>
          <a
            href="/docs"
            class="rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Read the Docs
          </a>
        </div>
      </section>

      {/* Stats bar */}
      <section class="rounded-xl bg-gray-50 py-8 dark:bg-gray-900">
        <dl class="mx-auto grid max-w-4xl grid-cols-3 gap-8 text-center">
          {stats.map(({ label, value }) => (
            <div key={label}>
              <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                {label}
              </dt>
              <dd class="mt-1 text-3xl font-bold text-blue-600 dark:text-blue-400">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Feature highlights */}
      <section class="mt-16">
        <h2 class="text-center text-2xl font-bold text-gray-900 dark:text-white">
          Why Scratchy?
        </h2>
        <div class="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {highlights.map(({ icon, title, description }) => (
            <div
              key={title}
              class="rounded-xl border border-gray-200 p-6 dark:border-gray-800"
            >
              <div class="text-2xl">{icon}</div>
              <h3 class="mt-3 text-lg font-semibold text-gray-900 dark:text-white">
                {title}
              </h3>
              <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
});
