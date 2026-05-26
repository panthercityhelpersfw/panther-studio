# Instrumental Builder

A beginner-friendly beat/instrumental maker. Open it from the transport bar (**🎹 Build**). Code: `src/components/InstrumentBuilder.tsx`, instruments in `src/audio/instruments.ts`, composer in `src/audio/composer.ts`.

## Sections

1. **Type a beat (local composer)** — describe a beat in plain English and click Generate. Genre template buttons (Emotional Trap, Boom-Bap Rap, R&B Smooth, Pop, Rock, Cinematic, Podcast Bed) fill and run the composer. See LOCAL_COMPOSER.md.
2. **Drum pattern grid** — a 1-bar, 16-step grid for Kick/Snare/Clap/Hat/Open Hat/Crash. Click cells to toggle hits; click a lane name to audition. **Add drum clip** turns the pattern into a real, editable MIDI clip on a Drum Kit track routed to the Drums bus.
3. **Add an instrument track** — one click adds a track with a chosen instrument (Piano, EP, Bass, Lead, Pad, Pluck, Synth, Drum Kit), ready to draw MIDI in the piano roll.
4. **Song sections** — add Intro/Verse/Pre-Hook/Hook/Bridge/Outro section markers at the playhead, or **Build full structure** to lay out a standard Intro→Outro section map (8-bar sections) across the timeline.

## Real instruments

All instruments are synthesized with Web Audio primitives (`scheduleInstrumentNote`): the same scheduler runs live (playback) and in the offline renderer (export/freeze), so **what you hear is what you export**. The Drum Kit maps GM-ish pitches to synthesized kick/snare/clap/hats/toms/crash. Everything routes through the mixer and master.

## Editing generated ideas

Generated parts are normal editable MIDI clips. Open any in the piano roll (double-click the clip) to tweak notes, change the instrument from the track header, quantize/humanize, or export MIDI.

## Honest limitations

- Drag-and-drop loop blocks are represented by the composer + step grid + instrument palette rather than a freeform loop browser.
- Instruments are synthesized (no multi-sampled libraries), which keeps the app self-contained and exportable but is less realistic than sampled instruments.
