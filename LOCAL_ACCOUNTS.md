# Local Accounts / Profiles

Local-first profiles. There is **no network, no password, no real authentication** — a profile is an on-disk identity (in IndexedDB) that scopes projects, presets, and device preferences. Code: `src/components/ProfileGate.tsx`, profile actions in `src/state/store.ts`, persistence in `src/persistence/db.ts` (object store `profiles`).

## What a profile stores

`Profile` (state/types.ts): id, name, avatar (emoji), color, created/lastUsed timestamps, preferred input/output device IDs, input gain, accent color, and a reserved `syncId` for future optional cloud sync.

## Flow

1. On launch with no active profile, the dashboard shows the **Profile Gate** (create or pick a profile).
2. Selecting a profile sets `currentProfileId` (persisted in settings), applies its accent + device prefs, and loads its projects and preset library.
3. The dashboard header shows the active profile with a **Switch** button (sign out back to the gate).

## Scoping

- **Projects** carry `profileId`; `db.listProjects(profileId)` filters to the active profile (legacy profile-less projects remain visible to all profiles for backward compatibility).
- **Presets** (vocal chains, master, instrument) are stored per profile (object store `presets`, indexed by `profileId`) and shown in the Library.
- **Device prefs** (mic, output, input gain) are saved on the profile and restored on selection.

## Recent projects / saved exports

Per-profile recent projects appear on the dashboard and in the Library (searchable, favoritable, with simple thumbnails). Each project keeps an **export history** (Library → Exports).

## Deleting a profile

Deleting a profile cascades: its projects (and their audio blobs) and presets are removed.

## Future cloud sync

The architecture reserves `Profile.syncId` and keeps all state in well-defined IndexedDB stores, so a future sync layer could push/pull per-profile data. **Local works fully today; no cloud is implemented.**
