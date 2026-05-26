# Storage System

Panther Studio persists everything locally — no cloud, no account. Projects and
recorded audio survive app restarts, reboots, and crashes.

## Where data lives

The audio + project database is **IndexedDB**, which inside a Tauri/WebView2 app
is physically stored in the WebView2 user-data directory under the OS
**app-local-data** folder:

```
%LOCALAPPDATA%\com.pantherstudio.app\        (app-local-data root)
   └── EBWebView\...\IndexedDB\               (projects, audio blobs, settings)
%APPDATA%\com.pantherstudio.app\             (app-data: created at launch for exports/backups)
```

The exact resolved paths are shown on the Dashboard (via the Rust
`get_app_paths` command) and created on first launch by `ensure_app_dirs` +
`setup()`. This is a real per-user on-disk store, **not** browser session
storage — closing the app does not clear it.

## Database schema (`src/persistence/db.ts`)

IndexedDB `panther-studio`, version 1, three object stores:

| Store | Key | Contents |
|-------|-----|----------|
| `projects` | `id` | Full project JSON: name, tempo, tracks, clips, **asset metadata** (small). Indexed by `updatedAt`. |
| `blobs` | `id` (= asset id) | Raw recorded audio **Blob** (the actual waveform source). Indexed by `projectId` for cascade delete. |
| `settings` | `"app"` | Selected input device, input gain, monitor preference, last open project. |

**Why split metadata from blobs?** Project JSON stays small and fast to
save/load; the heavy binary audio is stored once and loaded/decoded on demand.
This keeps autosave cheap (we re-save only the JSON, never re-write audio).

## Save / load lifecycle

- **Create**: `newProject` writes a project record immediately so it exists on
  disk before any recording.
- **Autosave**: every mutating store action marks the project dirty and schedules
  a debounced save (~1.5 s after the last change). A periodic safety timer
  (20 s) and a `beforeunload` handler also flush dirty state.
- **Manual save**: Ctrl+S or the toolbar Save button → `saveNow`.
- **Recording**: the audio Blob is written to `blobs` and the project saved
  *before* the clip is considered committed, so a crash mid-session can't lose a
  finished take.
- **Load / restore**: on launch the store reads `settings.lastProjectId` and
  reopens it, hydrating each asset by loading its Blob, decoding to an
  `AudioBuffer`, and rebuilding waveform peaks. If no last project, the Dashboard
  is shown.

## Crash safety

- The app data directory is created eagerly at launch (`setup()` +
  `ensureAppDirs`), so the first save can never fail for a missing folder.
- IndexedDB writes are transactional and durable; an interrupted session keeps
  the last committed autosave.
- Finished takes are persisted synchronously with the project, so the worst-case
  loss is at most the last ≤1.5 s of un-flushed *parameter* changes (not audio).

## Cleanup

- Deleting a clip whose asset is no longer referenced drops the in-memory mono
  cache and removes the Blob from IndexedDB.
- Deleting a project cascade-deletes all of its blobs (`deleteProject`).
- `pruneBlobs` removes orphaned blobs not referenced by any current asset.

## Storage budget

`estimateStorage()` surfaces `navigator.storage.estimate()` (usage/quota) on the
Dashboard. Desktop WebView quotas are large; long sessions of high-bitrate takes
should still be monitored. Future steps may add an option to store audio as files
in the app-data folder via the Tauri `fs` plugin for unbounded capacity.
