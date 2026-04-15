# Creating a new release

This project uses **[release-it](https://github.com/release-it/release-it)** with **[@release-it/conventional-changelog](https://github.com/release-it/conventional-changelog)**. One command bumps the semver in `package.json`, updates `CHANGELOG.md` from your git history, commits, tags, pushes, and opens or creates a **GitHub Release** (when authenticated).

The app’s visible version (About screen, Settings, window title, packaged metadata) always comes from **`package.json` → `version`**. After a release bump, rebuild or run the app so the UI shows the new version.

**Tooling note:** We keep **release-it v20** on the latest line. `@release-it/conventional-changelog` v10 still declares a peer range of `release-it@^18 || ^19`, which `npm ci` would otherwise reject. The repo root [`.npmrc`](.npmrc) sets `legacy-peer-deps=true` only so npm relaxes **peer** resolution for that mismatch (direct dependency versions are unchanged). Remove that setting once a changelog plugin release supports `release-it@^20`.

## Before you start

1. **Working tree clean** — Commit or stash everything. `release-it` is configured with `git.requireCleanWorkingDir: true`.
2. **Branch** — Work from `main` (or your release branch), merged and up to date with `origin`.
3. **Commits** — For a useful changelog, use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.). The changelog plugin uses the **angular** preset.
4. **GitHub** — For automated releases (not only the browser fallback):
   - Install and authenticate the [GitHub CLI](https://cli.github.com/): `gh auth login`, **or**
   - Export a `GITHUB_TOKEN` with `repo` scope in your shell for that session.

## Create a new version

```bash
npm run release
```

1. `release-it` runs **`npm run build`** first (`before:init` hook). Fix any failures before continuing.
2. Choose the next version when prompted (**patch**, **minor**, or **major** per [semver](https://semver.org/)).
3. Confirm the proposed steps. `release-it` will:
   - Bump `version` in `package.json` (and the root `version` field in `package-lock.json` when applicable),
   - Regenerate **`CHANGELOG.md`** from commits since the last tag,
   - Commit with message `chore: release vX.Y.Z`,
   - Create an annotated git tag **`vX.Y.Z`**,
   - Push the commit and tag to `origin`,
   - Create or draft the **GitHub Release** (body from the changelog section).

The app is **not** published to npm (`npm.publish: false`). To ship macOS installers locally after tagging, use:

```bash
npm run dist        # or dist:arm / dist:intel
```

Artifacts are written under the **`release/`** directory (see `electron-builder` config in `package.json`).

## Dry run

To see what would happen without changing anything (still runs a real `npm run build` from the hook):

```bash
npm run release:dry
```

If you must dry-run with uncommitted changes (not recommended for a real release):

```bash
npm run release:dry -- --git.requireCleanWorkingDir=false
```

## CI after you tag

Pushing a tag matching **`v*.*.*`** runs [`.github/workflows/release.yml`](.github/workflows/release.yml): `npm ci` and **`npm run build`** on Ubuntu. That validates the tagged tree; it does **not** run `electron-builder` (no signing setup in CI by default).

## Troubleshooting

| Issue | What to do |
|--------|------------|
| `Working dir must be clean` | Commit or stash, then run `npm run release` again. |
| GitHub release falls back to a browser URL | Set `GITHUB_TOKEN` or run `gh auth login`. |
| Empty or sparse changelog | Use conventional prefixes on commits; merge meaningful work before releasing. |
| Build fails in `before:init` | Run `npm run build` locally, fix errors, then retry `npm run release`. |

## Configuration reference

- **npm / CI installs:** [`.npmrc`](.npmrc) — `legacy-peer-deps` for release-it 20 + conventional-changelog peer (see note above).
- **release-it config:** [`.release-it.json`](.release-it.json)
- **Changelog file:** [`CHANGELOG.md`](CHANGELOG.md)
- **Version in the UI:** injected at build from `package.json` — see [`vite.config.ts`](vite.config.ts) and [`src/constants/appVersion.ts`](src/constants/appVersion.ts)
