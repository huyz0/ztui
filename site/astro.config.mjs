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
        {
          label: "Widgets",
          items: [
            { label: "Gallery", slug: "widgets" },
            {
              label: "Data",
              items: [
                { label: "Table", slug: "widgets/table" },
                { label: "Tree", slug: "widgets/tree" },
                { label: "List View", slug: "widgets/list-view" },
                { label: "Selection List", slug: "widgets/selection-list" },
                { label: "Sparkline", slug: "widgets/sparkline" },
                { label: "Diff", slug: "widgets/diff" },
                { label: "Rich Log", slug: "widgets/rich-log" },
              ],
            },
            {
              label: "Text & input",
              items: [
                { label: "Markdown", slug: "widgets/markdown" },
                { label: "Text Area", slug: "widgets/text-area" },
              ],
            },
            {
              label: "Feedback",
              items: [
                { label: "Status", slug: "widgets/status" },
                { label: "Waiting & Progress", slug: "widgets/waiting" },
              ],
            },
            {
              label: "Layout",
              items: [{ label: "Collapsible", slug: "widgets/collapsible" }],
            },
          ],
        },
        // React binding, Recipes, and Reference are added in later phases.
      ],
    }),
  ],
});
