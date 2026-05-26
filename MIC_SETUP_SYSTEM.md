# Mic Setup System

The Audio Setup page (transport bar → **🎙 Audio**, component `src/components/AudioSetup.tsx`) is the dedicated place to configure and calibrate input/output. It builds on the existing input engine in `src/audio/AudioEngine.ts`.

## Features

- **Microphone selector** — lists `audioinput` devices (`AudioEngine.listInputDevices`). Selecting one re-opens the input stream and persists the choice to the active profile.
- **Output device selector** — uses `AudioContext.setSinkId` where supported (Chromium / WebView2, so the packaged desktop app supports it). If the runtime lacks `setSinkId`, the control is disabled and the app uses the system default — stated honestly in the UI.
- **Input gain calibration** — live input meter + gain slider (`AudioEngine.setInputGain`).
- **Noise floor detection** — measures true input RMS over 2 s of silence and reports dBFS with a verdict (excellent / good / acceptable / noisy).
- **Room noise test** — same measurement over 3 s of normal room tone.
- **Loudest-level test** — measures peak over 3 s of loud singing to check headroom.
- **Plosive / clipping warnings** — during any measurement, sustained near-full-scale peaks raise a clipping warning; short high-energy bursts raise a plosive warning.
- **Headphone / output test** — plays a real test tone through the selected output (`AudioEngine.playTestTone`).
- **Input monitoring** — toggle with a headphone-feedback warning (monitoring stays off by default for safety).

## Saving & reconnection

- Preferred input + output device IDs and input gain are saved **per profile** (`Profile.preferredInputId/preferredOutputId/inputGain`) and restored on profile selection.
- A `navigator.mediaDevices.devicechange` listener (wired in `store.init`) refreshes device lists, **warns if the selected mic disappears**, and **auto-reconnects** a previously-selected device when it returns.
- If the mic is lost mid-session, `AudioEngine.onInputEnded` closes the input and prompts the user to reconnect in Audio Setup.

## Honest limitations

- Browser/WebView audio APIs do not expose hardware preamp gain; "input gain" is a post-capture digital gain.
- `setSinkId` availability depends on the runtime; on platforms without it, output routing falls back to the system default device.
- Noise-floor figures are dBFS of the captured signal, not calibrated SPL.
