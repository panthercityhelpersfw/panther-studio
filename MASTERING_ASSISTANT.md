# Mastering Assistant

The MASTER tab (`src/components/MasterPanel.tsx`) drives the master chain (`EffectChain`), the loudness analyzer (`src/audio/loudness.ts`), and the auto-master logic (`src/audio/autoMaster.ts`).

## Target presets

Auto Master targets a loudness and builds a master chain (EQ polish → glue compression → optional saturation → true-peak-safe limiter) plus an output gain:

| Target | Approx LUFS |
|---|---|
| Spotify / Streaming | −14 |
| YouTube | −14 |
| TikTok / Reels | −14 |
| Loud Rap | −8 |
| Clean Pop | −12 |
| Podcast | −16 |

Pick a target and click **Master for target**. The five master-bus presets (`masterPresets.ts`) remain available too.

## Stereo width & low-end mono

The **Stereo Image** card adds:
- **Width** (0 = mono … 2 = wide) — scales the Side component of the high band (M/S).
- **Low-end mono** — sums frequencies below the chosen cutoff to mono (tighter bass / vinyl-safe).

These are applied as real sample-domain processing on the rendered master (`applyStereoMaster` in `export.ts`), so they affect **exports and the export-safe preview**.

## Loudness / true peak / export-safe preview

**Export-safe preview** renders the full mix through the master chain + stereo processing and reports approx LUFS, peak dBFS, and clipping. The LUFS figure uses a K-weighted (BS.1770-style) filter and is labelled **approx** — it is not a certified measurement. Peak and clipping are exact. The limiter provides true-peak-safe ceiling protection.

## Export

WAV export (full song / loop region / stems), all through the master chain (stems are pre-master). Exports are logged to the project's export history (Library → Exports).

## Honest limitations

- LUFS is approximate (K-weighting at 48 kHz; drifts slightly at other rates).
- "True peak" is sample-peak with limiter protection, not 4× oversampled inter-sample peak.
- MP3/AAC encoding is not bundled; WAV is full-quality. See EXPORT_PIPELINE.md.
