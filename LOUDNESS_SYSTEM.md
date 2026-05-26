# Loudness System

Panther Studio measures the loudness of your mix from a real offline render and
surfaces honest warnings. Peak, RMS, and clipping are exact; the LUFS figure is
an **approximation** and is labeled as such everywhere.

## What is measured (`src/audio/loudness.ts`)

`analyzeLoudness(buffer)` returns:

- **Peak** (linear + dBFS) — exact maximum absolute sample.
- **RMS** (linear + dBFS) — exact root-mean-square over all samples/channels.
- **Clipped %** — exact fraction of samples at/over full scale (≥ 0.999).
- **Approx LUFS** — a K-weighted (BS.1770-style) estimate (see below).
- **Warnings** — derived from the above.

## How the approximate LUFS is computed

1. Each channel is filtered with the standard **K-weighting** biquads (a high
   shelf + a high-pass), the same two-stage filter ITU-R BS.1770 specifies.
2. The K-weighted **mean square** per channel is summed across channels.
3. Loudness `= -0.691 + 10·log10(sum)`.

### Honest limitations (why it's "approx")

- It is **ungated** — real integrated LUFS applies absolute/relative gating; this
  does not. Quiet passages therefore pull the number down slightly vs. a
  certified meter.
- The K-weighting coefficients are the **48 kHz** set; at other sample rates the
  estimate drifts a little.
- It is a single integrated figure, not momentary/short-term.

It is good for "too loud / about right / too quiet" decisions and for Auto
Master's target-seeking — **not** for broadcast compliance. The UI and reports
always call it "approx LUFS".

## Warning system

`analyzeLoudnessNow()` (MASTER tab → *Analyze Loudness*) renders the mix and
shows a report with severity-coded warnings:

| Condition | Severity | Message |
|-----------|----------|---------|
| Clipped % > 0.01 | bad | "Clipping detected (… at full scale)." |
| Peak ≥ 0 dBFS | bad | "True peak at/over 0 dBFS — reduce output or limit." |
| Peak > -0.4 dBFS | warn | "Peaks are hot." |
| ~LUFS > -8 | bad | "Very loud — streaming will turn it down and it may distort." |
| ~LUFS -8…-12 | warn | "Loud — fine for a demo; above streaming targets (~-14)." |
| ~LUFS < -20 | warn | "Quiet — consider raising output or Auto Master." |
| otherwise | ok | "Looks good (~… LUFS, peak … dBFS)." |

## Live metering vs. analysis

- **Live**: the mixer/master meters show real-time RMS and gain reduction every
  frame (post-master-chain for the master meter).
- **Analysis**: the loudness report is computed from a full offline render of the
  mix, so it reflects the complete song, not just the current playhead moment.

## Relationship to Auto Master

Auto Master analyzes the **raw mix** (master bypassed) with this same function,
then sets an output gain to move toward a target loudness (Streaming -14 / Loud
-9), plus glue compression and a true-peak-safe limiter. Re-run *Analyze
Loudness* afterward to confirm the result. See `MASTERING_SYSTEM.md`.
