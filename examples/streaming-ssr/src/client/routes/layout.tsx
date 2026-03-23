import { Slot, component$ } from "@builder.io/qwik";
import { useLocation } from "@builder.io/qwik-city";

/**
 * Root layout wrapping every page in the streaming-ssr example.
 * Provides the shared navigation header and footer.
 *
 * The active nav link is highlighted based on the current URL path.
 */
export default component$(() => {
  const loc = useLocation();

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/about", label: "About" },
    { href: "/features", label: "Features" },
    { href: "/blog", label: "Blog" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <div class="flex min-h-screen flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header class="border-b border-gray-200 dark:border-gray-800">
        <nav class="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <a
            href="/"
            class="flex items-center gap-2 text-xl font-bold text-blue-600 dark:text-blue-400"
          >
            <span aria-hidden="true">⚡</span>
            Scratchy
          </a>
          <ul class="flex gap-1 text-sm font-medium sm:gap-4">
            {navLinks.map(({ href, label }) => {
              const isActive =
                href === "/"
                  ? loc.url.pathname === "/"
                  : loc.url.pathname.startsWith(href);
              return (
                <li key={href}>
                  <a
                    href={href}
                    class={
                      isActive
                        ? "rounded-md bg-blue-50 px-3 py-2 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                    }
                  >
                    {label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Slot />
      </main>
      <footer class="border-t border-gray-200 py-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-500">
        Built with{" "}
        <a
          href="https://scratchyjs.com"
          class="text-blue-600 hover:underline dark:text-blue-400"
          target="_blank"
          rel="noopener noreferrer"
        >
          Scratchy
        </a>{" "}
        — streaming SSR example
      </footer>
    </div>
  );
});
