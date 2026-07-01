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
 *            ideal for install/verification before a real release. Dev tag:
 *            v{version}-dev{build_number} (build_number bumped after success).
 *
 *   branch   Build dist/, force-commit dist/ onto a dedicated `release`
 *            branch, push it. `claude plugin marketplace add
 *            CaffeineOddity/opc-marketplace` (pointed at the release branch)
 *            then clones a self-contained tree. Release tag: v{version}.
 *
 *   tarball  Build dist/, pack dist/ + manifest into a versioned tarball,
 *            attach it to a GitHub Release (tag v{version}). `claude plugin
 *            marketplace add <tarball-url>` installs from the asset.
 *            Requires `gh auth login`. Release tag: v{version}.
 *
 *   uninstall Remove opc + opc-official-kits plugins and the marketplace
 *            registration. Use to test the install/uninstall cycle
 *            repeatedly. No build, no version bump.
 *
 * Options:
 *   --no-build        Skip the `pnpm build` step (use current dist/). For
 *                     `local` mode this also skips the build_number bump — a
 *                     bump corresponds to a fresh build.
 *   --no-register     `local` mode only: build + bump + update the latest
 *                     pointer, but skip `claude plugin marketplace add`.
 *                     Used by redeploy.sh `build` to avoid touching claude.
 *   --dry-run         Print what would happen; don't run side-effects.
 *   --up <part>       Bump the version segment (major|minor|patch; lower
 *                     segments reset to 0) and reset build_number to 0 BEFORE
 *                     computing the tag. Works with any mode.
 *   --marketplace <name>  Marketplace name as registered locally (default:
 *                     opc-marketplace). Used by `local` mode.
 *   --scope <scope>   Install scope for `local` mode: user|project|local
 *                     (default: user).
 *   --repo <owner/name>   GitHub repo for `branch`/`tarball` (default read
 *                     from git remote origin).
 *   --branch <name>   Release branch name for `branch` mode (default: release).
 *
 * Version numbering — `scripts/version.json` ({ version, build_number }) is the
 * single source of truth (committed to git):
 *   - local (dev):     v{version}-dev{build_number+1}; build_number is written
 *                      back as build_number+1 after a successful build. Never
 *                      pushed as a git tag.
 *   - branch/tarball:  v{version} (release; build_number unchanged).
 *   - --up <part>:     bumps `version`, resets build_number to 0.
 *   - collision guard: if the computed tag already exists, error out (bump
 *                      with `--up`).
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
import { readVersion, writeVersion, bumpBase, computeTag, tagExists } from "./version.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST = join(ROOT, "dist");
const MANIFEST = join(ROOT, ".claude-plugin", "marketplace.json");
// Tarball staging lives under dist/.stage/ (dist/ is gitignored) so no stray
// top-level bookkeeping dir is created. Version state lives in
// scripts/version.json (committed) — see version.mjs.
const STAGE_DIR = join(DIST, ".stage");

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
  console.error(readUsage());
  process.exit(args.length === 0 ? 1 : 0);
}

const mode = args[0];
const VALID_MODES = new Set(["local", "branch", "tarball", "uninstall"]);
if (!VALID_MODES.has(mode)) {
  console.error(`✗ unknown mode "${mode}". Valid: local | branch | tarball | uninstall`);
  process.exit(1);
}

const opts = parseOpts(args.slice(1));
const DRY = opts["dry-run"] === true;
const NO_BUILD = opts["no-build"] === true;
const NO_REGISTER = opts["no-register"] === true;
const MARKETPLACE = opts["marketplace"] ?? "opc-marketplace";
const SCOPE = opts["scope"] ?? "user";
const RELEASE_BRANCH = opts["branch"] ?? "release";
const UP = opts["up"]; // major | minor | patch | undefined
if (UP !== undefined && !["major", "minor", "patch"].includes(UP)) {
  console.error(`✗ --up must be one of major|minor|patch (got "${UP}")`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseOpts(rest) {
  const o = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (key === "dry-run" || key === "no-build" || key === "no-register") {
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
  const r = spawnSync(cmd, cmdArgs, {
    stdio: opts2.silent ? "pipe" : "inherit",
    cwd: ROOT,
    env: opts2.env ?? process.env,
  });
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

/**
 * Resolve the release tag (and, for local dev builds, the build_number to write
 * back). scripts/version.json is the single source of truth (see version.mjs).
 *   --up <part> bumps `version` (lower segments reset) + resets build_number=0
 *   BEFORE computing the tag. Returns { tag, nextBuild, state }.
 */
function resolveVersion() {
  let state = readVersion();
  if (UP) {
    state = { version: bumpBase(state.version, UP), build_number: 0 };
    writeVersion(state, DRY);
    console.log(`→ bumped base ${UP}: version → ${state.version}, build_number reset to 0`);
  }
  const { tag, nextBuild } = computeTag(mode, state, NO_BUILD);
  return { tag, nextBuild, state };
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

function buildDist(version) {
  console.log(`→ Building dist/${version}/ (OPC_RELEASE_VERSION=${version} pnpm build)`);
  if (NO_BUILD) {
    if (!existsSync(join(DIST, version, "plugins", "opc", "mcp", "opc-state-server", "dist", "server.js"))) {
      throw new Error(`--no-build given but dist/${version}/ does not exist. Run without it first.`);
    }
    console.log(`  (--no-build) using existing dist/${version}/`);
    return;
  }
  if (DRY) {
    console.log(`  [dry-run] OPC_RELEASE_VERSION=${version} pnpm build`);
    console.log(`  [dry-run] (would verify dist/${version}/plugins/opc/mcp/opc-state-server/dist/server.js exists)`);
    return;
  }
  try {
    // Pass the version via env so build-release.mjs outputs under dist/<version>/.
    run("pnpm", ["build"], { env: { ...process.env, OPC_RELEASE_VERSION: version } });
  } catch (e) {
    console.error("✗ build failed");
    console.error(e.message);
    process.exit(2);
  }
  if (!existsSync(join(DIST, version, "plugins", "opc", "mcp", "opc-state-server", "dist", "server.js"))) {
    throw new Error(`build finished but dist/${version}/plugins/opc/mcp/opc-state-server/dist/server.js missing`);
  }
  console.log(`✓ dist/${version}/ built`);
}

/** Rewrite the root .claude-plugin/marketplace.json so its plugin `source`
 *  paths point at dist/<version>/plugins/<name>. This is the "latest" pointer.
 *  The version dir itself also carries a self-contained marketplace.json (written
 *  by build-release.mjs) for tarball/path consumers. */
function updateLatestPointer(version) {
  if (DRY) {
    console.log(`  [dry-run] rewrite ${MANIFEST} → _latest=${version}, sources → ./dist/${version}/plugins/*`);
    return;
  }
  const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
  m._latest = version;
  for (const p of m.plugins) {
    const short = p.name === "opc" ? "opc" : "official-kits";
    p.source = `./dist/${version}/plugins/${short}`;
  }
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + "\n", "utf8");
  console.log(`✓ root marketplace.json now points at dist/${version}/`);
}

// ---------------------------------------------------------------------------
// Mode: local
// ---------------------------------------------------------------------------

async function publishLocal(tag) {
  if (NO_REGISTER) {
    console.log(`→ --no-register: skipping marketplace registration (build + pointer only)`);
    console.log(`✓ dist/${tag}/ built, latest pointer updated. No claude changes.`);
    return;
  }
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

  console.log("");
  console.log("✓ Local marketplace registered.");
  console.log("");
  console.log("Next: install the plugins and verify:");
  console.log("");
  console.log("  claude plugin install opc");
  console.log("  claude plugin install opc-official-kits");
  console.log("  # restart Claude Code, then in a new project:");
  console.log("  #   /opc-status          → renders health snapshot (state-server up)");
  console.log("  #   /mcp                  → opc-state / opc-knowledge / opc-reflection listed");
  console.log('  #   send "帮我加个登录功能" → hook should inject the OPC nudge');
  console.log("");
  console.log(`Local version: ${tag}  (dir: dist/${tag}/, latest pointer: dist/${tag}/)`);
  console.log("  To re-publish after a code change: node scripts/publish.mjs local");
}

// ---------------------------------------------------------------------------
// Mode: branch  (commit dist/ onto a `release` branch, push)
// ---------------------------------------------------------------------------

async function publishBranch(tag) {
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
  console.log("    claude plugin install opc-official-kits");
  console.log("");
  console.log("Pinning an OLD version (release branch keeps only the latest dist/<ver>/,");
  console.log("but every release is tagged):");
  console.log(`    git clone --branch ${tag} https://github.com/${repo}.git /tmp/opc-${tag}`);
  console.log(`    claude plugin marketplace add /tmp/opc-${tag}`);
  console.log("");
  console.log(`Version tag: ${tag}  (branch: ${RELEASE_BRANCH}, latest dir: dist/${tag}/)`);
}

// ---------------------------------------------------------------------------
// Mode: tarball  (pack dist/, GitHub Release asset)
// ---------------------------------------------------------------------------

async function publishTarball(tag) {
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

  // The version dir dist/<tag>/ is already a self-contained tree (marketplace.json
  // + plugins/ + mcp/, written by build-release.mjs). Stage a copy so the
  // tarball root, when extracted, IS the marketplace root.
  const versionDir = join(DIST, tag);
  const stage = join(STAGE_DIR, tag);
  if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });

  console.log("→ Staging self-contained release tree (from dist/<version>/)");
  if (!DRY) {
    // Copy the version dir's *contents* into stage so stage = marketplace root.
    cpSync(versionDir, stage, { recursive: true });
  } else {
    console.log(`  [dry-run] copy ${versionDir}/ → ${stage}/`);
  }

  const tarName = `opc-marketplace-${tag}.tar.gz`;
  const tarPath = join(STAGE_DIR, tarName);
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
  console.log("  claude plugin install opc-official-kits");
  console.log("");
  console.log(`Version tag: ${tag}`);
  console.log(`Release:     https://github.com/${repo}/releases/tag/${tag}`);
}

// ---------------------------------------------------------------------------
// Mode: uninstall  (remove opc + opc-official-kits plugins + the marketplace)
// ---------------------------------------------------------------------------

/** Remove a plugin via `claude plugin uninstall`. Silent unless it was actually
 *  installed and got removed — "not installed" is the common case on a fresh
 *  machine, so we don't print anything for it (the claude CLI would otherwise
 *  emit a red ✘ line that reads like a failure). Returns true if removed. */
function uninstallPlugin(name) {
  if (DRY) {
    console.log(`  [dry-run] claude plugin uninstall ${name}`);
    return false;
  }
  // pipe (not inherit) so claude's own ✘ "not found" output stays quiet.
  const r = spawnSync("claude", ["plugin", "uninstall", name], {
    stdio: "pipe",
    cwd: ROOT,
  });
  if (r.status === 0) {
    console.log(`  ✓ uninstalled ${name}`);
    return true;
  }
  // non-zero ⇒ wasn't installed — silent (no noisy ✘, no "skipped" line).
  return false;
}

/** Remove the marketplace registration. Silent unless it was actually
 *  registered and got removed — same reasoning as uninstallPlugin().
 *  Returns true if removed. */
function uninstallMarketplace(name) {
  if (DRY) {
    console.log(`  [dry-run] claude plugin marketplace remove ${name}`);
    return false;
  }
  const r = spawnSync("claude", ["plugin", "marketplace", "remove", name], {
    stdio: "pipe",
    cwd: ROOT,
  });
  if (r.status === 0) {
    console.log(`  ✓ removed marketplace ${name}`);
    return true;
  }
  // non-zero ⇒ wasn't registered — silent.
  return false;
}

async function publishUninstall() {
  console.log("→ Uninstalling OPC plugins");
  let removedAny = false;
  removedAny = uninstallPlugin("opc") || removedAny;
  removedAny = uninstallPlugin("opc-official-kits") || removedAny;
  // Legacy installs (pre-rename) used the slash-namespaced id; clean those up too.
  removedAny = uninstallPlugin("opc/official-kits") || removedAny;

  console.log("");
  console.log(`→ Removing marketplace "${MARKETPLACE}"`);
  removedAny = uninstallMarketplace(MARKETPLACE) || removedAny;

  console.log("");
  if (removedAny) {
    console.log("✓ OPC fully uninstalled.");
    console.log("");
    console.log("To re-install after a fresh publish:");
    console.log("");
    console.log("  node scripts/publish.mjs local        # build + register");
    console.log("  claude plugin install opc");
    console.log("  claude plugin install opc-official-kits");
    console.log("  # restart Claude Code");
    console.log("");
    console.log("Note: restart Claude Code so the hook/MCP servers actually unload.");
  } else {
    console.log("✓ Nothing to uninstall (OPC was not installed).");
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

(async () => {
  console.log(`publish mode: ${mode}${DRY ? "  (dry-run)" : ""}`);

  // uninstall needs no build / version / latest-pointer update.
  if (mode === "uninstall") {
    try {
      await publishUninstall();
    } catch (e) {
      console.error("✗ uninstall failed:", e.message);
      process.exit(3);
    }
    return;
  }

  const { tag, nextBuild, state } = resolveVersion();
  if (tagExists(tag)) {
    console.error(`✗ tag ${tag} already exists — bump version.json first: --up <major|minor|patch>`);
    process.exit(1);
  }
  console.log(`version: ${tag}`);
  buildDist(tag);
  updateLatestPointer(tag);
  // A build_number bump corresponds to a fresh local build. --no-build (and
  // release modes) do not bump — re-registering an existing dist must not
  // consume a number.
  if (mode === "local" && !NO_BUILD && nextBuild !== null) {
    writeVersion({ version: state.version, build_number: nextBuild }, DRY);
  }
  try {
    if (mode === "local") await publishLocal(tag);
    else if (mode === "branch") await publishBranch(tag);
    else if (mode === "tarball") await publishTarball(tag);
  } catch (e) {
    console.error("✗ publish failed:", e.message);
    process.exit(3);
  }
})();
