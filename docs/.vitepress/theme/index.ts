import GitHubReleases from "../components/GitHubReleases.vue";
import "./style.css";
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import type { App } from "vue";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }: { app: App }) {
    app.component("GitHubReleases", GitHubReleases);
  },
} satisfies Theme;
