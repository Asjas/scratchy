import { component$, useSignal } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";

/**
 * Server-side data loader for the contact page.
 */
export const useContactData = routeLoader$(() => ({
  email: "hello@scratchyjs.com",
  github: "https://github.com/Asjas/scratchyjs",
  discord: "https://discord.gg/scratchy",
  channels: [
    {
      icon: "📧",
      label: "Email",
      value: "hello@scratchyjs.com",
      href: "mailto:hello@scratchyjs.com",
      description: "For general enquiries and partnership discussions.",
    },
    {
      icon: "🐙",
      label: "GitHub",
      value: "github.com/Asjas/scratchyjs",
      href: "https://github.com/Asjas/scratchyjs",
      description: "Bug reports, feature requests, and pull requests.",
    },
    {
      icon: "💬",
      label: "Discord",
      value: "discord.gg/scratchy",
      href: "https://discord.gg/scratchy",
      description: "Community discussion, help, and announcements.",
    },
  ],
}));

/**
 * Contact page — contact channels and a feedback form.
 * The form is client-side only (no server action in this example).
 */
export default component$(() => {
  const data = useContactData();
  const { channels } = data.value;

  const submitted = useSignal(false);
  const name = useSignal("");
  const email = useSignal("");
  const message = useSignal("");

  return (
    <div>
      {/* Page header */}
      <section class="mb-10">
        <h1 class="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
          Contact
        </h1>
        <p class="mt-3 text-lg text-gray-600 dark:text-gray-400">
          Have a question, idea, or just want to say hi? We would love to hear
          from you.
        </p>
      </section>

      <div class="grid grid-cols-1 gap-10 lg:grid-cols-2">
        {/* Contact channels */}
        <section>
          <h2 class="mb-6 text-xl font-bold text-gray-900 dark:text-white">
            Reach us on
          </h2>
          <ul class="space-y-4">
            {channels.map(({ icon, label, value, href, description }) => (
              <li key={label}>
                <a
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel={
                    href.startsWith("http") ? "noopener noreferrer" : undefined
                  }
                  class="flex items-start gap-4 rounded-xl border border-gray-200 p-5 transition-shadow hover:shadow-md dark:border-gray-800 dark:hover:shadow-gray-900"
                >
                  <span class="text-2xl">{icon}</span>
                  <div>
                    <p class="font-semibold text-gray-900 dark:text-white">
                      {label}
                    </p>
                    <p class="text-sm text-blue-600 dark:text-blue-400">
                      {value}
                    </p>
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-500">
                      {description}
                    </p>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>

        {/* Feedback form */}
        <section>
          <h2 class="mb-6 text-xl font-bold text-gray-900 dark:text-white">
            Send a message
          </h2>

          {submitted.value ? (
            <div class="rounded-xl border border-green-200 bg-green-50 p-6 text-center dark:border-green-800 dark:bg-green-900/20">
              <div class="mb-2 text-3xl">🎉</div>
              <p class="font-semibold text-green-800 dark:text-green-300">
                Message sent!
              </p>
              <p class="mt-1 text-sm text-green-700 dark:text-green-400">
                Thanks for reaching out. We'll get back to you soon.
              </p>
            </div>
          ) : (
            <form
              class="space-y-4"
              preventdefault:submit
              onSubmit$={() => {
                submitted.value = true;
              }}
            >
              <div>
                <label
                  for="name"
                  class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name.value}
                  onInput$={(_, el) => (name.value = el.value)}
                  class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label
                  for="email"
                  class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email.value}
                  onInput$={(_, el) => (email.value = el.value)}
                  class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label
                  for="message"
                  class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Message
                </label>
                <textarea
                  id="message"
                  required
                  rows={5}
                  value={message.value}
                  onInput$={(_, el) => (message.value = el.value)}
                  class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  placeholder="Tell us what's on your mind…"
                />
              </div>
              <button
                type="submit"
                class="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
              >
                Send message
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
});
