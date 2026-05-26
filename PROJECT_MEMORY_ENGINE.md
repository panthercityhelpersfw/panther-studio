# Project Memory Engine

Project memory is local-only and saved inside the project JSON under `project.studioIntelligence.memory`.

## Tracked Signals

- preferred vocal brightness, dryness, saturation, and width
- preferred loudness target
- favorite factory preset IDs
- accepted suggestion kinds
- rejected suggestion kinds
- recurring vocal problems
- recurring mix problems
- workflow habits
- export targets

## Learning Behavior

Applying a recommendation records an accepted suggestion type.
Rejecting a recommendation records a rejected suggestion type.
Applying a factory preset updates tone preference estimates.

No network calls or cloud sync are used.
