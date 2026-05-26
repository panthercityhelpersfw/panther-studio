# Recovery System

Panther Studio is built so you don't lose work to a crash, a corrupt file, or an
accidental close. Three mechanisms work together: continuous autosave, rolling
backups, and crash detection.

## 1. Autosave (always on)

Every edit goes through one chokepoint that marks the project dirty and schedules
a debounced save (~1.5s). A periodic safety save (interval in Preferences,
default 20s) and a save-on-close also run. The project in IndexedDB is therefore
almost always current. See `PROJECT_MANAGEMENT.md`.

## 2. Backup snapshots

On save (throttled to ~once every 45s), a deep-cloned snapshot of the project is
written to the `backups` object store, keyed by project + timestamp. The most
recent **8 per project** are kept (older ones pruned). Backups are independent of
the live project record, so they survive even if the live record is damaged.

API (`src/persistence/db.ts`): `saveBackup`, `listBackups`, `latestBackup`.

## 3. Crash detection & recovery prompt

- On launch the app sets a **synchronous heartbeat** in `localStorage`
  (`panther.sessionOpen = "true"`). `localStorage` is used (not IndexedDB)
  because it can be written reliably during `beforeunload`.
- On a clean close, `beforeunload` sets the flag to `"false"`.
- If, on the next launch, the flag is still `"true"`, the previous session did
  **not** exit cleanly → a **Recovery prompt** appears offering to reopen the
  project that was open (from `settings.lastProjectId`), with the time of the
  latest backup shown.
- The user chooses **Recover session** (reopen, falling back to the newest backup
  if the live record won't load) or **Start fresh**.

## 4. Corruption-safe loading

`openProject` is defensive:

1. Load the project record and normalize it (filling in any missing fields from
   older versions).
2. If loading or normalization **throws**, automatically fall back to the most
   recent **backup snapshot**, restore it as the live record, and inform the user
   ("Project was corrupted — restored from backup.").
3. If there's no usable record and no backup, it reports the failure rather than
   crashing.

Imported/recorded audio that fails to decode is skipped per-asset (it never
creates a broken clip), so a single bad blob can't take down a project.

## 5. Safe reset

Preferences → Danger zone → *Reset app* wipes all stores (projects, blobs,
backups, settings) behind an explicit confirm, then reloads to the first-run
setup wizard. This is the clean-slate escape hatch.

## What you can rely on

- Worst-case loss after a crash is the last few seconds of *un-flushed parameter
  changes* — finished takes/imports are persisted with the project.
- A corrupt project auto-restores from backup when possible.
- A false "crash" prompt won't appear after a normal quit (clean heartbeat).
