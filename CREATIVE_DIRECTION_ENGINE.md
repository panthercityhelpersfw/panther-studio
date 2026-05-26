# Creative Direction Engine

The "Spark Ideas", improvement tips, and safe-fix suggestions in the Vocal Coach. Code: `src/audio/vocalCoach.ts` (idea/tip generation) + store actions for the actions.

## Spark Ideas (creative suggestions)

Opinion-based arrangement suggestions, **clearly labelled "creative suggestions"** in the UI so they're not confused with measured feedback. Tied to the detected structure (phrase count, key/scale):

- Double the hook for thickness
- Add a harmony a third above (in the detected key/scale)
- Reverb tail on the last word of each phrase
- Delay throw on an ad-lib before the hook
- Call-and-response ad-lib layers
- Cut the beat for a bar before the hook to build energy
- Punch in the strongest word instead of re-recording

Each idea has a **+ notes** button that appends it (timestamped) to the project's lyrics/notes.

## Improvement tips (coaching)

Beginner-friendly, triggered by the measured problems: mic distance (on clipping/quiet), breath control (on drift), volume control (on inconsistency), timing pocket (on loose timing), enunciation, and when to punch in vs. re-record.

## Safe one-click actions

These make real, conservative changes:

- **Apply Safe Fixes** — mild cleanup (de-ess, harshness, breath, de-click) + a gentle presence lift; reversible via A/B.
- **Create Punch-In** — sets a loop region around the worst-scoring phrase so you can re-sing just that part.
- **Add Double** — duplicates the take to a new panned track for width.
- **Add Harmony** — renders a +3-semitone harmony (phase-vocoder shift) onto a new track.

## Honest limitations

- Ideas are templated heuristics seeded by analysis, not generated music; they're starting points, not finished parts.
- "Safe" fixes are conservative but still render new assets (A/B toggle restores the dry take).
