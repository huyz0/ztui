import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

// 2. Test Coverage Enforcements
const coverageSummaryPath = join(process.cwd(), "coverage/coverage-summary.json");
if (existsSync(coverageSummaryPath)) {
  try {
    const rawData = readFileSync(coverageSummaryPath, "utf-8");
    const summary = JSON.parse(rawData);
    const total = summary.total;

    const checks = [
      { name: "Statements", actual: total.statements.pct, threshold: 90 },
      { name: "Lines", actual: total.lines.pct, threshold: 90 },
      { name: "Functions", actual: total.functions.pct, threshold: 90 },
      { name: "Branches", actual: total.branches.pct, threshold: 80 },
    ];

    let coveragePass = true;
    for (const check of checks) {
      if (check.actual < check.threshold) {
        console.log(
          `❌ Coverage ${check.name}: FAIL (${check.actual}% / Min: ${check.threshold}%)`,
        );
        coveragePass = false;
        overallPass = false;
      } else {
        console.log(
          `✅ Coverage ${check.name}: PASS (${check.actual}% / Min: ${check.threshold}%)`,
        );
      }
    }
  } catch (err: any) {
    console.log("❌ Coverage: FAIL (Error reading coverage-summary.json)");
    console.log(`   - Details: ${err.message}`);
    overallPass = false;
  }
} else {
  console.log("❌ Coverage: FAIL (coverage/coverage-summary.json not found)");
  console.log(
    "   - Please run the test runner to generate the coverage report first: 'bun run test'",
  );
  overallPass = false;
}

console.log("==================================================");
if (overallPass) {
  console.log("🎉 STATUS: PASS");
  process.exit(0);
} else {
  console.log("❌ STATUS: FAIL (Please fix the errors above before committing or finalizing)");
  process.exit(1);
}
