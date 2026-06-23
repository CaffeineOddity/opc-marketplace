#!/usr/bin/env node
/**
 * scripts/publish.mjs — build dist/ and publish OPC in one of three modes.
 *
 * Usage:
 *   node scripts/publish.mjs <mode> [options]
 *
 * Modes:
 *   local    Build dist/, then register the marketplace from the local repo
 *            path so `claude plugin install opc` works from disk. Fastest;
 *            ideal for install/verification before a real release. Version
 *            tag: v0.1.0-dev{n} (n auto-increments).
 *
 *   branch   Build dist/, force-commit dist/ onto a dedicated `release`
 *            branch, push it. `claude plugin marketplace add
 *            CaffeineOddity/opc-marketplace` (pointed at the release branch)
 *            then clones a self-contained tree. Version tag: v0.1.0{n}.
 *
 *   tarball  Build dist/, pack dist/ + manifest into a versioned tarball,
 *            attach it to a GitHub Release (tag v0.1.0{n}). `claude plugin
 *            marketplace add <tarball-url>` installs from the asset.
 *            Requires `gh auth login`. Version tag: v0.1.0{n}.
 *
 * Options:
 *   --no-build        Skip the `pnpm build` step (use current dist/).
 *   --dry-run         Print what would happen; don't run side-effects.
 *   --marketplace <name>  Marketplace name as registered locally (default:
 *                     opc-marketplace). Used by `local` mode.
 *   --scope <scope>   Install scope for `local` mode: user|project|local
 *                     (default: user).
 *   --repo <owner/name>   GitHub repo for `branch`/`tarball` (default read
 *                     from git remote origin).
 *   --branch <name>   Release branch name for `branch` mode (default: release).
 *   --base <ver>      Base version (default: 0.1.0). Mode suffix differs:
 *                     local → -dev{n}; branch/tarball → {n}.
 *
 * Version numbering:
 *   - local:     v0.1.0-dev1, v0.1.0-dev2, ... (never pushed; local only)
 *   - branch:    v0.1.0-1, v0.1.0-2, ...        (tag on release branch)
 *   - tarball:   v0.1.0-1, v0.1.0-2, ...        (git tag + GitHub Release)
 *   n is 1 + the highest existing n of that mode's shape, scanned across git
 *   tags (and, for `local`, a counter file at .opc/publish-local-counter).
 *
 * Exit codes: 0 success; 1 usage/env error; 2 build failed; 3 publish failed.
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST = join(ROOT, "dist");
const OPC_DIR = join(ROOT, ".opc");
const COUNTER_FILE = join(OPC_DIR, "publish-local-counter");

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
  console.error(readUsage());
  process.exit(args.length === 0 ? 1 : 0);
}

const mode = args[0];
const VALID_MODES = new Set(["local", "branch", "tarball"]);
if (!VALID_MODES.has(mode)) {
  console.error(`✗ unknown mode "${mode}". Valid: local | branch | tarball`);
  process.exit(1);
}

const opts = parseOpts(args.slice(1));
const DRY = opts["dry-run"] === true;
const NO_BUILD = opts["no-build"] === true;
const MARKETPLACE = opts["marketplace"] ?? "opc-marketplace";
const SCOPE = opts["scope"] ?? "user";
const RELEASE_BRANCH = opts["branch"] ?? "release";
const BASE = opts["base"] ?? "0.1.0";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseOpts(rest) {
  const o = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (key === "dry-run" || key === "no-build") {
        o[key] = true;
      } else {
        o[key] = rest[++i];
      }
    }
  }
  return o;
}

function readUsage() {
  return readFileSync(join(__dirname, "PUBLISH.md"), "utf8");
}

/** Run a command, inherit stdio, throw on non-zero exit. */
function run(cmd, cmdArgs, opts2 = {}) {
  if (DRY) {
    console.log(`  [dry-run] ${cmd} ${cmdArgs.join(" ")}`);
    return "";
  }
  const r = spawnSync(cmd, cmdArgs, { stdio: opts2.silent ? "pipe" : "inherit", cwd: ROOT });
  if (r.status !== 0) {
    throw new Error(`command failed (${cmd} ${cmdArgs.join(" ")}): exit ${r.status}`);
  }
  return r.stdout?.toString?.() ?? "";
}

function runCapture(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { stdio: "pipe", cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`command failed (${cmd} ${cmdArgs.join(" ")}): ${r.stderr}`);
  }
  return r.stdout.trim();
}

/** Git remote origin → "owner/name", or null. */
function detectRepo() {
  try {
    const url = runCapture("git", ["config", "--get", "remote.origin.url"]);
    // ssh: git@github.com:owner/name.git  or  https://github.com/owner/name.git
    const m = url.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** List existing git tags (local + remote refs). */
function existingTags() {
  const set = new Set();
  try {
    set.add(runCapture("git", ["tag", "-l"]));
  } catch {
    /* ignore */
  }
  try {
    // remote tag refs look like: <sha>\trefs/tags/<name>; strip deref (^{}) too
    const remote = runCapture("git", ["ls-remote", "--tags", "origin"]);
    for (const line of remote.split("\n")) {
      const m = line.match(/refs\/tags\/([^^]+)$/);
      if (m) set.add(m[1]);
    }
  } catch {
    /* no remote — local-only is fine */
  }
  return [...set].filter(Boolean);
}

/**
 * Compute next version number for the given mode.
 *   local:   v{BASE}-dev{n}    — n from counter file (or highest -dev tag +1)
 *   branch:  v{BASE}-{n}       — n from highest v{BASE}-{n} tag +1
 *   tarball: v{BASE}-{n}       — n from highest v{BASE}-{n} tag +1
 */
function nextVersion(mode) {
  const tags = existingTags();
  if (mode === "local") {
    let n = 0;
    if (existsSync(COUNTER_FILE)) {
      n = parseInt(readFileSync(COUNTER_FILE, "utf8").trim(), 10) || 0;
    }
    // also honor any -dev tags so we never collide
    for (const t of tags) {
      const m = t.match(new RegExp(`^v${escapeReg(BASE)}-dev(\\d+)$`));
      if (m) n = Math.max(n, parseInt(m[1], 10));
    }
    n += 1;
    return { tag: `v${BASE}-dev${n}`, n };
  }
  // branch / tarball share the v{BASE}-{n} shape
  let n = 0;
  for (const t of tags) {
    const m = t.match(new RegExp(`^v${escapeReg(BASE)}-(\\d+)$`));
    if (m) n = Math.max(n, parseInt(m[1], 10));
  }
  n += 1;
  return { tag: `v${BASE}-${n}`, n };
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bumpLocalCounter(n) {
  if (DRY) return;
  if (!existsSync(OPC_DIR)) mkdirSync(OPC_DIR, { recursive: true });
  writeFileSync(COUNTER_FILE, String(n), "utf8");
}

function assertCleanTree() {
  if (DRY) return; // dry-run never mutates; allow a dirty tree
  const status = runCapture("git", ["status", "--porcelain"]);
  if (status) {
    throw new Error(
      `working tree not clean:\n${status}\nCommit or stash first. (branch/tarball modes require a clean tree.)`,
    );
  }
}

function assertOnBranch(expected) {
  const cur = runCapture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (cur !== expected) {
    throw new Error(`expected to be on branch "${expected}", but on "${cur}"`);
  }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function buildDist() {
  console.log("→ Building dist/ (pnpm build)");
  if (NO_BUILD) {
    if (!existsSync(DIST)) {
      throw new Error("--no-build given but dist/ does not exist. Run without it first.");
    }
    console.log("  (--no-build) using existing dist/");
    return;
  }
  try {
    run("pnpm", ["build"]);
  } catch (e) {
    console.error("✗ build failed");
    console.error(e.message);
    process.exit(2);
  }
  if (!existsSync(join(DIST, "mcp", "opc-state-server", "dist", "server.js"))) {
    throw new Error("build finished but dist/mcp/opc-state-server/dist/server.js missing");
  }
  console.log("✓ dist/ built");
}

// ---------------------------------------------------------------------------
// Mode: local
// ---------------------------------------------------------------------------

async function publishLocal(tag, n) {
  const scopeFlag = SCOPE ? ["--scope", SCOPE] : [];
  console.log(`→ Registering marketplace "${MARKETPLACE}" from local path (scope=${SCOPE})`);

  // Remove a prior registration of the same name (ignore error if absent).
  if (!DRY) {
    spawnSync("claude", ["plugin", "marketplace", "remove", MARKETPLACE], {
      stdio: "ignore",
      cwd: ROOT,
    });
    const r = spawnSync(
      "claude",
      ["plugin", "marketplace", "add", ROOT, ...scopeFlag],
      { stdio: "inherit", cwd: ROOT },
    );
    if (r.status !== 0) throw new Error("claude plugin marketplace add failed");
  } else {
    console.log(`  [dry-run] claude plugin marketplace add ${ROOT} --scope ${SCOPE}`);
  }

  bumpLocalCounter(n);
  console.log("");
  console.log("✓ Local marketplace registered.");
  console.log("");
  console.log("Next: install the plugins and verify:");
  console.log("");
  console.log("  claude plugin install opc");
  console.log("  claude plugin install opc/official-kits");
  console.log("  # restart Claude Code, then in a new project:");
  console.log("  #   /opc-status          → renders health snapshot (state-server up)");
  console.log("  #   /mcp                  → opc-state / opc-knowledge / opc-reflection listed");
  console.log('  #   send "帮我加个登录功能" → hook should inject the OPC nudge');
  console.log("");
  console.log(`Local version marker: ${tag} (counter n=${n})`);
  console.log("  To re-publish after a code change: node scripts/publish.mjs local");
}

// ---------------------------------------------------------------------------
// Mode: branch  (commit dist/ onto a `release` branch, push)
// ---------------------------------------------------------------------------

async function publishBranch(tag, n) {
  const repo = opts["repo"] ?? detectRepo();
  if (!repo) throw new Error("could not detect GitHub repo from git remote. Pass --repo owner/name");
  const startBranch = runCapture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  assertCleanTree();

  // Create or reset the release branch from current HEAD, then add dist/.
  const existed = runCapture("git", ["branch", "--list", RELEASE_BRANCH]).trim().length > 0;
  console.log(`→ Preparing release branch "${RELEASE_BRANCH}" (existed=${existed})`);
  if (DRY) {
    console.log(`  [dry-run] git checkout -B ${RELEASE_BRANCH} ${startBranch}`);
    console.log(`  [dry-run] git add -f dist/ .claude-plugin/marketplace.json`);
    console.log(`  [dry-run] git commit  (version ${tag})`);
    console.log(`  [dry-run] git push --force origin ${RELEASE_BRANCH}`);
    console.log(`  [dry-run] git checkout ${startBranch}`);
  } else {
    run("git", ["checkout", "-B", RELEASE_BRANCH, startBranch]);
    // Force-add dist/ (it's gitignored) + manifest for self-containment.
    run("git", ["add", "-f", "dist/", ".claude-plugin/marketplace.json"]);
    run("git", ["commit", "-q", "-m", `release ${tag}: dist artifacts for marketplace install`]);
    run("git", ["tag", tag]);
    run("git", ["push", "--force", "origin", RELEASE_BRANCH]);
    try {
      run("git", ["push", "origin", tag]);
    } catch {
      console.warn(`  ! could not push tag ${tag} (may already exist remotely)`);
    }
    run("git", ["checkout", startBranch]);
  }

  console.log("");
  console.log("✓ Release branch pushed.");
  console.log("");
  console.log("Consumers install by pointing the marketplace at the release branch.");
  console.log("NOTE: `claude plugin marketplace add` clones a repo's DEFAULT branch only");
  console.log("(no --branch flag). To consume the release branch, either:");
  console.log("");
  console.log("  (a) make `release` the repo's default branch on GitHub (Settings → Branches),");
  console.log("      then:");
  console.log(`        claude plugin marketplace add ${repo}`);
  console.log("");
  console.log("  (b) or add it as a git URL — still default-branch only, but explicit:");
  console.log(`        claude plugin marketplace add https://github.com/${repo}.git`);
  console.log("");
  console.log("  then:");
  console.log("    claude plugin install opc");
  console.log("    claude plugin install opc/official-kits");
  console.log("");
  console.log(`Version tag: ${tag}  (branch: ${RELEASE_BRANCH})`);
}

// ---------------------------------------------------------------------------
// Mode: tarball  (pack dist/, GitHub Release asset)
// ---------------------------------------------------------------------------

async function publishTarball(tag, n) {
  const repo = opts["repo"] ?? detectRepo();
  if (!repo) throw new Error("could not detect GitHub repo from git remote. Pass --repo owner/name");
  assertCleanTree();

  // Verify gh is authed (skip in dry-run so the flow can be previewed).
  if (!DRY) {
    const ghStatus = spawnSync("gh", ["auth", "status"], { stdio: "pipe", encoding: "utf8" });
    if (ghStatus.status !== 0) {
      throw new Error("gh is not authenticated. Run `gh auth login` first.");
    }
  }

  // Build a self-contained staging dir: marketplace.json + dist/ (so a
  // tarball-extracted tree is directly add-able as a path marketplace,
  // and Claude Code can also fetch it via the asset URL).
  const stage = join(ROOT, ".opc", "publish-stage", tag);
  if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  mkdirSync(join(stage, ".claude-plugin"), { recursive: true });

  console.log("→ Staging self-contained release tree");
  if (!DRY) {
    cpSync(join(ROOT, ".claude-plugin", "marketplace.json"), join(stage, ".claude-plugin", "marketplace.json"));
    cpSync(DIST, join(stage, "dist"), { recursive: true });
  } else {
    console.log(`  [dry-run] copy .claude-plugin/marketplace.json + dist/ → ${stage}`);
  }

  const tarName = `opc-marketplace-${tag}.tar.gz`;
  const tarPath = join(ROOT, ".opc", "publish-stage", tarName);
  console.log(`→ Packing ${tarName}`);
  if (!DRY) {
    // tar from stage's parent so the archive root is the tag dir.
    run("tar", ["-czf", tarPath, "-C", join(stage, ".."), basename(stage)]);
  } else {
    console.log(`  [dry-run] tar -czf ${tarName} -C ... ${tag}`);
  }

  // Create a lightweight git tag (no dist commit) so the Release has a ref.
  console.log(`→ Creating git tag ${tag}`);
  if (!DRY) {
    try {
      run("git", ["tag", tag]);
    } catch {
      // tag may exist locally from a prior partial run; that's fine.
    }
    try {
      run("git", ["push", "origin", tag]);
    } catch {
      console.warn(`  ! could not push tag ${tag} (may already exist remotely)`);
    }
  }

  console.log(`→ Creating GitHub Release ${tag} with asset ${tarName}`);
  if (DRY) {
    console.log(`  [dry-run] gh release create ${tag} "${tarPath}" --title "${tag}" --notes "..."`);
  } else {
    // --target main anchors the release to the main branch HEAD.
    run("gh", [
      "release",
      "create",
      tag,
      tarPath,
      "--repo",
      repo,
      "--title",
      tag,
      "--notes",
      `OPC marketplace release ${tag}. Self-contained dist/ tree. Install via the tarball URL below.`,
      "--target",
      "main",
    ]);
  }

  const assetUrl = DRY
    ? `https://github.com/${repo}/releases/download/${tag}/${tarName}`
    : runCapture("gh", ["release", "view", tag, "--repo", repo, "--json", "assets", "-q", `.assets[] | select(.name=="${tarName}") | .url`]).trim() ||
      `https://github.com/${repo}/releases/download/${tag}/${tarName}`;

  console.log("");
  console.log("✓ Release published.");
  console.log("");
  console.log("Consumers install from the tarball asset URL:");
  console.log("");
  console.log(`  claude plugin marketplace add ${assetUrl}`);
  console.log("  claude plugin install opc");
  console.log("  claude plugin install opc/official-kits");
  console.log("");
  console.log(`Version tag: ${tag}`);
  console.log(`Release:     https://github.com/${repo}/releases/tag/${tag}`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

(async () => {
  console.log(`publish mode: ${mode}${DRY ? "  (dry-run)" : ""}`);
  buildDist();
  const { tag, n } = nextVersion(mode);
  console.log(`version: ${tag}`);
  try {
    if (mode === "local") await publishLocal(tag, n);
    else if (mode === "branch") await publishBranch(tag, n);
    else if (mode === "tarball") await publishTarball(tag, n);
  } catch (e) {
    console.error("✗ publish failed:", e.message);
    process.exit(3);
  }
})();
