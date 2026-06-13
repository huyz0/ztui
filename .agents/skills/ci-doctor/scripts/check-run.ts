#!/usr/bin/env bun
/**
 * check-run.ts — inspect the status of GitHub Actions workflow runs and, for
 * failures, surface the *failed step logs* with a first-pass diagnosis. The goal
 * is to give an LLM everything it needs to fix CI without a human reading the
 * Actions UI: which job failed, the exact error lines, and a hint at the class
 * of failure.
 *
 * Requires the `gh` CLI, authenticated (`gh auth status`). It shells out to gh
 * rather than re-implementing GitHub auth.
 *
 *   bun check-run.ts                      # latest run on the current branch
 *   bun check-run.ts --branch main        # latest run on a branch
 *   bun check-run.ts --workflow docs.yml  # latest run of one workflow
 *   bun check-run.ts --run 123456789      # a specific run id
 *   bun check-run.ts --watch              # poll until the latest run finishes
 *   bun check-run.ts --limit 5            # list the last N runs (summary only)
 */

type Json = any;

async function gh(args: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  const p = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
  ]);
  const code = await p.exited;
  return { ok: code === 0, out, err };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

/** Known failure signatures → a short diagnosis + suggested fix direction. */
const SIGNATURES: { re: RegExp; label: string; fix: string }[] = [
  {
    re: /Ensure GitHub Pages has been enabled|Get Pages site failed|Not Found.*pages/i,
    label: "GitHub Pages not enabled",
    fix: "Enable Pages with Actions as the source: `gh api repos/{owner}/{repo}/pages -X POST -f build_type=workflow` (needs repo admin), or add an `actions/configure-pages@v5` step with `enablement: true`. Settings → Pages → Source: GitHub Actions does the same by hand.",
  },
  {
    re: /lockfile had changes|frozen-lockfile|lockfile is out of date|Cannot install with frozen|--frozen-lockfile/i,
    label: "Lockfile drift",
    fix: "The committed lockfile doesn't match the manifest. Re-run the install locally without --frozen-lockfile, commit the updated lockfile, and push.",
  },
  {
    // Keep this specific: a bare "Not Found"/404 is usually a *resource* problem
    // (e.g. Pages not enabled), not a permissions one — match the phrases CI
    // actually emits for auth failures.
    re: /Resource not accessible by integration|Permission(?: to .+)? denied|HTTP 403|status: 403|refusing to allow (?:an OAuth App|a GitHub App|a Personal Access Token)|insufficient (?:permission|scope)/i,
    label: "Insufficient token permissions",
    fix: "Add the needed `permissions:` block to the job/workflow (e.g. `contents: write`, `pages: write`, `id-token: write`). The default GITHUB_TOKEN is read-only on many repos.",
  },
  {
    re: /This request has been automatically failed because it uses a deprecated version|deprecated.*set-output|Node\.js 1[026].*actions|automatically failed/i,
    label: "Deprecated action / runtime",
    fix: "An action version is deprecated. Run audit-actions.ts and bump to the latest major (read its changelog for breaking changes).",
  },
  {
    re: /Cannot find module|Module not found|cannot find package|ERR_MODULE_NOT_FOUND|Cannot find type definition/i,
    label: "Missing dependency / unresolved import",
    fix: "A dependency or type package isn't installed in the CI environment. Check it's in the right package.json and that the install step runs in the right working directory.",
  },
  {
    re: /error TS\d+|Type '.*' is not assignable|tsc --noEmit/i,
    label: "TypeScript type error",
    fix: "A type error fails the build. Reproduce locally with the same tsconfig and fix the types.",
  },
  {
    re: /\d+ (failed|failing)|Tests:.*failed|FAIL |AssertionError|✗ /i,
    label: "Test failure",
    fix: "Tests fail in CI. Reproduce locally; if it passes locally but fails in CI, suspect environment (timezone, FS case, headless, parallelism, network).",
  },
  {
    // Word-boundary the acronyms so they don't match inside unrelated tokens;
    // require concrete network signatures, not the bare word "network".
    re: /\bENOTFOUND\b|\bETIMEDOUT\b|\bECONNRESET\b|getaddrinfo|socket hang up|rate limit exceeded|HTTP 429|status: 429/i,
    label: "Network / transient",
    fix: "Likely transient (network, registry, rate limit). Re-run the job; if it recurs, add retries or caching.",
  },
];

function diagnose(log: string): { label: string; fix: string }[] {
  const hits = SIGNATURES.filter((s) => s.re.test(log)).map((s) => ({
    label: s.label,
    fix: s.fix,
  }));
  return hits.length ? hits : [];
}

/** Trim a long log to the most useful tail (errors cluster at the end). */
function tail(log: string, lines = 60): string {
  const all = log.split("\n").filter((l) => l.trim().length > 0);
  return all.slice(-lines).join("\n");
}

async function repoSlug(): Promise<string> {
  const r = await gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
  return r.out.trim();
}

async function listRuns(limit: number) {
  const wf = arg("workflow");
  const branch = arg("branch");
  const args = [
    "run",
    "list",
    "--limit",
    String(limit),
    "--json",
    "databaseId,displayTitle,workflowName,headBranch,status,conclusion,createdAt,event",
  ];
  if (wf) args.push("--workflow", wf);
  if (branch) args.push("--branch", branch);
  const r = await gh(args);
  if (!r.ok) {
    console.error(`gh run list failed:\n${r.err}`);
    process.exit(1);
  }
  return JSON.parse(r.out) as Json[];
}

async function runDetail(id: number) {
  const r = await gh([
    "run",
    "view",
    String(id),
    "--json",
    "databaseId,displayTitle,workflowName,headBranch,status,conclusion,url,jobs",
  ]);
  if (!r.ok) {
    console.error(`gh run view failed:\n${r.err}`);
    process.exit(1);
  }
  return JSON.parse(r.out) as Json;
}

function emoji(conclusion: string | null, status: string): string {
  if (status !== "completed") return "⏳";
  return (
    { success: "✅", failure: "❌", cancelled: "🚫", skipped: "⏭️", neutral: "➖" }[
      conclusion ?? ""
    ] ?? "❓"
  );
}

async function report(id: number) {
  const run = await runDetail(id);
  const slug = await repoSlug();
  console.log(`\n${emoji(run.conclusion, run.status)} ${run.workflowName} — ${run.displayTitle}`);
  console.log(
    `   branch: ${run.headBranch}   status: ${run.status}   conclusion: ${run.conclusion ?? "—"}`,
  );
  console.log(`   ${run.url}\n`);

  for (const job of run.jobs ?? []) {
    const e = emoji(job.conclusion, job.status);
    console.log(`  ${e} job: ${job.name} (${job.conclusion ?? job.status})`);
    const failedSteps = (job.steps ?? []).filter((s: Json) => s.conclusion === "failure");
    for (const s of failedSteps) console.log(`       ↳ failed step: ${s.name}`);
  }

  if (run.conclusion === "failure") {
    console.log(`\n──────── failed step logs ────────`);
    const logRes = await gh(["run", "view", String(id), "--log-failed"]);
    const log = logRes.ok ? logRes.out : logRes.err;
    if (log.trim()) {
      console.log(tail(log));
      const dx = diagnose(log);
      if (dx.length) {
        console.log(`\n──────── diagnosis ────────`);
        for (const d of dx) console.log(`• ${d.label}\n  → ${d.fix}`);
      } else {
        console.log(
          `\n(No known signature matched. Read the logs above; the error is usually in the last ~20 lines.)`,
        );
      }
    } else {
      console.log(`(No failed-step logs returned. Open ${run.url} for the full log.)`);
    }
    console.log(`\nRepo: ${slug}. Re-run after a fix with: gh run rerun ${id}`);
  }
  return run;
}

async function latestRunId(): Promise<number> {
  // listRuns already honors --branch / --workflow; with no filter, gh returns the
  // most recent run for the repo (newest first).
  const runs = await listRuns(1);
  if (runs.length === 0) {
    console.error("No workflow runs found for the given filters.");
    process.exit(1);
  }
  return runs[0].databaseId;
}

async function main() {
  const runId = arg("run");

  if (arg("limit") && !flag("watch") && !runId) {
    const runs = await listRuns(Number(arg("limit")));
    console.log(`\nLast ${runs.length} runs:\n`);
    for (const r of runs) {
      console.log(
        `  ${emoji(r.conclusion, r.status)} #${r.databaseId}  ${r.workflowName.padEnd(28)} ${r.headBranch.padEnd(16)} ${r.conclusion ?? r.status}  — ${r.displayTitle}`,
      );
    }
    console.log(`\nInspect one with: bun check-run.ts --run <id>`);
    return;
  }

  const id = runId ? Number(runId) : await latestRunId();

  if (flag("watch")) {
    process.stdout.write("Watching run until it completes");
    for (;;) {
      const run = await runDetail(id);
      if (run.status === "completed") {
        process.stdout.write("\n");
        break;
      }
      process.stdout.write(".");
      await Bun.sleep(10_000);
    }
  }

  await report(id);
}

main();
