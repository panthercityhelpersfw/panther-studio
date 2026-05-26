# Testing Checklist

Practical manual test plans for Panther Studio. Run these in the desktop app
(`npm run tauri:dev`) unless noted. Automated logic tests for the core workflow
have already been run in a real browser engine (see `FINAL_DELIVERY_REPORT.md`).

## 0. Build & launch

- [ ] `npm install` completes.
- [ ] `npm run typecheck` → no errors.
- [ ] `npm run build` → no errors, `dist/` produced.
- [ ] `npm run tauri:dev` → app window opens.
- [ ] `npm run tauri:build` → NSIS `.exe` + MSI produced.
- [ ] Install the `.exe`; app appears in Start Menu + Desktop; launches.

## 1. Recording test (needs a real mic)

- [ ] First-run Setup Wizard appears; enable mic, calibrate level.
- [ ] 🎙 Input: device list populated; input meter moves when you speak.
- [ ] With **headphones**, enable monitoring (dry then wet); confirm no feedback.
- [ ] Arm a track, set a count-in, press **R**: count-in clicks, then it records.
- [ ] Stop: a clip with a real waveform appears.
- [ ] Record a second take; both takes exist; mute one (M on the clip).
- [ ] Unplug the mic mid-session → a "disconnected" banner appears.

## 2. Import test

- [ ] Import Beat → a Beat track at 0:00 with a waveform.
- [ ] Import Audio (WAV/MP3/OGG/M4A) onto the selected track.
- [ ] Import a corrupt/non-audio file → it's rejected with a message, no clip.

## 3. Effects test

- [ ] FX RACK: toggle each effect ON/BYP and hear the change on playback.
- [ ] Turn each knob; values update and audio changes (no clicks/dropouts).
- [ ] Apply each vocal preset; hear distinct characters.
- [ ] Auto Vocal Enhance → report shows measurements + changes; audio improves.
- [ ] Wet monitoring routes through the armed track's chain.

## 4. Editing test

- [ ] Drag a clip (snaps to grid); move it to different positions.
- [ ] Trim both edges; split (**S**) at the playhead; duplicate.
- [ ] Set fade in/out (corner handles + Inspector); hear the fades.
- [ ] Clip gain changes level; mute excludes it from playback/export.
- [ ] Undo/redo (**Ctrl+Z** / **Ctrl+Shift+Z**) reverts/reapplies edits.
- [ ] Loop a region (drag strip + **L**); playback loops seamlessly.
- [ ] Add markers/sections; click to jump.

## 5. MIDI & pads test

- [ ] Double-click a lane → MIDI clip; piano roll: add/move/resize/delete notes,
      set velocity, quantize; playback synthesizes notes through the track FX.
- [ ] PADS: import a one-shot; trigger by click and by its key; adjust pad gain.

## 6. Mix & master test

- [ ] MIXER: vol/pan/mute/solo per track; meters move; insert badges show.
- [ ] Solo isolates a track; mute silences it.
- [ ] MASTER: toggle bypass (hear the chain in/out); apply a master preset.
- [ ] Auto Master (Streaming/Loud) → report; output level moves toward target.
- [ ] Analyze Loudness → peak/RMS/approx-LUFS + appropriate warnings.
- [ ] Reference A/B: import a reference; B plays it (bypassing master), A plays mix.

## 7. Save / reload test

- [ ] Ctrl+S saves; "Saved" shows; autosave fires while editing.
- [ ] Close the app, reopen → last project loads with audio + effects + master
      intact.
- [ ] Dashboard: rename, duplicate (independent copy with its own audio), delete.

## 8. Export test

- [ ] Export full song (WAV) → native save dialog → file plays in another player,
      includes effects + mastering, correct length, no unexpected clipping.
- [ ] Export loop region (WAV) → only the region.
- [ ] Export stems → one WAV per audio track (pre-master).

## 9. Recovery test

- [ ] Force-quit the app (Task Manager) mid-session.
- [ ] Relaunch → "Recover your last session?" prompt → Recover → project restored.
- [ ] Verify a normal quit does NOT show the recovery prompt.

## 10. Preferences & reliability

- [ ] Change accent color (applies live); change autosave interval.
- [ ] Low-CPU mode reduces meter update rate; Disable visualizers stops the
      analyzer; the performance/glitch readout updates.
- [ ] Check for updates → honest status (no fake success).
- [ ] Reset app (Danger zone) → confirms, wipes, returns to first-run.

## 11. Update-system readiness

- [ ] Follow `RELEASE_GUIDE.md` step 5 on a test feed; confirm `check()` reports
      a newer version when `latest.json` advertises one.

## 12. Stress test

- [ ] Create 6–8 tracks, each with clips + a couple of effects; play back — audio
      stays glitch-free (use Low-CPU mode if needed).
- [ ] Export the full multi-track song → correct, complete WAV.
- [ ] Long session: confirm storage readout is reasonable; autosave keeps working.
