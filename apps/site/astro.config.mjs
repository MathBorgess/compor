import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://compor.mathai.com.br",
  output: "static",
  compressHTML: true,
  build: {
    inlineStylesheets: "never",
  },
  integrations: [sitemap()],
});
