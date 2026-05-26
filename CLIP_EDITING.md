# Clip Editing

All clip editing is non-destructive and operates on real audio scheduling. The
source audio in IndexedDB is never modified — edits change how/when a clip plays.

## The clip model

A `Clip` (see `src/state/types.ts`) has:

- `startSec` — position on the timeline.
- `offsetSec` — trim offset into the source asset (audio).
- `durationSec` — played length.
- `gain` — per-clip linear gain.
- `fadeInSec` / `fadeOutSec` — fade lengths.
- `muted` — mute this individual take.
- `kind` — `"audio"` or `"midi"` (MIDI clips carry `notes`).

## Operations (all undoable)

| Action | How | Notes |
|--------|-----|-------|
| **Select** | Click a clip | Selected clip is the target for keyboard/inspector ops |
| **Move** | Drag the clip header/body | Snapped to grid; `moveClip` |
| **Trim start** | Drag the left edge | Moves `startSec` + `offsetSec` together so audio stays in place; `trimClipStart` |
| **Trim end** | Drag the right edge | Won't extend past the source material; `trimClipEnd` |
| **Split** | Playhead over clip, press `S` (or toolbar) | Cuts into two clips at the playhead; MIDI notes are partitioned/retimed; `splitClipAtPlayhead` |
| **Duplicate** | Toolbar / inspector / right-click | Copies the clip (and MIDI notes) right after itself; `duplicateClip` |
| **Delete** | `Delete`/`Backspace`, right-click, inspector | Frees the asset blob if no other clip uses it; `deleteClip` |
| **Clip gain** | Inspector slider | Per-clip `GainNode` in the playback graph; `setClipGain` |
| **Fade in/out** | Drag the top-corner handles, or inspector | Real `linearRamp` envelopes on the clip gain node; `setClipFade` |
| **Mute take** | Right-click → Mute, or inspector | Excludes the clip from playback/export; `toggleClipMute` |

## Fades & crossfades

Fades are real gain automation applied to a **per-clip gain node** when the clip
is scheduled (`AudioEngine.applyClipEnvelope`). A partial fade-in is handled
correctly when playback starts midway through a clip.

**Crossfade**: overlap two clips on the same track and set a fade-out on the
left clip and a fade-in on the right clip over the overlap. Each clip has its own
gain node, so the overlap sums as a real equal-ish-power crossfade. (A one-click
"auto-crossfade overlap" helper is a candidate for a later step; the building
blocks are all here.)

## How edits reach the audio

Clip edits update the project via `touchProject` (which also records undo
history). On the next `play()` the engine reads the current clips and schedules
`AudioBufferSourceNode`s with the right `offset`, `duration`, per-clip gain, and
fade envelopes. Edits made during playback take effect on the next
play/seek/loop cycle.

## Export fidelity

The offline export (`renderMixdown`) honors clip `gain`, `fadeIn`/`fadeOut`, and
`muted`, and skips MIDI clips (MIDI render to audio is a later step). See
`EFFECTS_ENGINE.md` for the track effect chain that also renders offline.
