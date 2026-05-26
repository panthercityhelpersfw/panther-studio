# Optimization System

Tools to keep large projects responsive. Code: store actions in `src/state/store.ts`; UI in the track header and Preferences → Audio & performance.

## Performance monitor

Preferences shows live engine stats (`AudioEngine.getPerfInfo`): sample rate, output latency, active voices, track count, context state, plus a glitch-risk indicator. **Low-CPU mode** runs meters/gates at ~1/3 rate; **Disable visualizers** stops the spectrum analyzer.

## Freeze / unfreeze track (❄ in the track header)

Freezing renders the track's clips through its full effect chain to a single audio asset (`renderStem`), adds that as a dry clip, mutes the originals, and neutralizes the live effect chain — so the track plays back with **zero live DSP**. It stores enough (`Track.frozen`: assetId, frozen clip id, prior effects, muted clip ids) to **fully reverse on unfreeze**.

## Bounce track (Bnce in the track header)

Renders a track's stem to a **new audio track** (originals kept) — useful for committing MIDI/instrument or effect-heavy tracks to audio.

## Clear unused audio / Project cleanup (Preferences)

- **Clear unused audio** prunes asset metadata and IndexedDB blobs not referenced by any clip, pad, reference, frozen asset, or dry (A/B) asset.
- **Project cleanup** additionally removes empty tracks, then clears unused audio.

## Stability

- **Error boundary** (`src/components/ErrorBoundary.tsx`) catches render crashes, attempts an auto-save, and offers continue/reload.
- **Lazy asset decode** — audio buffers are decoded from IndexedDB on project open, per asset, skipping anything undecodable.
- **Leak-safe audio graph** — the effect chain is built once; enable/bypass is done via gains (no node churn). Scheduled sources self-disconnect on `onended`.
- **Crash recovery** — rolling backups + a clean-exit heartbeat restore the last project after an unclean shutdown.

## Honest limitations

- Waveform peak extraction runs on the main thread (cached per asset, computed per visible column) rather than in a Web Worker. It is efficient in practice; a worker-based path is a future improvement.
- Long track lists are not yet virtualized; very large projects benefit from freezing/bouncing inactive tracks.
