import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

const webAnalyticsToken = (process.env.CF_WEB_ANALYTICS_TOKEN ?? "").trim();

export default defineConfig({
  site: "https://compor.mathai.com.br",
  output: "static",
  compressHTML: true,
  build: {
    inlineStylesheets: "never",
  },
  integrations: [sitemap()],
  vite: {
    define: {
      __CF_WEB_ANALYTICS_TOKEN__: JSON.stringify(webAnalyticsToken),
    },
  },
});
