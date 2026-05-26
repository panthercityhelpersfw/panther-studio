# Panther Studio

A real, downloadable **vocal-focused desktop DAW** for Windows. Record vocals
over a beat, shape them with a real effects chain, mix, master to a loudness
target, and export a finished WAV — packaged as a native, installable Windows app
with crash recovery and an auto-update architecture.

Built with **Tauri 2 + React + TypeScript + Vite + Tailwind + Zustand** on the
**Web Audio API**, with a **Rust** backend for the desktop shell, installer,
native file dialogs, and updater. Nothing is faked — every control drives real
audio.

---

## Quick start

```bash
npm install          # install JS dependencies
npm run tauri:dev    # run the desktop app (hot reload)
npm run tauri:build  # build the Windows installer (.exe + .msi)
```

Other commands:

```bash
npm run dev          # web preview only (http://localhost:1420)
npm run build        # typecheck (tsc --noEmit) + production web build
npm run typecheck    # typecheck only
```

Prerequisites: Node 18+, Rust (stable) with the MSVC C++ toolchain, WebView2
runtime (pre-installed on Win 10/11). See `SETUP_GUIDE.md`.

## The complete workflow (works end-to-end)

Install/open → **New project** → mic setup (Setup Wizard) → **Import Beat** →
arm a vocal track → monitor safely (headphones) → **Record** → see the real
waveform → apply a **vocal preset** → **Auto Vocal Enhance** → edit clips
(trim/split/fade/gain) → **mix** levels → **Auto Master** → **Export WAV** →
**Save** → close → reopen → project loads with audio + effects intact.

This entire chain is verified (logic-level, in a real browser engine, incl.
capturing real exported WAV bytes). See `FINAL_DELIVERY_REPORT.md` and
`TESTING_CHECKLIST.md`.

> **Recording note:** recording needs a real microphone; it can't run in a
> headless test environment. The record pipeline (getUserMedia → MediaRecorder →
> decode → clip) uses the same decode/clip/effects path as audio import, which is
> verified automatically.

## Features

- **Recording**: real mic capture, device selector, input gain, safe monitoring
  (dry or through-FX) with a headphone warning, count-in, metronome, multiple takes.
- **Arrangement**: multi-track timeline, musical grid + snap, zoom, loop region,
  markers/sections, drag/trim/split/duplicate/fade/clip-gain, undo/redo.
- **Effects (per track)**: noise gate, EQ, de-esser, compressor, saturation,
  doubler/chorus, delay, reverb, limiter — plus 7 vocal presets and Auto Enhance.
- **Sample pads**: import one-shots, trigger by click/keyboard, routed to master.
- **MIDI**: MIDI clips + piano roll + a built-in synth through the track chain.
- **Mixing**: full mixer (vol/pan/mute/solo/arm, insert visibility, real meters).
- **Mastering**: master EQ/glue-comp/saturation/limiter + output gain + bypass,
  5 master presets, **Auto Master** to a loudness target, loudness analysis
  (peak/RMS/approx-LUFS/clipping warnings), reference A/B.
- **Export**: full song, loop region, and per-track stems to WAV via the native
  save dialog (browser-download fallback). (MP3 is documented as a later add.)
- **App shell**: installer + Start Menu/Desktop shortcuts, preferences, crash
  recovery with backups, setup wizard, tuner, tap tempo, low-CPU mode, honest
  updater UI.

## Documentation

| Doc | What it covers |
|-----|----------------|
| `SETUP_GUIDE.md` | Install prerequisites, run, build, first-run setup |
| `USER_GUIDE.md` | How to use every feature, the full vocal workflow |
| `FULL_PROJECT_ARCHITECTURE.md` | Code structure, data model, state, persistence |
| `AUDIO_ENGINE_BREAKDOWN.md` | The complete Web Audio graph, deep dive |
| `WINDOWS_INSTALLER.md` | Installer config, app identity, versioning |
| `AUTO_UPDATE_SYSTEM.md` | Updater architecture + how to enable it |
| `RELEASE_GUIDE.md` | Cutting a release, signing, GitHub Releases |
| `PROJECT_MANAGEMENT.md` / `RECOVERY_SYSTEM.md` | Projects, autosave, backups, recovery |
| `EFFECTS_ENGINE.md` / `VOCAL_PRESETS.md` / `MIXER_SYSTEM.md` / `MASTERING_SYSTEM.md` / `EXPORT_PIPELINE.md` / `LOUDNESS_SYSTEM.md` | Subsystem deep dives |
| `ARRANGEMENT_SYSTEM.md` / `CLIP_EDITING.md` / `MIDI_ENGINE.md` / `IMPORT_SYSTEM.md` | Editing subsystems |
| `KNOWN_LIMITATIONS.md` | Honest list of limits & approximations |
| `TESTING_CHECKLIST.md` | Manual test plans |
| `FINAL_DELIVERY_REPORT.md` | Final status: built / works / fixed / limits |

## Keyboard shortcuts

Space play/pause · R record · S split · L loop · Delete remove clip · Ctrl/Cmd+S
save · Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z redo · Esc stop. Pad keys (1-0, q-p)
trigger pads. Full list in-app (the **?** button) and `USER_GUIDE.md`.

## License / status

Prompt-built reference application. Set your real `bundle.publisher` and
code-sign before public distribution (`WINDOWS_INSTALLER.md`).
