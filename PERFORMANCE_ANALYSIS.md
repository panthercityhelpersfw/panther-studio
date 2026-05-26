# Vocal Performance Analysis

The measurement layer behind the Vocal Coach. Code: `src/audio/vocalCoach.ts` (`analyzeTake`).

## Inputs

A decoded vocal `AudioBuffer`, the project tempo, the chosen key/scale, and the clip's start time (for grid-relative timing).

## Measurements

| Aspect | Method |
|---|---|
| Pitch accuracy | Mean absolute cents from each voiced frame to the nearest key/scale note (MPM pitch track) |
| Pitch drift / stability | Mean frame-to-frame pitch change in cents |
| Timing | Energy-onset detection; mean deviation from the nearest 1/8 grid position |
| Loudness consistency | Coefficient of variation of voiced-frame RMS |
| Energy | Distance of RMS from an ideal ~−16 dBFS |
| Clarity | Spectral balance (boomy / harsh / dull penalties) |
| Clipping | Sample peak + clipped-sample percentage |
| Sibilance | High-band energy ratio |
| Dynamics | Crest factor (peak − RMS) |

## Phrase detection

The take is split into phrases by silence gaps (>0.25 s of low RMS). Each phrase is scored for average cents error and end-of-phrase loudness drop, producing timeline markers and a "worst phrase" candidate for punch-in.

## Scoring

Each aspect maps to a 0–100 score with documented formulas; **Overall** is a weighted blend (pitch 28%, timing 18%, clarity 16%, consistency 14%, energy 12%, mix-ready 12%). Scores are saved to `Project.coachHistory` for trend tracking.

## Honest limitations

- Onset-based timing, not full beat tracking; very legato passages yield few onsets and a neutral timing score.
- Pitch metrics rely on monophonic detection (solo vocal).
- Scores are diagnostic heuristics, not absolute judgments of musical quality.
