// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// GitHub Pages project site: https://huyz0.github.io/ztui/
// (override `site`/`base` here if you later attach a custom domain.)
export default defineConfig({
  site: "https://huyz0.github.io",
  base: "/ztui",
  integrations: [
    starlight({
      title: "ztui",
      description:
        "A declarative, React-based Text User Interface framework for TypeScript and Bun — terminal and browser-canvas backends from one widget tree.",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/huyz0/ztui" }],
      editLink: { baseUrl: "https://github.com/huyz0/ztui/edit/main/site/" },
      lastUpdated: true,
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "" },
            { label: "Installation", slug: "getting-started/installation" },
            { label: "Quick Start", slug: "getting-started/quick-start" },
          ],
        },
        {
          label: "Guides",
          items: [{ label: "Architecture", slug: "guides/architecture" }],
        },
        // Widgets, React binding, Recipes, Reference are added in later phases.
      ],
    }),
  ],
});
