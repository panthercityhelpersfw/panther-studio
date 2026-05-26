# Vocal Coach Engine

Real, measurement-backed feedback on a recorded vocal take. Engine: `src/audio/vocalCoach.ts`. UI: transport bar **🎯 Coach** (`src/components/VocalCoach.tsx`). Timeline markers render in the arrange ruler.

## Workflow

1. Record or import a vocal, select the clip.
2. Open Coach → **Analyze Take**.
3. See scores, feedback, timeline markers, creative ideas, tips, and one-click actions.

## What it measures (real)

Built from the same engines used elsewhere (`detectPitchTrack` from the autotune MPM detector, `analyzeBuffer` band analysis):

- **Pitch accuracy** — average cents off the nearest key/scale note.
- **Pitch drift / stability** — frame-to-frame pitch variation.
- **Timing** — onset detection vs. the tempo grid.
- **Loudness consistency** — coefficient of variation of frame RMS.
- **Energy** — level vs. an ideal ~−16 dBFS RMS.
- **Clarity** — penalized for boomy/harsh/dull spectral balance.
- **Clipping / sibilance** — peak + high-band ratio.

## Scores

Seven 0–100 scores (Pitch, Timing, Clarity, Energy, Consistency, Mix-ready, Overall) shown as rings + an overall number, with a **trend** bar chart across analyzed takes.

## Markers, feedback, fixes

- **Phrase-level markers** are placed where a phrase is flat/sharp or drops in volume; click to jump there. Markers persist in `Project.coachNotes` and show in the timeline.
- **Coach feedback** and **improvement tips** are generated from the metrics (see PERFORMANCE_ANALYSIS.md).
- **One-click actions**: Apply Safe Fixes (mild cleanup + presence), Create Punch-In (loop the worst phrase), Add Double, Add Harmony (+3 semitones), Clear markers.
- **Spark Ideas** are creative suggestions, clearly labelled (see CREATIVE_DIRECTION_ENGINE.md); each can be saved to project notes.

## Coach memory

Score history (`Project.coachHistory`) and markers are saved with the project and reload intact, enabling the trend view. (A broader cross-session "Studio Intelligence" memory is a separate, complementary system.)

## Honest limitations

- Analysis is for a single selected clip at a time.
- Timing uses energy-onset detection (not full beat-tracking).
- "Mix-ready" is a heuristic combination, not a guarantee of release readiness.
