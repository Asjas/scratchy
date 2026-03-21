import { Slot, component$ } from "@builder.io/qwik";

/**
 * Root layout component wrapping every page in the starter example.
 * Provides the shared navigation header and footer.
 */
export default component$(() => {
  return (
    <div class="flex min-h-screen flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header class="border-b border-gray-200 dark:border-gray-800">
        <nav class="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <a
            href="/"
            class="text-primary-600 dark:text-primary-400 text-xl font-bold"
          >
            Scratchy
          </a>
          <ul class="flex gap-6 text-sm font-medium">
            <li>
              <a
                href="/"
                class="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                Home
              </a>
            </li>
          </ul>
        </nav>
      </header>
      <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Slot />
      </main>
      <footer class="border-t border-gray-200 py-6 text-center text-sm text-gray-500 dark:border-gray-800">
        Built with Scratchy
      </footer>
    </div>
  );
});
