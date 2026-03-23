import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";

/**
 * Server-side data loader for the about page.
 */
export const useAboutData = routeLoader$(() => ({
  mission:
    "Make server-rendered web applications as fast and ergonomic as possible — without sacrificing developer experience.",
  story: `Scratchy started as a personal project to explore what a modern,
server-first Node.js framework could look like if it were designed from scratch
today. The goal: combine the raw performance of Fastify with Qwik's
zero-hydration model and a proper Worker Thread rendering pipeline.`,
  values: [
    {
      title: "Server-first",
      description:
        "Built for long-running hosted servers, not serverless cold starts. Persistent connections, warm worker pools, in-memory caches.",
    },
    {
      title: "Type-safe",
      description:
        "TypeScript strict mode throughout — from the database schema to the last client component. No `any`, no surprises.",
    },
    {
      title: "Convention over configuration",
      description:
        "Opinionated defaults so you spend time on your product, not on boilerplate setup.",
    },
    {
      title: "Open source",
      description:
        "MIT licensed. Contributions, bug reports, and feedback are always welcome.",
    },
  ],
  team: [
    {
      name: "A-J Roos",
      role: "Creator & Maintainer",
      bio: "Full-stack developer passionate about performance and developer experience.",
    },
    {
      name: "Community",
      role: "Contributors",
      bio: "Scratchy is shaped by the people who use it. Join us on GitHub.",
    },
  ],
}));

/**
 * About page — mission, story, values, and team.
 */
export default component$(() => {
  const data = useAboutData();
  const { mission, story, values, team } = data.value;

  return (
    <div>
      {/* Page header */}
      <section class="mb-12">
        <h1 class="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
          About Scratchy
        </h1>
        <p class="mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
          {mission}
        </p>
      </section>

      {/* Story */}
      <section class="mb-12">
        <h2 class="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
          Our Story
        </h2>
        <p class="max-w-3xl whitespace-pre-line text-gray-700 dark:text-gray-300">
          {story}
        </p>
      </section>

      {/* Values */}
      <section class="mb-12">
        <h2 class="mb-6 text-2xl font-bold text-gray-900 dark:text-white">
          Our Values
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {values.map(({ title, description }) => (
            <div
              key={title}
              class="rounded-xl border border-gray-200 p-5 dark:border-gray-800"
            >
              <h3 class="text-base font-semibold text-gray-900 dark:text-white">
                {title}
              </h3>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Team */}
      <section>
        <h2 class="mb-6 text-2xl font-bold text-gray-900 dark:text-white">
          Team
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {team.map(({ name, role, bio }) => (
            <div
              key={name}
              class="flex items-start gap-4 rounded-xl border border-gray-200 p-5 dark:border-gray-800"
            >
              <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                {name[0]}
              </div>
              <div>
                <p class="font-semibold text-gray-900 dark:text-white">
                  {name}
                </p>
                <p class="text-sm text-blue-600 dark:text-blue-400">{role}</p>
                <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {bio}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
});
