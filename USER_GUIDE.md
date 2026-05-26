# User Guide

Everything you can do in Panther Studio, and how. For install/build see
`SETUP_GUIDE.md` and `RELEASE_CHECKLIST.md`.

## Pro upgrade features (new)

- **Profiles** — pick/create a local profile on launch; projects, presets, and device prefs are scoped to it (`LOCAL_ACCOUNTS.md`).
- **🎙 Audio Setup** (transport bar) — mic + output selection, calibration, noise-floor/room tests, plosive/clip warnings, headphone test (`MIC_SETUP_SYSTEM.md`).
- **🎹 Build** (transport bar) — Instrumental Builder: type a beat, drum grid, instruments, song sections (`INSTRUMENTAL_BUILDER.md`, `LOCAL_COMPOSER.md`).
- **VOCAL LAB** tab — real autotune + one-click vocal cleanup with A/B (`AUTOTUNE_ENGINE.md`, `VOCAL_CLEANUP.md`).
- **MIX ASSIST** tab — per-track analysis + fixes, auto gain-stage, Vocals/Music/Drums buses (`MIX_ASSISTANT.md`).
- **🎯 Coach** (transport bar) — Vocal Coach: scores, feedback, timeline markers, creative ideas, safe fixes (`VOCAL_COACH_ENGINE.md`).
- **Master targets + stereo image** — Spotify/YouTube/TikTok/Loud Rap/Clean Pop/Podcast, width, low-end mono, export-safe preview (`MASTERING_ASSISTANT.md`).
- **File menu** — Save As, export/open `.panther` project bundles, Library (search/favorites/presets/exports).
- **Optimization** — freeze (❄)/bounce per track, clear unused audio, project cleanup (`OPTIMIZATION_SYSTEM.md`).
- **Piano roll / Staff** — toggle views, scale highlight, humanize, export MIDI (`SHEET_MUSIC_SYSTEM.md`).

## The full vocal workflow

1. **Create a project** — on the dashboard, name it and click *Create & open*.
2. **Set up your mic** — the Setup Wizard guides you; or open **🎙 Input** later.
3. **Import a beat** — Edit toolbar → **🎵 Import Beat**. It lands on a new
   "Beat" track at 0:00.
4. **Arm a vocal track** — click a track's **R** (arm) button.
5. **Monitor safely** — with **headphones on**, open 🎙 Input → enable
   *monitoring* (choose Dry or Wet/through-FX). Never monitor on speakers.
6. **Record** — press **R** (or the record button). With a count-in set, you get
   a click lead-in. Existing clips play so you can perform over them (overdub).
7. **See the waveform** — the take appears as a real clip with its waveform.
8. **Apply a preset** — FX RACK tab (or Inspector) → *Preset…* → e.g. Clean Pop.
9. **Auto Vocal Enhance** — analyzes the take and builds a tailored chain; a
   report shows what it measured and changed.
10. **Edit** — drag to move, drag edges to trim, **S** to split, fade handles on
    the clip corners, clip gain/mute in the Inspector, **Ctrl+Z** to undo.
11. **Mix** — MIXER tab: volume/pan/mute/solo per track, with live meters.
12. **Auto Master** — MASTER tab → *Auto Master (Streaming -14 / Loud -9)*, or
    pick a master preset; check **Analyze Loudness** for warnings.
13. **Export** — MASTER tab → *Export full song (WAV)*; pick a location in the
    native save dialog. Also: loop-region and per-track **stems**.
14. **Save** — Ctrl/Cmd+S (autosave is always on). Reopen later from the
    dashboard; audio and effects are restored.

## Transport & navigation

- **Play/Pause** Space · **Stop** Esc · **Record** R.
- Click the ruler or empty lane to move the playhead.
- **Zoom** with +/- ; toggle **Snap**; choose **Grid** resolution (1/1…1/16).
- **Loop**: drag the thin strip under the ruler to set a region, toggle with the
  **Loop** button or **L**.
- **Markers/Sections**: add at the playhead; click a flag to jump.

## Tracks

Add with **+ Track**. Each track: name (double-click), color, **R** arm, **M**
mute, **S** solo, volume, pan, meter. Delete with the ✕.

## Clips

Move (drag), trim (drag edges), **split** (S at playhead), **duplicate**, **mute**
a take, **clip gain** and **fade in/out** (Inspector or corner handles),
right-click for a menu. Overlap two clips with fades for a crossfade.

## Effects (FX RACK tab)

Per-track chain in order: Gate → EQ → De-Esser → Compressor → Saturation →
Doubler → Delay → Reverb → Limiter. Each card has an ON/BYP button and real
knobs (drag; Shift = fine). Use **Preset…**, **Auto Make Vocals Sound Good**, or
**Reset**. The chain visualizer shows signal flow.

## Sample pads (PADS tab)

Import one-shots; trigger by clicking a pad or pressing its key (1-0, q-p).
Per-pad gain and name. Pads route through the master.

## MIDI

Double-click an empty lane (or **♪ + MIDI**) to add a MIDI clip; double-click it
to open the **piano roll**: click to add notes, drag to move, drag the right edge
to resize, right-click to delete, set velocity, **Quantize**. Notes play through
the track's effects via a built-in synth.

## Mixing (MIXER tab)

Channel strips (vol/pan/mute/solo/arm) with insert badges and meters; master
strip with post-chain L/R meters, insert badges, and gain reduction.

## Mastering (MASTER tab)

Master chain (EQ, glue comp, saturation, limiter) + output gain + **Bypass**;
**master presets**; **Auto Master** to a loudness target; **Analyze Loudness**
(peak/RMS/approx-LUFS + warnings); **Reference A/B** (import a reference, toggle
A·Mix / B·Ref — the reference bypasses your master chain).

## Tools (top bar → 🎛 Tools)

**Metronome** toggle, **Count-in** (bars before recording), **Tap Tempo**, and a
**Tuner** (sing a note to see pitch and cents).

## Preferences (⚙)

Audio (low-CPU mode, disable visualizers, live performance readout), input
device, **theme accent**, autosave interval, count-in, **update** settings,
storage info, keyboard shortcuts, and a safe **Reset app**.

## Recovery

Autosave + rolling backups protect your work. If the app closed unexpectedly,
you'll be offered to **recover your last session** on next launch. A corrupt
project auto-restores from its latest backup. See `RECOVERY_SYSTEM.md`.

## Exporting & sharing

WAV export is full quality and matches the timeline + effects + mastering. Stems
export each audio track pre-master. MP3 is not yet supported (planned) — see
`EXPORT_PIPELINE.md`.
