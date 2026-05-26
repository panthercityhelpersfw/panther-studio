# MIDI Engine

Panther Studio includes a basic but real MIDI foundation: MIDI clips, a piano
roll editor, and a built-in synth that plays notes **through the track's effect
chain** (so your EQ/comp/reverb apply to MIDI too).

## MIDI clips

- Create one by double-clicking empty lane space, or **+ MIDI** (Edit toolbar)
  on the selected track. A MIDI clip is a `Clip` with `kind: "midi"` and a
  `notes: MidiNote[]` array (no audio asset).
- MIDI clips can be moved, trimmed, split, duplicated, and muted like audio clips
  (notes are partitioned/retimed on split, copied on duplicate).
- The clip body renders a mini note preview on its canvas.

## Note model

```ts
interface MidiNote {
  id: string;
  pitch: number;       // 0..127, 60 = middle C
  startSec: number;    // relative to the clip start
  durationSec: number;
  velocity: number;    // 0..1
}
```

## Piano roll

Double-click a MIDI clip (or *Edit notes* in the inspector / right-click) to open
the piano-roll overlay:

- **Add note**: click empty grid (snapped to the current grid; one grid-step long).
- **Move**: drag a note (horizontal = time, vertical = pitch).
- **Resize**: drag a note's right edge.
- **Delete**: right-click a note, or select it and use *Delete note*.
- **Velocity**: select a note → velocity slider in the header (note brightness
  reflects velocity).
- **Quantize**: snaps all note starts to the grid (`quantizeClip`).

All edits are undoable and saved with the project.

## Synth playback

When the transport plays, `AudioEngine.scheduleMidiClip` schedules each in-window
note as a voice (`spawnSynthVoice`):

- A `sawtooth` `OscillatorNode` at `440 * 2^((pitch-69)/12)` Hz.
- A `lowpass` `BiquadFilterNode` to tame the saw.
- A short attack/sustain/release gain envelope scaled by velocity.
- Routed into the **track input**, so the track's effects and fader apply.

Voices are tracked and cleaned up on `onended` and on transport stop (no node
leaks).

## Limitations (honest)

- One built-in subtractive synth voice type (saw + lowpass + AD-ish envelope).
  No instrument selection or sampler-per-note yet.
- No MIDI file import/export and no external MIDI-device input yet.
- MIDI is **not** included in offline WAV export yet (audio clips are). The synth
  is real-time only; an offline MIDI render pass is a planned addition. This is
  documented rather than faked.
- Notes are clipped to the MIDI clip's own duration window during playback.
