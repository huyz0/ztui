// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { createStarlightTypeDocPlugin } from "starlight-typedoc";

// Generate one API-reference section per public entry point from the TSDoc in
// the source. Each call returns a plugin (runs TypeDoc at build time) plus a
// sidebar group placeholder to drop into the sidebar below.
const [coreTypeDoc, coreTypeDocSidebar] = createStarlightTypeDocPlugin();
const [reactTypeDoc, reactTypeDocSidebar] = createStarlightTypeDocPlugin();

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
      logo: { src: "./src/assets/ztui-logo.svg", alt: "ztui" },
      favicon: "/favicon.svg",
      head: [
        { tag: "meta", attrs: { property: "og:image", content: "https://huyz0.github.io/ztui/og.png" } },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
        { tag: "meta", attrs: { name: "twitter:image", content: "https://huyz0.github.io/ztui/og.png" } },
      ],
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/huyz0/ztui" }],
      editLink: { baseUrl: "https://github.com/huyz0/ztui/edit/main/site/" },
      lastUpdated: true,
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "" },
            { label: "Why ztui", slug: "getting-started/why-ztui" },
            { label: "Installation", slug: "getting-started/installation" },
            { label: "Quick Start", slug: "getting-started/quick-start" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Architecture", slug: "guides/architecture" },
            { label: "Layout", slug: "guides/layout" },
            { label: "Styling", slug: "guides/styling" },
            { label: "Theming", slug: "guides/theming" },
            { label: "Focus, keys & hotkeys", slug: "guides/input" },
            { label: "Animation & graphics", slug: "guides/animation-graphics" },
            { label: "React binding", slug: "guides/react" },
            { label: "Extending ztui", slug: "guides/extending" },
            { label: "Debugging & AI agents", slug: "guides/debugging" },
          ],
        },
        {
          label: "Widgets",
          items: [
            { label: "Gallery", slug: "widgets" },
            {
              label: "Controls",
              items: [
                { label: "Button", slug: "widgets/button" },
                { label: "Input", slug: "widgets/input" },
                { label: "Checkbox", slug: "widgets/checkbox" },
                { label: "Switch", slug: "widgets/switch" },
                { label: "Select", slug: "widgets/select" },
                { label: "Slider", slug: "widgets/slider" },
                { label: "Radio Group", slug: "widgets/radio-group" },
                { label: "Toggle Button", slug: "widgets/toggle-button" },
              ],
            },
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
                { label: "Terminal View", slug: "widgets/terminal-view" },
              ],
            },
            {
              label: "Text & input",
              items: [
                { label: "Markdown", slug: "widgets/markdown" },
                { label: "Rich Text", slug: "widgets/rich-text" },
                { label: "Text Area", slug: "widgets/text-area" },
                { label: "Form", slug: "widgets/form" },
                { label: "Question / Answer", slug: "widgets/question-answer" },
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
              items: [
                { label: "Collapsible", slug: "widgets/collapsible" },
                { label: "Tabs", slug: "widgets/tabs" },
                { label: "Split View", slug: "widgets/split-view" },
                { label: "Overlays", slug: "widgets/overlays" },
                { label: "Workbench", slug: "widgets/workbench" },
              ],
            },
            {
              label: "Media",
              items: [
                { label: "Image", slug: "widgets/image" },
                { label: "HeroIcon", slug: "widgets/heroicon" },
                { label: "File Icon", slug: "widgets/file-icon" },
              ],
            },
          ],
        },
        coreTypeDocSidebar,
        reactTypeDocSidebar,
      ],
      plugins: [
        coreTypeDoc({
          entryPoints: ["../src/core.ts"],
          tsconfig: "../tsconfig.json",
          output: "api/core",
          sidebar: { label: "ztui (core)", collapsed: true },
          typeDoc: { excludeInternal: true, excludePrivate: true, excludeProtected: true },
        }),
        reactTypeDoc({
          entryPoints: ["../src/react.ts"],
          tsconfig: "../tsconfig.json",
          output: "api/react",
          sidebar: { label: "ztui/react", collapsed: true },
          typeDoc: { excludeInternal: true, excludePrivate: true, excludeProtected: true },
        }),
      ],
    }),
  ],
});
