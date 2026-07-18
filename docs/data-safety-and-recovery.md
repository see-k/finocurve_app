# Data safety and recovery

FinoCurve is designed to upgrade an existing installation without deleting or silently rewriting the user's financial records.

## Where core data lives

Electron stores its writable profile outside the application bundle in the platform `userData` directory. The exact folder name follows the installed Electron application identity:

- macOS: `~/Library/Application Support/<app name>/`
- Windows: `%APPDATA%\<app name>\`
- Linux: `~/.config/<app name>/`

Core portfolio, custom-agent, group-conversation, and assistant-chat records are stored in `finocurve-core-data.db`. The renderer's existing `localStorage` records remain in the same profile as a synchronous compatibility cache and rollback source.

Treat this directory as private financial data. Automated migration backups use owner-only permissions where the operating system supports them.

## Safe migration behavior

On startup FinoCurve:

1. Replays any renderer write-ahead journal left by an interrupted write.
2. Compares the cache's monotonic revision with the SQLite record.
3. Writes `core-data-backups/localstorage-<timestamp>-<id>.json` before reconciling differing non-empty cache data.
4. Imports all changed records in one SQLite transaction and verifies each stored value.
5. Preserves displaced equal-revision data in `core_data_conflicts` instead of discarding it.
6. Keeps the legacy browser cache; migration does not delete it.

Malformed legacy JSON is retained with a validation warning so it can be inspected or recovered. A future schema version is rejected rather than opened by older code.

Financial provenance enrichment is additive. It does not alter quantities, prices, balances, cost basis, asset IDs, or the portfolio's `updatedAt` value.

## Make a manual backup

1. Quit FinoCurve completely.
2. Copy the entire Electron `userData` directory to a protected location.
3. Keep the database and any `-wal` / `-shm` sidecar files together. Do not copy only an open database file.
4. Verify that the copied directory is non-empty before upgrading or performing manual maintenance.

This full-profile copy preserves SQLite, browser cache, encrypted configuration, reports, and automatic migration snapshots together.

## Recovery order

If data appears missing after an upgrade:

1. Quit the app and preserve a copy of the current profile before changing anything.
2. Restart once. The renderer journal and normal startup reconciliation are intentionally idempotent.
3. Inspect the newest file in `core-data-backups/`; it contains raw cache records from immediately before reconciliation.
4. Preserve `finocurve-core-data.db` and inspect `core_data_conflicts` for displaced versions.
5. Restore only from a copy of the profile, with the app closed. Do not edit the live database or delete the compatibility cache while diagnosing the issue.

There is intentionally no automatic "reset and restore" action: choosing a recovery version can discard newer edits. Until a reviewed restore UI is added, restoration should be performed from a duplicated profile by an operator who can compare revisions and timestamps.

## Release checks

`npm run verify:release` runs coverage-gated unit tests, SQLite migration/recovery tests against Electron's native ABI, the production TypeScript/Vite build, and an unsigned packaged-directory build. It does not launch Electron or access the user's live profile.
