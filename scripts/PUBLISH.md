# Publishing OPC

`scripts/publish.mjs` builds `dist/` and publishes OPC in one of three modes.
Pick by what stage you're at:

| Mode | When to use | Version shape | Side effects |
|---|---|---|---|
| `local` | Install/verify on **this machine** before any real release. | `v0.1.0-dev1`, `-dev2`, … | registers a local marketplace; no git, no push |
| `branch` | First real distribution — self-contained tree on a git branch. | `v0.1.0-1`, `-2`, … | force-pushes a `release` branch + tag |
| `tarball` | Canonical release — GitHub Release with a versioned tarball asset. | `v0.1.0-1`, `-2`, … | git tag + GitHub Release (needs `gh auth login`) |

> `dist/` is gitignored, so `claude plugin marketplace add <github-repo>` on the
> default branch gets **no** built artifacts. `local` reads dist from disk;
> `branch` and `tarball` are how you ship dist to consumers.

## Quick start

```shell
# 1. Build + register locally, then install & verify (no git side effects):
node scripts/publish.mjs local
claude plugin install opc
claude plugin install opc/official-kits
# restart Claude Code → /opc-status, /mcp, send a dev task

# 2. Once verified, ship a release branch:
node scripts/publish.mjs branch

# 3. …or a canonical GitHub Release tarball:
node scripts/publish.mjs tarball
```

## Modes in detail

### `local` — build + register from disk

```shell
node scripts/publish.mjs local [--scope user|project|local] [--no-build]
```

- Runs `pnpm build` (unless `--no-build`), then
  `claude plugin marketplace add <repo-path> --scope <scope>`.
- Removes any prior marketplace registration of the same name first, so it's
  safe to re-run after every code change.
- Bumps a local counter at `.opc/publish-local-counter`; version markers are
  `v0.1.0-dev{n}` and **never** pushed to git.
- After it prints, install the plugins and verify (see "Verification" below).

### `branch` — dist committed on a `release` branch

```shell
node scripts/publish.mjs branch [--branch release] [--repo owner/name] [--base 0.1.0]
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
  claude plugin install opc/official-kits
  ```

  If you'd rather keep `main` as default, use `tarball` mode instead.

### `tarball` — GitHub Release asset

```shell
node scripts/publish.mjs tarball [--repo owner/name] [--base 0.1.0]
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
  claude plugin install opc/official-kits
  ```

## Common options

| Option | Applies to | Meaning |
|---|---|---|
| `--no-build` | all | skip `pnpm build`, use current `dist/` |
| `--dry-run` | all | print what would happen, run no side-effects |
| `--marketplace <name>` | local | registered marketplace name (default `opc-marketplace`) |
| `--scope <scope>` | local | install scope: `user` (default) / `project` / `local` |
| `--repo <owner/name>` | branch, tarball | override auto-detected GitHub repo |
| `--branch <name>` | branch | release branch name (default `release`) |
| `--base <ver>` | all | base version (default `0.1.0`) |

## Version numbering

- **local**: `v0.1.0-dev1`, `v0.1.0-dev2`, … — counter in
  `.opc/publish-local-counter`; also respects any existing `-devN` git tags so
  numbers never collide. Never pushed.
- **branch / tarball**: `v0.1.0-1`, `v0.1.0-2`, … — `n` is
  `1 + max(existing v0.1.0-N tag)`, scanned across local + remote tags.

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
