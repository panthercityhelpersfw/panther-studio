# Arrangement System

The arrangement (timeline) is where you build a song from clips, loops, markers,
and the playhead. Everything here drives the real audio engine — moving a clip
moves real scheduled audio.

## Timeline & grid

- **Grid** is musical: lines are drawn per **bar** (4 beats) with lighter
  sub-divisions at the current snap resolution. Bar/beat spacing is derived from
  the project tempo (`60 / tempo` seconds per beat).
- **Grid resolution** (Edit toolbar → *Grid*): 1/1, 1/2, 1/4, 1/8, 1/16. Setting
  it updates the snap size (`snapSec = secPerBeat * beats`).
- **Snap** toggle (transport bar) turns grid-snapping on/off for clip moves,
  trims, splits, loop edits, and seeking.
- **Zoom**: the +/- buttons in the transport bar change pixels-per-second
  (8…400 px/s). The ruler, lanes, and clips all rescale.

## Playhead & seeking

- Click the ruler or empty lane space to move the playhead (snapped if snap is
  on). The playhead is driven by the audio clock during playback, so it stays
  sample-accurate.
- `Space` toggles play/stop; `Esc` stops; transport bar buttons mirror this.

## Loop region

- Drag on the thin **loop strip** under the ruler to define a loop region
  (`setLoopRegion`). It shows as a shaded band across the lanes.
- Toggle looping with the **Loop** button (Edit toolbar) or the `L` key.
- During playback the engine watches the position each frame; when it reaches the
  loop end it fires `onLoop`, which reseeks to the loop start and reschedules —
  giving seamless, real looped playback.

## Markers & sections

- **+ Marker** (point) and **+ Section** (labeled region) drop a marker at the
  playhead. Markers appear as flags on the ruler and faint guide lines across the
  lanes.
- Click a marker flag to jump the playhead there; hover and click ✕ to delete.
- Markers/sections are saved with the project.

## Tracks

- **+ Track** adds a track; track headers carry name, color, arm/mute/solo,
  volume, pan, and a live meter (see `MIXER_SYSTEM.md`).
- Any track can hold both **audio** and **MIDI** clips.

## Clips

See `CLIP_EDITING.md` for move/trim/split/duplicate/fade/gain/mute. Double-click
empty lane space to create a **MIDI clip**; double-click a MIDI clip to open the
piano roll (`MIDI_ENGINE.md`).

## Undo / redo

All structural and parameter edits go through one chokepoint (`touchProject`),
which snapshots the project onto an undo stack (capped at 100). Rapid edits (knob
drags, clip moves) coalesce into a single undo step via a short time-window key.
`Ctrl/Cmd+Z` undoes, `Ctrl/Cmd+Shift+Z` (or `Ctrl+Y`) redoes. After undo/redo the
audio graph is reconciled (`syncTracks` + re-apply params/effects/loop), so the
sound always matches the visible state.

## Vocal workflow (end to end)

1. **Import a beat** (Edit toolbar → *Import Beat*) — lands on a dedicated "Beat"
   track at 0:00.
2. **Arm a vocal track**, enable the mic, and **Record** over the beat (overdub:
   existing clips play while you record).
3. **Trim** mistakes from clip edges, **Split** (`S`) at the playhead, **Move**
   takes to fix timing, **Duplicate** good takes, **Mute/Solo** takes or tracks
   to comp.
4. **Loop** a hook section to practice/punch-in.
5. Mix, master, and export (later steps).
