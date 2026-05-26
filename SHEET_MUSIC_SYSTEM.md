# Sheet Music / Piano Roll Hybrid

The MIDI editor (`src/components/PianoRoll.tsx`) is a hybrid: toggle between **Piano Roll** and **Staff** views.

## Piano roll

- Click to add notes, drag to move, drag the right edge to resize, right-click to delete.
- **Velocity editor** for the selected note.
- **Note names** on the keyboard column.
- **Key signature + scale highlighting** — pick a key + scale in the header; in-scale rows get a subtle accent tint and the tonic is highlighted.
- Adding a note auditions it through the track's instrument.

## Staff view

A read-style 5-line staff renders the clip's notes as note-heads positioned on a diatonic ladder, with ledger lines for out-of-range notes, sharp glyphs for black keys, and stems. It centers on the notes' average pitch. Switch back to Piano Roll to edit.

## Editing tools (header)

- **Quantize** — snap note starts to the grid.
- **Humanize** — add subtle timing + velocity variation so programmed parts feel human.
- **Export MIDI** — writes a real Standard MIDI File (`.mid`, format 0) via `src/audio/smf.ts` that any DAW can open. Tempo is embedded; export is logged to history.

## Honest limitations

- The staff is a clear visualization for melody/chords; note entry/editing happens in the piano-roll view (staff editing is read-oriented).
- Staff rendering uses a simplified diatonic layout (no full engraving / beaming).
