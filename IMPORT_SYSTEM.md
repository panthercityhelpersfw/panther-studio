# Import System

Import brings external audio into a project as real, decoded clips or sample
pads. Decoding uses the WebView's native codecs via `decodeAudioData`.

## Supported formats

Whatever the WebView (Chromium/WebView2) can decode:

- **WAV** (PCM) — always.
- **MP3**, **OGG/Vorbis**, **M4A/AAC**, **FLAC** — supported by Chromium/WebView2
  on Windows. (Exotic/DRM files may fail to decode; see validation below.)

## How to import

- **Import Beat** (Edit toolbar): creates a dedicated **Beat** track and drops
  the file at 0:00 — the fast path for "rap/sing over a beat".
- **Import Audio** (Edit toolbar): imports one or more files onto the selected
  track, laid out sequentially from the playhead.
- **Import sample** (Pads tab): imports a one-shot onto a sample pad.

All three use a hidden `<input type="file">`, so they work the same in the
browser preview and the packaged desktop app.

## Pipeline (`store.importFiles` / `addPadFromFile`)

1. Read the file to an `ArrayBuffer`.
2. Copy the bytes into a `Blob` (decode detaches the buffer, so the blob is made
   from a `slice(0)` copy before decoding).
3. `audioEngine.decodeBlob` → `AudioBuffer` (real decode).
4. **Validate**: a null/zero-length/zero-duration result is rejected with a
   status message; the file is skipped (no corrupt clip is created).
5. Register the buffer + build mono waveform peaks.
6. Create an `AudioAsset` (metadata) and persist the **Blob** to IndexedDB
   (`saveBlob`) under the project id — so imported audio is saved *with* the
   project and survives restart/crash, exactly like recordings.
7. Insert a `Clip` (or `Pad`) referencing the asset; bump project length.
8. Autosave.

## Saved with the project

Imported audio is stored in the same `blobs` object store as recordings and is
cascade-cleaned when its last referencing clip/pad is deleted, or when the
project is deleted. Reopening a project re-hydrates every imported asset (decode
+ peaks) before showing the timeline. (Verified end-to-end: import → save →
reopen preserves clips, pads, and assets.)

## Validation & safety

- Files that fail to decode are reported per-file and skipped — they never create
  a broken clip.
- The blob is copied before `decodeAudioData` to avoid detached-buffer errors.
- Imports are wrapped in try/catch so one bad file doesn't abort a batch.

## Reference track

The mastering/reference workflow (see `MASTERING_SYSTEM.md`) reuses this import
pipeline for an A/B reference that bypasses the master chain.
