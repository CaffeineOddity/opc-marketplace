# Publishing OPC

`scripts/publish.mjs` builds `dist/` and publishes OPC in one of four modes.
Pick by what stage you're at:

| Mode | When to use | Version shape | Side effects |
|---|---|---|---|
| `local` | Install/verify on **this machine** before any real release. | `v{version}-dev{build_number}` | registers a local marketplace; bumps `build_number`; no git, no push |
| `branch` | First real distribution — self-contained tree on a git branch. | `v{version}` | force-pushes a `release` branch + tag |
| `tarball` | Canonical release — GitHub Release with a versioned tarball asset. | `v{version}` | git tag + GitHub Release (needs `gh auth login`) |
| `uninstall` | Tear down to test the install/uninstall cycle repeatedly. | — | removes plugins + marketplace registration |

> Version shapes come from `scripts/version.json` (`{ version, build_number }`),
> committed to git — the single source of truth. See "Version numbering" below.
>
> `dist/` is gitignored, so `claude plugin marketplace add <github-repo>` on the
> default branch gets **no** built artifacts. `local` reads dist from disk;
> `branch` and `tarball` are how you ship dist to consumers.

## Quick start

```shell
# 1. Build + register locally, then install & verify (no git side effects):
node scripts/publish.mjs local
claude plugin install opc
claude plugin install opc-official-kits
# restart Claude Code → /opc-status, /mcp, send a dev task

# 2. Once verified, ship a release branch:
node scripts/publish.mjs branch

# 3. …or a canonical GitHub Release tarball:
node scripts/publish.mjs tarball
```

## Modes in detail

### `local` — build + register from disk

```shell
node scripts/publish.mjs local [--scope user|project|local] [--no-build] [--no-register] [--up <part>]
```

- Runs `pnpm build` (unless `--no-build`), then
  `claude plugin marketplace add <repo-path> --scope <scope>`.
- Removes any prior marketplace registration of the same name first, so it's
  safe to re-run after every code change.
- Bumps `build_number` in `scripts/version.json` (committed) after a successful
  build. `--no-build` reuses the existing dist and does **not** bump (a bump
  corresponds to a fresh build). `--no-register` builds + bumps + updates the
  latest pointer but skips `claude plugin marketplace add` (used by
  `redeploy.sh build`).
- After it prints, install the plugins and verify (see "Verification" below).
  Plugins are copied to `~/.claude/plugins/cache/` at install time, so **every
  code change requires a fresh `publish.mjs local` + reinstall** to take effect:

  ```shell
  node scripts/publish.mjs local
  claude plugin install opc
  claude plugin install opc-official-kits
  # restart Claude Code
  ```

### `uninstall` — tear down for re-testing

```shell
node scripts/publish.mjs uninstall [--marketplace opc-marketplace]
```

- Runs `claude plugin uninstall opc` and `claude plugin uninstall opc-official-kits`
  (ignores "not installed" — safe to run when already removed).
- Then `claude plugin marketplace remove <name>`.
- No build, no version bump. Use it to test the install/uninstall cycle
  repeatedly. **Restart Claude Code afterward** so the hook and MCP servers
  actually unload.
- Re-install with `local` mode (see above).

### `branch` — dist committed on a `release` branch

```shell
node scripts/publish.mjs branch [--branch release] [--repo owner/name] [--up <part>]
```

- Requires a clean working tree (commit/stash first).
- Creates/resets a `release` branch from your current branch, force-adds `dist/`
  + `marketplace.json`, commits, tags `v0.1.0-{n}`, and `--force` pushes both.
- Returns you to your original branch afterward.
- ⚠️ `claude plugin marketplace add` clones a repo's **default** branch only —
  there is no `--branch` flag. So to consume the `release` branch you must set
  it as the repo's default branch on GitHub (Settings → Branches), then:

  ```shell
  claude plugin marketplace add CaffeineOddity/opc-marketplace
  claude plugin install opc
  claude plugin install opc-official-kits
  ```

  If you'd rather keep `main` as default, use `tarball` mode instead.

### `tarball` — GitHub Release asset

```shell
node scripts/publish.mjs tarball [--repo owner/name] [--up <part>]
```

- Requires a clean working tree **and** `gh auth login`.
- Stages a self-contained tree (`.claude-plugin/marketplace.json` + `dist/`),
  packs it into `opc-marketplace-v0.1.0-{n}.tar.gz`, pushes a git tag
  `v0.1.0-{n}`, and creates a GitHub Release (targeting `main`) with the
  tarball attached.
- Consumers install from the asset URL the script prints:

  ```shell
  claude plugin marketplace add https://github.com/CaffeineOddity/opc-marketplace/releases/download/v0.1.0-1/opc-marketplace-v0.1.0-1.tar.gz
  claude plugin install opc
  claude plugin install opc-official-kits
  ```

## Common options

| Option | Applies to | Meaning |
|---|---|---|
| `--no-build` | all | skip `pnpm build`, use current `dist/` (local mode: no `build_number` bump) |
| `--no-register` | local | build + bump + update latest pointer, but skip `claude plugin marketplace add` |
| `--up <part>` | all | bump `version` segment (`major`/`minor`/`patch`; lower segments reset to 0) and reset `build_number=0` before computing the tag |
| `--dry-run` | all | print what would happen, run no side-effects |
| `--marketplace <name>` | local | registered marketplace name (default `opc-marketplace`) |
| `--scope <scope>` | local | install scope: `user` (default) / `project` / `local` |
| `--repo <owner/name>` | branch, tarball | override auto-detected GitHub repo |
| `--branch <name>` | branch | release branch name (default `release`) |

## Version numbering

`scripts/version.json` (`{ version, build_number }`), committed to git, is the
single source of truth. `scripts/version.mjs` owns all reads/writes.

- **local (dev)**: `v{version}-dev{build_number+1}`. After a successful build,
  `build_number` is written back as `build_number+1`. Never pushed as a git tag.
  `--no-build` reuses the existing dist and does **not** bump.
- **branch / tarball (release)**: `v{version}`. `build_number` is unchanged.
- **`--up <part>`**: bumps `version` (lower segments reset to 0) and resets
  `build_number=0`, before computing the tag. Works with any mode.
- **collision guard**: if the computed tag already exists, the script errors
  out — bump with `--up`.

### Bumping the version

```shell
node scripts/publish.mjs local --up patch     # 0.1.0 → 0.1.1, build_number=0, then dev build (v0.1.1-dev1)
node scripts/publish.mjs local --up minor     # 0.1.0 → 0.2.0, then dev build
node scripts/publish.mjs tarball --up minor   # 0.1.0 → 0.2.0, then release (v0.2.0)
```

## Verification checklist (after installing)

In a **fresh project directory** (not the repo itself):

1. `/opc-status` renders a health snapshot → confirms `opc-status` CLI +
   state-server MCP are up.
2. `/mcp` lists `opc-state-server`, `opc-knowledge-server`,
   `opc-reflection-server` → confirms all three MCP servers started.
3. Send a dev-flavored message like `帮我加个登录功能` → the UserPromptSubmit
   hook should inject the "先调 opc_flow_query" nudge (quiet mode triggers on
   keywords + active flow).
4. Walk the auth example in `doc/feature/04-e2e/01-walkthrough/` end-to-end
   and compare against the ~27-call tally in `E2E-REGRESSION.md`.

If anything fails, fix the code, re-run `node scripts/publish.mjs local`, and
re-install.
