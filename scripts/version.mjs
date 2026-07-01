#!/usr/bin/env node
/**
 * version.mjs — single source of truth for OPC release versioning.
 *
 * `scripts/version.json` ({ version, build_number }) is committed to git and is
 * the ONLY place release version state lives. publish.mjs imports these pure
 * helpers; redeploy.sh delegates to publish.mjs (no duplicated bash logic).
 *
 * Tag shapes (unchanged from the legacy scheme):
 *   dev (local mode):     v{version}-dev{build_number}      (or +1 for a fresh build)
 *   release (branch/tar): v{version}
 *
 * Mirrors shipcli's bump_version / build-config semantics:
 *   --up <major|minor|patch> bumps the segment (lower segments reset to 0) and
 *   resets build_number to 0.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION_FILE = resolve(__dirname, "version.json");

const VALID_PARTS = new Set(["major", "minor", "patch"]);

/** Read { version, build_number } from scripts/version.json. Throws on missing/malformed. */
export function readVersion() {
  if (!existsSync(VERSION_FILE)) {
    throw new Error(`version file not found: ${VERSION_FILE}`);
  }
  let data;
  try {
    data = JSON.parse(readFileSync(VERSION_FILE, "utf8"));
  } catch (e) {
    throw new Error(`version.json is malformed: ${e.message}`);
  }
  if (typeof data.version !== "string" || !/^\d+\.\d+\.\d+$/.test(data.version)) {
    throw new Error(`version.json "version" must be a three-part semver (got "${data.version}")`);
  }
  if (!Number.isInteger(data.build_number)) {
    throw new Error(`version.json "build_number" must be an integer (got ${data.build_number})`);
  }
  return { version: data.version, build_number: data.build_number };
}

/** Write { version, build_number } back to version.json. dry=true → print only. */
export function writeVersion(state, dry = false) {
  const payload = JSON.stringify(state, null, 2) + "\n";
  if (dry) {
    console.log(`  [dry-run] write version.json → ${JSON.stringify(state)}`);
    return;
  }
  writeFileSync(VERSION_FILE, payload, "utf8");
}

/**
 * Bump one segment of a semver string (lower segments reset to 0).
 * Mirrors shipcli.builder.bump_version.
 */
export function bumpBase(version, part) {
  if (!VALID_PARTS.has(part)) {
    throw new Error(`--up must be one of major|minor|patch (got "${part}")`);
  }
  const segments = version.split(".");
  if (segments.length !== 3 || !segments.every((s) => /^\d+$/.test(s))) {
    throw new Error(`version is not a three-part semver: ${version}`);
  }
  let [major, minor, patch] = segments.map((s) => parseInt(s, 10));
  if (part === "major") [major, minor, patch] = [major + 1, 0, 0];
  else if (part === "minor") [minor, patch] = [minor + 1, 0];
  else patch += 1;
  return `${major}.${minor}.${patch}`;
}

/**
 * Compute the release tag for a publish mode.
 *   local + noBuild  → v{version}-dev{build_number}        (reuse current dist)
 *   local (build)    → v{version}-dev{build_number + 1}    (nextBuild returned)
 *   branch / tarball → v{version}                          (nextBuild = null)
 */
export function computeTag(mode, state, noBuild = false) {
  if (mode === "local") {
    if (noBuild) {
      return { tag: `v${state.version}-dev${state.build_number}`, nextBuild: null };
    }
    const nextBuild = state.build_number + 1;
    return { tag: `v${state.version}-dev${nextBuild}`, nextBuild };
  }
  // branch / tarball are release modes.
  return { tag: `v${state.version}`, nextBuild: null };
}

/** True if `tag` already exists as a local git tag. */
export function tagExists(tag) {
  const r = spawnSync("git", ["tag", "-l", tag], { stdio: "pipe", encoding: "utf8" });
  if (r.status !== 0) return false;
  return r.stdout.trim().split("\n").filter(Boolean).includes(tag);
}
