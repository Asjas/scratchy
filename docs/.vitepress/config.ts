import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Scratchy.js Framework",
  description:
    "Full-stack TypeScript framework — server-first, worker-based rendering, type-safe end-to-end",
  lang: "en-US",

  appearance: true,

  head: [],

  themeConfig: {
    siteTitle: "Scratchy.js Framework",

    search: {
      provider: "local",
    },

    nav: [
      { text: "Docs", link: "/getting-started" },
      { text: "Changelog", link: "/changelog" },
      { text: "Releases", link: "/releases" },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/Asjas/scratchyjs" },
    ],

    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "Getting Started", link: "/getting-started" },
          { text: "Project Structure", link: "/project-structure" },
          { text: "Architecture", link: "/architecture" },
        ],
      },
      {
        text: "Server & API",
        items: [
          { text: "API Design", link: "/api-design" },
          { text: "Middleware", link: "/middleware" },
          { text: "Error Handling", link: "/error-handling" },
        ],
      },
      {
        text: "Data",
        items: [
          { text: "Data Layer", link: "/data-layer" },
          { text: "Data Loading", link: "/data-loading" },
          { text: "Sessions", link: "/sessions" },
        ],
      },
      {
        text: "Rendering & Streaming",
        items: [
          { text: "Rendering", link: "/rendering" },
          { text: "Streaming", link: "/streaming" },
          { text: "Worker Communication", link: "/worker-communication" },
        ],
      },
      {
        text: "Forms & Actions",
        items: [{ text: "Forms & Actions", link: "/forms-and-actions" }],
      },
      {
        text: "Security",
        items: [{ text: "Security", link: "/security" }],
      },
      {
        text: "Testing & Tooling",
        items: [
          { text: "Testing", link: "/testing" },
          { text: "CLI", link: "/cli" },
        ],
      },
      {
        text: "Background & Design",
        items: [
          { text: "Nitro Inspiration", link: "/nitro-inspiration" },
          { text: "References", link: "/references" },
        ],
      },
    ],
  },

  markdown: {
    lineNumbers: true,
  },
});
