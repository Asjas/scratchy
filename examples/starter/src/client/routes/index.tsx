import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";

/**
 * Load posts from the server via tRPC.
 * `routeLoader$` runs server-side during SSR and provides data to the component.
 */
export const usePosts = routeLoader$(async () => {
  // In a real app, use the tRPC client or call the DB directly here.
  return [
    {
      id: "1",
      title: "Welcome to Scratchy",
      content: "Get started by editing this page.",
    },
  ];
});

/**
 * Home page — displays a list of posts loaded server-side.
 */
export default component$(() => {
  const posts = usePosts();

  return (
    <div>
      <h1 class="mb-6 text-3xl font-bold">Posts</h1>
      <ul class="space-y-4">
        {posts.value.map((p) => (
          <li
            key={p.id}
            class="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
          >
            <h2 class="text-lg font-semibold">{p.title}</h2>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {p.content}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
});
