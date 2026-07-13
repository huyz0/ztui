import type { TreeNode } from "./tree.ts";

/**
 * A plain directory-listing entry — however the caller obtained it (`fs`,
 * Bun's `Glob`, a remote API, a mock for tests). ztui's widgets stay
 * I/O-free by design, so nothing here reads the filesystem: {@link
 * buildFileTree} only shapes data the caller already has into {@link
 * TreeNode}s for `<Tree>`. For a directory whose children haven't been
 * loaded yet (lazy loading), omit `children` and set `hasChildren: true`;
 * `<Tree>`'s `onToggle` fires on expand, so the caller can fetch and merge
 * the real children in then.
 */
export interface FileEntry {
  /** Bare file/directory name, e.g. "package.json" or "src". */
  name: string;
  /** Whether this entry is a directory. */
  isDirectory: boolean;
  /** Loaded children (recurse); omit for an unloaded/lazy directory. */
  children?: FileEntry[];
  /** Force expandable even without loaded `children` (lazy directories). */
  hasChildren?: boolean;
}

/** Extension -> icon glyph, checked in order of most-specific first. */
const EXTENSION_ICONS: Record<string, string> = {
  "test.ts": "🧪",
  "test.tsx": "🧪",
  "test.js": "🧪",
  "spec.ts": "🧪",
  ts: "📘",
  tsx: "📘",
  js: "📜",
  jsx: "📜",
  mjs: "📜",
  cjs: "📜",
  json: "🔧",
  jsonc: "🔧",
  yaml: "🔧",
  yml: "🔧",
  toml: "🔧",
  md: "📝",
  mdx: "📝",
  txt: "📝",
  png: "🖼️",
  jpg: "🖼️",
  jpeg: "🖼️",
  gif: "🖼️",
  svg: "🖼️",
  webp: "🖼️",
  css: "🎨",
  scss: "🎨",
  less: "🎨",
  html: "🌐",
  sh: "⚙️",
  bash: "⚙️",
  zsh: "⚙️",
  lock: "🔒",
  env: "🔑",
  gitignore: "🚫",
};

const FILENAME_ICONS: Record<string, string> = {
  "package.json": "📦",
  "package-lock.json": "🔒",
  "bun.lockb": "🔒",
  "bun.lock": "🔒",
  dockerfile: "🐳",
  makefile: "⚙️",
  readme: "📖",
  license: "⚖️",
};

/** Icon glyph for a file/directory name, using extension and known-filename lookups. */
export function iconForEntry(name: string, isDirectory: boolean): string {
  if (isDirectory) return "📁";

  const lower = name.toLowerCase();
  const withoutLeadingDot = lower.startsWith(".") ? lower.slice(1) : lower;
  const base = withoutLeadingDot.replace(/^readme(\..*)?$/, "readme");
  if (FILENAME_ICONS[lower]) return FILENAME_ICONS[lower];
  if (FILENAME_ICONS[base]) return FILENAME_ICONS[base];

  const parts = lower.split(".");
  for (let i = 1; i < parts.length; i++) {
    const ext = parts.slice(i).join(".");
    if (EXTENSION_ICONS[ext]) return EXTENSION_ICONS[ext];
  }
  if (lower.startsWith(".")) return "⚙️";
  return "📄";
}

/**
 * Shape a directory listing into `<Tree>`-ready {@link TreeNode}s, deriving
 * each node's `id` from its path (joined by `/`) and its icon from
 * {@link iconForEntry}. Directories sort before files, then alphabetically,
 * within each level (pass already-sorted entries to skip this).
 */
export function buildFileTree(entries: FileEntry[], basePath = ""): TreeNode[] {
  const sorted = [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return sorted.map((entry) => {
    const path = basePath ? `${basePath}/${entry.name}` : entry.name;
    // A directory is expandable if the caller says so explicitly
    // (`hasChildren`), or its loaded `children` are non-empty, or it hasn't
    // been loaded at all yet (optimistic — better to show an arrow that
    // reveals nothing than to hide the ability to expand a lazy directory).
    const expandable =
      entry.isDirectory &&
      (entry.hasChildren ?? (entry.children === undefined ? true : entry.children.length > 0));
    return {
      id: path,
      label: entry.name,
      icon: iconForEntry(entry.name, entry.isDirectory),
      expandable,
      children: entry.children ? buildFileTree(entry.children, path) : undefined,
    } satisfies TreeNode;
  });
}
