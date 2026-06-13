#!/usr/bin/env bun
/**
 * audit-actions.ts — check every GitHub Action referenced in this repo's
 * workflows against the *live* latest version on GitHub, and (optionally) bump
 * them. This exists because an LLM's training data goes stale: by the time you
 * read this, `actions/checkout@v4` may be two majors behind. Never hard-code "the
 * latest version is vN" from memory — ask GitHub.
 *
 * Requires the `gh` CLI, authenticated. It reads release/tag data via the API.
 *
 *   bun audit-actions.ts            # report outdated actions (no changes)
 *   bun audit-actions.ts --fix      # rewrite workflows to the latest major tag
 *   bun audit-actions.ts --json     # machine-readable report
 *
 * Notes:
 * - Only `uses: owner/repo@ref` actions are checked. Local (`./…`) and Docker
 *   (`docker://…`) actions are skipped.
 * - `--fix` moves the *major* tag (e.g. `@v3` → `@v4`) because that's how most
 *   actions publish a moving major. A major bump CAN have breaking changes —
 *   read the action's release notes before trusting a green local run.
 * - SHA-pinned actions (`@<40-hex>`) are reported but not auto-bumped; pinning to
 *   a SHA is a security choice and bumping it needs the new SHA for the tag.
 */

async function gh(args: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  const p = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
  ]);
  return { ok: (await p.exited) === 0, out, err };
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const WORKFLOW_GLOBS = [".github/workflows", ".github/actions"];

async function workflowFiles(): Promise<string[]> {
  const files: string[] = [];
  for (const dir of WORKFLOW_GLOBS) {
    const glob = new Bun.Glob("**/*.{yml,yaml}");
    try {
      for await (const f of glob.scan({ cwd: dir, absolute: true })) files.push(f);
    } catch {
      // dir may not exist
    }
  }
  return files;
}

interface Ref {
  action: string; // owner/repo (without subpath)
  fullName: string; // owner/repo[/subpath] as written
  ref: string; // pinned ref (v4, v4.1.1, sha, main…)
  file: string;
  line: number;
  raw: string; // the full matched "uses: …" text
}

const USES_RE = /^(\s*)(?:-\s*)?uses:\s*['"]?([^'"#\s]+)['"]?/;

function parseUses(text: string, file: string): Ref[] {
  const refs: Ref[] = [];
  text.split("\n").forEach((line, i) => {
    const m = line.match(USES_RE);
    if (!m) return;
    const spec = m[2];
    if (spec.startsWith("./") || spec.startsWith("docker://")) return;
    const at = spec.lastIndexOf("@");
    if (at < 0) return;
    const fullName = spec.slice(0, at);
    const ref = spec.slice(at + 1);
    const action = fullName.split("/").slice(0, 2).join("/");
    refs.push({ action, fullName, ref, file, line: i + 1, raw: line.trim() });
  });
  return refs;
}

function isSha(ref: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(ref);
}
function majorOf(ref: string): number | null {
  const m = ref.match(/^v?(\d+)/);
  return m ? Number(m[1]) : null;
}

const cache = new Map<string, { latestTag: string | null; latestMajor: string | null }>();

/** Resolve the newest release tag and the highest moving major tag (e.g. "v5"). */
async function latestFor(action: string) {
  if (cache.has(action)) return cache.get(action)!;
  let latestTag: string | null = null;

  const rel = await gh(["api", `repos/${action}/releases/latest`, "--jq", ".tag_name"]);
  if (rel.ok && rel.out.trim()) latestTag = rel.out.trim();

  // Tags give us the moving major (v5) and a fallback when there are no releases.
  const tagsRes = await gh(["api", `repos/${action}/tags?per_page=100`, "--jq", ".[].name"]);
  const tags = tagsRes.ok ? tagsRes.out.split("\n").filter(Boolean) : [];
  if (!latestTag && tags.length) {
    // Highest semver-ish tag.
    latestTag =
      tags
        .filter((t) => /^v?\d+(\.\d+)*$/.test(t))
        .sort((a, b) => cmpSemver(a, b))
        .pop() ?? null;
  }
  // The moving major tag is the one matching the latest release's major (vN).
  let latestMajor: string | null = null;
  const maj = latestTag ? majorOf(latestTag) : null;
  if (maj != null) {
    const moving = `v${maj}`;
    latestMajor = tags.includes(moving) ? moving : latestTag;
  }
  const result = { latestTag, latestMajor };
  cache.set(action, result);
  return result;
}

function cmpSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

async function main() {
  const files = await workflowFiles();
  if (files.length === 0) {
    console.log("No workflow files found under .github/workflows or .github/actions.");
    return;
  }

  const allRefs: Ref[] = [];
  const contents = new Map<string, string>();
  for (const f of files) {
    const text = await Bun.file(f).text();
    contents.set(f, text);
    allRefs.push(...parseUses(text, f));
  }

  const uniqueActions = [...new Set(allRefs.map((r) => r.action))];
  const latest = new Map<string, { latestTag: string | null; latestMajor: string | null }>();
  await Promise.all(
    uniqueActions.map(async (a) => {
      latest.set(a, await latestFor(a));
    }),
  );

  interface Row {
    fullName: string;
    ref: string;
    latestMajor: string | null;
    latestTag: string | null;
    file: string;
    line: number;
    state: "current" | "outdated" | "sha" | "unknown";
  }
  const rows: Row[] = allRefs.map((r) => {
    const info = latest.get(r.action)!;
    let state: Row["state"] = "unknown";
    if (isSha(r.ref)) state = "sha";
    else if (info.latestMajor && majorOf(r.ref) != null && majorOf(info.latestMajor) != null) {
      state = majorOf(r.ref)! < majorOf(info.latestMajor)! ? "outdated" : "current";
    }
    return {
      fullName: r.fullName,
      ref: r.ref,
      latestMajor: info.latestMajor,
      latestTag: info.latestTag,
      file: r.file.replace(`${process.cwd()}/`, ""),
      line: r.line,
      state,
    };
  });

  if (flag("json")) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  const icon = { current: "✅", outdated: "⬆️", sha: "📌", unknown: "❓" };
  console.log(`\nGitHub Actions version audit (${rows.length} references):\n`);
  for (const r of rows) {
    const loc = `${r.file}:${r.line}`;
    const latestLabel = r.latestMajor ?? r.latestTag ?? "?";
    const note =
      r.state === "outdated"
        ? `  → bump @${r.ref} to @${r.latestMajor} (latest release ${r.latestTag})`
        : r.state === "sha"
          ? `  (SHA-pinned; latest release ${r.latestTag})`
          : r.state === "unknown"
            ? `  (could not compare; latest ${latestLabel})`
            : `  (latest release ${r.latestTag})`;
    console.log(`  ${icon[r.state]} ${r.fullName}@${r.ref}${note}`);
    console.log(`      ${loc}`);
  }

  const outdated = rows.filter((r) => r.state === "outdated");
  console.log(
    `\n${outdated.length} outdated, ${rows.filter((r) => r.state === "sha").length} SHA-pinned, ${rows.filter((r) => r.state === "current").length} current.`,
  );

  if (outdated.length && !flag("fix")) {
    console.log(`\nRun with --fix to bump outdated actions to their latest major tag.`);
    console.log(`⚠️  Major bumps may have breaking changes — read each action's release notes.`);
  }

  if (flag("fix") && outdated.length) {
    // Rewrite each file, replacing `owner/repo@oldref` with `owner/repo@latestMajor`.
    const byFile = new Map<string, Row[]>();
    for (const r of outdated) (byFile.get(r.file) ?? byFile.set(r.file, []).get(r.file)!).push(r);
    for (const [relFile, rs] of byFile) {
      const abs = `${process.cwd()}/${relFile}`;
      let text = contents.get(abs) ?? (await Bun.file(abs).text());
      for (const r of rs) {
        const from = `${r.fullName}@${r.ref}`;
        const to = `${r.fullName}@${r.latestMajor}`;
        text = text.split(from).join(to);
      }
      await Bun.write(abs, text);
      console.log(
        `✏️  ${relFile}: ${rs.map((r) => `${r.fullName} ${r.ref}→${r.latestMajor}`).join(", ")}`,
      );
    }
    console.log(`\nBumped ${outdated.length} action(s). Review the diff and test before pushing.`);
  }
}

main();
