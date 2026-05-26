# Local Composer

A real, rule-based music composer that turns a typed command into an arrangement. No cloud, no ML — deterministic music theory + genre patterns. Code: `src/audio/composer.ts`. Entry point: store action `composeFromPrompt(prompt)`.

## Examples it understands

- "make a sad piano loop in C minor"
- "add trap drums"
- "make chords emotional" / "make bass follow chords"
- "create 8 bar hook"
- "happy pop beat in C major with melody"

## Parsing

- **Key** — only with explicit context ("in C minor", "key of F#", "A minor") so stray letters (the "a" in "a sad loop") are not misread as a key.
- **Mood** — sad, emotional, dark, happy, chill, hype, aggressive.
- **Genre** — rap, trap, r&b, pop, rock, cinematic, podcast (sets the tempo).
- **Bars** — "8 bar", "hook"/"chorus" → 8, default 4.
- **Elements** — chords / bass / melody / drums (sensible defaults per genre if unspecified).

## Generation

- **Chords** — mood-appropriate progressions (e.g. minor i–VI–III–VII for sad/emotional; major I–V–vi–IV for happy), as triads/7ths, one chord per bar.
- **Bass** — follows the chord roots with a genre rhythm.
- **Melody** — chord-tone topline with a simple rhythm.
- **Drums** — per-genre 16-step kick/snare/hat patterns mapped to the Drum Kit.

Each part becomes a real **editable MIDI clip** on its own instrument track, routed to the Music/Drums buses. Project tempo and snap are set from the genre. Verified: "sad piano loop in C minor 8 bar hook with trap drums" produces an 8-bar sad trap arrangement (Chords, Bass, Melody, Drums) in C minor at 140 BPM.

## Honest limitations

- The composer is rule-based, not generative AI; output is musically coherent but pattern-driven.
- It writes MIDI for the built-in synth instruments (not sampled libraries).
