# Project Management

The dashboard is the home screen for managing projects. Everything is stored
locally (IndexedDB) and survives restarts.

## Dashboard

- **New project** — name it and create; opens straight into the studio.
- **Open** — click any project card to load it (audio is re-hydrated/decoded
  before the timeline shows).
- **Rename** — hover a card → *Rename* (inline prompt).
- **Duplicate** — hover a card → *Duplicate*. Makes a full independent copy: the
  project JSON is deep-cloned, every asset id is remapped, and each referenced
  audio **blob is copied** under the new ids (so editing the copy never touches
  the original's audio). Pads and the reference track are remapped too.
- **Delete** — hover a card → *Delete* (confirms; cascade-deletes the project's
  audio blobs).
- **Recent projects** — the list is sorted by last-updated, newest first.
- **Storage usage** — the footer shows IndexedDB usage and (desktop) the on-disk
  data folder path.

## Lifecycle & autosave

- New/duplicated projects are written to disk immediately.
- While working, a **debounced autosave** (~1.5s after the last change) plus a
  **periodic safety autosave** (interval configurable in Preferences, default
  20s) keep the project current.
- Manual save: Ctrl/Cmd+S or the toolbar Save button.
- The last-open project is reopened automatically on next launch (unless crash
  recovery offers a choice first — see `RECOVERY_SYSTEM.md`).

## What's saved with a project

Tracks (gain/pan/mute/solo/arm/color/effects), clips (audio + MIDI, with gain/
fades/mute), sample pads, markers/sections, the loop region, the master chain +
output gain, the reference track, tempo, and asset metadata. Raw audio (records,
imports, pads, reference) lives in the `blobs` store and is cascade-managed.

## Storage & cleanup

- Deleting a clip/pad frees its audio blob when no longer referenced.
- Deleting a project removes its project record, blobs, and backups.
- Backups: a rolling set of recent snapshots per project (for recovery) — see
  `RECOVERY_SYSTEM.md`.
- A full **Reset app** (Preferences → Danger zone) wipes all projects, blobs,
  backups, and settings, then restarts to first-run.

## Limits

Audio is stored in IndexedDB (large desktop quota). Very long sessions of
high-bitrate takes should be monitored via the storage readout. A file-based
audio option (Tauri `fs`) is a candidate for unbounded capacity in a later step.
