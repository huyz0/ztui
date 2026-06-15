import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function collectFiles(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) {
      out.push(join((entry as any).parentPath ?? (entry as any).path ?? dir, entry.name));
    }
  }
  return out;
}

// Raw terminal control sequences (ESC in any escape form).
const ANSI_RE = /\\x1b|\\u001b|\\033|\\e\[/;
// Imports reaching into the concrete driver layer.
const DRIVER_IMPORT_RE = /from\s+["'][./]*driver\//;
// `import type { … }` is erased at compile time, so it creates no runtime layer
// coupling (madge confirms 0 cycles). Widgets legitimately import driver *types*
// like `KeyEvent`/`MouseEvent`; only a value import is a real leak.
const TYPE_ONLY_IMPORT_RE = /^\s*import\s+type\b/;

console.log("==================================================");
console.log("         ZTUI STATIC CODE REVIEW CHECKS           ");
console.log("==================================================");

let overallPass = true;

// 1. Reconciler Circular Import Check (Shift-Left Architectural Guard)
const hostConfigPath = join(process.cwd(), "src/react/host-config.ts");
if (existsSync(hostConfigPath)) {
  const content = readFileSync(hostConfigPath, "utf-8");

  // Rule: Do not import from widgets directly inside reconciler
  const hasDirectWidgetImport =
    /import\s+.*\s+from\s+["']\.\.\/widgets/i.test(content) ||
    /import\s+.*\s+from\s+["']\.\.\/react\/components/i.test(content);

  if (hasDirectWidgetImport) {
    console.log("❌ Architecture: FAIL");
    console.log("   - Circular Dependency Guard triggered!");
    console.log("   - Found direct widget imports in src/react/host-config.ts.");
    console.log("   - Reconciler must remain completely decoupled from specific widget instances.");
    console.log(
      "   - Please register components dynamically using the registerElement registry API.",
    );
    overallPass = false;
  } else {
    console.log("✅ Architecture: PASS (No direct widget imports in reconciler)");
  }
} else {
  console.log("⚠️  Architecture: SKIP (host-config.ts not found)");
}

console.log("--------------------------------------------------");

// 2. Driver-Concern Containment (Layer Leakage Guard)
//    Terminal/driver specifics (raw ANSI, concrete driver imports) must not
//    leak into the framework-neutral widget layer or the App orchestrator.
//    App may hold an abstract `Driver` and the documented `BunDriver` default,
//    but must not emit raw escapes or branch on protocol specifics.
{
  let leakPass = true;

  // 2a. Widgets must not import the driver layer.
  const widgetFiles = collectFiles(join(process.cwd(), "src/widgets"), [".ts", ".tsx"]).filter(
    (f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"),
  );
  for (const file of widgetFiles) {
    const content = readFileSync(file, "utf-8");
    for (const line of content.split("\n")) {
      if (DRIVER_IMPORT_RE.test(line) && !TYPE_ONLY_IMPORT_RE.test(line)) {
        console.log(`❌ Layer Leak: FAIL (driver value import in widget) → ${file}`);
        leakPass = false;
      }
    }
    if (ANSI_RE.test(content)) {
      console.log(`❌ Layer Leak: FAIL (raw ANSI escape in widget) → ${file}`);
      leakPass = false;
    }
  }

  // 2b. App / core orchestrator must not emit raw terminal escapes — those
  //     belong behind a Driver method (clearScreen, getGraphicClearSequence…).
  const coreFiles = collectFiles(join(process.cwd(), "src/core"), [".ts", ".tsx"]).filter(
    (f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"),
  );
  for (const file of coreFiles) {
    const content = readFileSync(file, "utf-8");
    if (ANSI_RE.test(content)) {
      console.log(`❌ Layer Leak: FAIL (raw ANSI escape in core/app) → ${file}`);
      leakPass = false;
    }
  }

  if (leakPass) {
    console.log("✅ Layer Containment: PASS (no driver concerns in widgets or app)");
  } else {
    console.log("   - Move terminal/protocol specifics into a Driver method (src/driver/*).");
    overallPass = false;
  }
}

console.log("--------------------------------------------------");

// Coverage is enforced by the vitest gate (see `coverage.thresholds` in
// vitest.config.ts, run via `bun run test`) — the single source of truth. This
// static guard deliberately does not re-check it, to avoid a second, drifting
// set of thresholds.

console.log("==================================================");
if (overallPass) {
  console.log("🎉 STATUS: PASS");
  process.exit(0);
} else {
  console.log("❌ STATUS: FAIL (Please fix the errors above before committing or finalizing)");
  process.exit(1);
}
