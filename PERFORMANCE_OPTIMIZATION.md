# Performance Optimization

The intelligence engine is designed to stay away from low-latency recording paths.

## Current Protections

- Runs on demand instead of continuously.
- Uses decoded buffers already managed by `AudioEngine`.
- Uses offline rendering for stems and master analysis.
- Persists compact metric snapshots, not duplicated audio.
- Reuses existing track freezing, bouncing, cleanup, and cache pruning.

## Performance Metrics

The snapshot records:

- frozen track count
- enabled live effect slots
- decoded asset count
- estimated project complexity
- low/medium/high performance risk

## Next Architecture Hooks

The analyzer service is isolated so it can be moved into a Web Worker without changing the UI or persistence contract.
