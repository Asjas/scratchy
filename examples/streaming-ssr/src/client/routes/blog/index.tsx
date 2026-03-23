import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";

/**
 * Server-side data loader for the blog listing page.
 * In a real application these posts would be fetched from a database.
 */
export const useBlogPosts = routeLoader$(() => ({
  posts: [
    {
      id: "streaming-ssr-deep-dive",
      title: "A Deep Dive into Streaming SSR",
      excerpt:
        "Learn how chunked transfer encoding lets the browser paint above-the-fold content before the full response arrives — and why it matters for Core Web Vitals.",
      publishedAt: "2025-01-15",
      author: "A-J Roos",
      readingTime: "8 min read",
      tags: ["SSR", "Performance", "HTTP"],
    },
    {
      id: "worker-threads-piscina",
      title: "Worker Threads with Piscina",
      excerpt:
        "Offload CPU-intensive SSR work from the main event loop with a Piscina worker pool, prevent request queuing, and keep your API routes snappy under heavy load.",
      publishedAt: "2025-02-03",
      author: "A-J Roos",
      readingTime: "6 min read",
      tags: ["Node.js", "Worker Threads", "Piscina"],
    },
    {
      id: "qwik-resumability",
      title: "Qwik Resumability vs Hydration",
      excerpt:
        "Why resumability ships zero JavaScript until the user interacts, how it differs from partial hydration, and why it pairs perfectly with streaming SSR.",
      publishedAt: "2025-02-20",
      author: "A-J Roos",
      readingTime: "10 min read",
      tags: ["Qwik", "Performance", "JavaScript"],
    },
    {
      id: "fastify-performance",
      title: "Fastify Performance Tips",
      excerpt:
        "Schema validation, response serialisation, and route hook patterns that keep your Fastify server at peak throughput — even under sustained high concurrency.",
      publishedAt: "2025-03-01",
      author: "A-J Roos",
      readingTime: "7 min read",
      tags: ["Fastify", "Performance", "Node.js"],
    },
    {
      id: "drizzle-type-safe-queries",
      title: "Type-safe Queries with Drizzle ORM",
      excerpt:
        "How Drizzle's SQL-first approach gives you fully-typed queries, inferred return types, and zero magic — plus prepared statements scoped at module level for peak performance.",
      publishedAt: "2025-03-12",
      author: "A-J Roos",
      readingTime: "9 min read",
      tags: ["Drizzle", "TypeScript", "PostgreSQL"],
    },
  ],
}));

/**
 * Blog listing page — shows all articles with metadata.
 */
export default component$(() => {
  const data = useBlogPosts();
  const { posts } = data.value;

  return (
    <div>
      {/* Page header */}
      <section class="mb-10">
        <h1 class="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
          Blog
        </h1>
        <p class="mt-3 text-lg text-gray-600 dark:text-gray-400">
          Articles on building fast, type-safe server-rendered applications with
          Scratchy.
        </p>
      </section>

      {/* Post list */}
      <ul class="space-y-6">
        {posts.map((post) => (
          <li key={post.id}>
            <article class="rounded-xl border border-gray-200 p-6 transition-shadow hover:shadow-md dark:border-gray-800 dark:hover:shadow-gray-900">
              {/* Tags */}
              <div class="mb-3 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    class="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Title */}
              <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                <a
                  href={`/blog/${post.id}`}
                  class="hover:text-blue-600 dark:hover:text-blue-400"
                >
                  {post.title}
                </a>
              </h2>

              {/* Excerpt */}
              <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {post.excerpt}
              </p>

              {/* Meta */}
              <div class="mt-4 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500">
                <span>{post.author}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={post.publishedAt}>{post.publishedAt}</time>
                <span aria-hidden="true">·</span>
                <span>{post.readingTime}</span>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
});
