import { useEffect, useRef, useState } from "react";
import { audioEngine } from "../audio/AudioEngine";
import { useStore } from "../state/store";
import { gainToDb } from "../utils/format";
import { Meter } from "./Meter";

const toDb = (x: number) => (x <= 1e-6 ? -120 : 20 * Math.log10(x));

type MeasureKind = "noise" | "room" | "level";

/**
 * Dedicated Audio Setup page: microphone + output selection, input calibration,
 * noise-floor / room-noise tests, plosive & clipping warnings, and a headphone
 * monitoring test. All measurements read real input RMS/peak from the engine.
 * See MIC_SETUP_SYSTEM.md.
 */
export function AudioSetup() {
  const open = useStore((s) => s.audioSetupOpen);
  const setOpen = useStore((s) => s.setAudioSetupOpen);
  const devices = useStore((s) => s.devices);
  const selectedDeviceId = useStore((s) => s.selectedDeviceId);
  const selectDevice = useStore((s) => s.selectDevice);
  const enableInput = useStore((s) => s.enableInput);
  const refreshDevices = useStore((s) => s.refreshDevices);
  const permission = useStore((s) => s.permission);
  const inputGain = useStore((s) => s.inputGain);
  const setInputGain = useStore((s) => s.setInputGain);
  const inputLevel = useStore((s) => s.inputLevel);
  const monitor = useStore((s) => s.monitor);
  const requestMonitor = useStore((s) => s.requestMonitor);
  const outputDevices = useStore((s) => s.outputDevices);
  const outputDeviceId = useStore((s) => s.outputDeviceId);
  const setOutputDevice = useStore((s) => s.setOutputDevice);
  const refreshOutputDevices = useStore((s) => s.refreshOutputDevices);

  const [measuring, setMeasuring] = useState<MeasureKind | null>(null);
  const [progress, setProgress] = useState(0);
  const [noiseDb, setNoiseDb] = useState<number | null>(null);
  const [roomDb, setRoomDb] = useState<number | null>(null);
  const [peakDb, setPeakDb] = useState<number | null>(null);
  const [clipWarn, setClipWarn] = useState(false);
  const [plosiveWarn, setPlosiveWarn] = useState(false);
  const raf = useRef(0);

  const active = permission === "granted";
  const outputSupported = audioEngine.supportsOutputSelection();

  useEffect(() => {
    if (!open) return;
    void refreshDevices();
    void refreshOutputDevices();
  }, [open, refreshDevices, refreshOutputDevices]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  if (!open) return null;

  const missingMic =
    selectedDeviceId != null &&
    devices.length > 0 &&
    !devices.some((d) => d.deviceId === selectedDeviceId);

  const measure = (kind: MeasureKind, durMs: number) => {
    if (!active) {
      void enableInput();
      return;
    }
    setMeasuring(kind);
    setProgress(0);
    setClipWarn(false);
    setPlosiveWarn(false);
    const start = performance.now();
    let sumSq = 0;
    let frames = 0;
    let peak = 0;
    let lowBurst = 0;
    const tick = () => {
      const t = performance.now() - start;
      setProgress(Math.min(1, t / durMs));
      const rms = audioEngine.inputRms();
      const p = audioEngine.inputPeak();
      sumSq += rms * rms;
      frames++;
      if (p > peak) peak = p;
      if (p >= 0.985) setClipWarn(true);
      // Plosive heuristic: a sudden high peak with high energy is a pop.
      if (p > 0.8 && rms > 0.25) lowBurst++;
      if (t < durMs) {
        raf.current = requestAnimationFrame(tick);
      } else {
        const avg = Math.sqrt(sumSq / Math.max(1, frames));
        const db = toDb(avg);
        if (kind === "noise") setNoiseDb(db);
        else if (kind === "room") setRoomDb(db);
        else setPeakDb(toDb(peak));
        if (kind === "level") setPeakDb(toDb(peak));
        if (lowBurst > 2) setPlosiveWarn(true);
        if (peak >= 0.985) setClipWarn(true);
        setMeasuring(null);
      }
    };
    raf.current = requestAnimationFrame(tick);
  };

  const noiseVerdict = (db: number) =>
    db < -60 ? ["Excellent — very quiet room.", "text-panther-green"] :
    db < -50 ? ["Good noise floor.", "text-panther-green"] :
    db < -40 ? ["Acceptable; consider a quieter space or noise gate.", "text-panther-gold"] :
    ["Noisy — use a gate, get closer to the mic, or reduce background noise.", "text-panther-red"];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
      <div className="bg-panel-850 rounded-lg border border-white/10 shadow-2xl w-[680px] max-h-[88vh] flex flex-col">
        <div className="px-5 py-3 border-b border-black/40 flex items-center justify-between">
          <h2 className="text-lg font-semibold">🎚 Audio Setup</h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* Status / enable */}
          <section className="flex items-center justify-between bg-panel-900 rounded p-3 border border-white/5">
            <div>
              <div className="text-sm">Microphone status</div>
              <div className={`text-[11px] ${active ? "text-panther-green" : permission === "denied" ? "text-panther-red" : "text-gray-400"}`}>
                {active ? "Connected" : permission === "denied" ? "Access denied" : "Not enabled"}
              </div>
            </div>
            <button onClick={() => void enableInput()} className="text-xs bg-accent hover:bg-accent-hover text-white rounded px-4 py-2">
              {active ? "Reconnect" : "Enable microphone"}
            </button>
          </section>

          {missingMic && (
            <div className="text-[11px] text-panther-red bg-panther-red/10 border border-panther-red/30 rounded p-2">
              ⚠ Your selected microphone is no longer available. Pick another device below or reconnect it.
            </div>
          )}

          {/* Devices */}
          <section className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Input device</label>
              <select
                value={selectedDeviceId ?? ""}
                onChange={(e) => void selectDevice(e.target.value)}
                className="w-full bg-panel-900 border border-white/10 rounded px-2 py-1.5 text-sm outline-none"
              >
                {devices.length === 0 && <option value="">No devices (enable mic)</option>}
                {devices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Output device</label>
              <select
                value={outputDeviceId ?? ""}
                onChange={(e) => void setOutputDevice(e.target.value)}
                disabled={!outputSupported}
                className="w-full bg-panel-900 border border-white/10 rounded px-2 py-1.5 text-sm outline-none disabled:opacity-50"
              >
                <option value="">System default</option>
                {outputDevices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Output ${i + 1}`}</option>
                ))}
              </select>
              {!outputSupported && (
                <div className="text-[10px] text-gray-500 mt-1">Output routing isn't supported in this runtime; uses the system default.</div>
              )}
            </div>
          </section>

          {/* Live meter + gain */}
          <section>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Live input level</span>
              <span className="font-mono">{gainToDb(inputGain)} dB gain</span>
            </div>
            <Meter level={inputLevel} vertical={false} className="w-full h-3" />
            <input type="range" min={0} max={2} step={0.01} value={inputGain} onChange={(e) => setInputGain(parseFloat(e.target.value))} className="w-full mt-2" />
          </section>

          {/* Tests */}
          <section className="grid grid-cols-3 gap-3">
            <div className="bg-panel-900 rounded p-3 border border-white/5">
              <div className="text-sm mb-1">Noise floor</div>
              <div className="text-[11px] text-gray-500 mb-2">Stay silent for 2s.</div>
              <button onClick={() => measure("noise", 2000)} disabled={measuring !== null} className="text-[11px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1 w-full disabled:opacity-50">
                {measuring === "noise" ? `Measuring ${Math.round(progress * 100)}%` : "Measure"}
              </button>
              {noiseDb != null && (
                <div className="mt-2">
                  <div className="font-mono text-sm">{noiseDb.toFixed(1)} dBFS</div>
                  <div className={`text-[10px] ${noiseVerdict(noiseDb)[1]}`}>{noiseVerdict(noiseDb)[0]}</div>
                </div>
              )}
            </div>
            <div className="bg-panel-900 rounded p-3 border border-white/5">
              <div className="text-sm mb-1">Room noise</div>
              <div className="text-[11px] text-gray-500 mb-2">Normal room, 3s.</div>
              <button onClick={() => measure("room", 3000)} disabled={measuring !== null} className="text-[11px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1 w-full disabled:opacity-50">
                {measuring === "room" ? `Measuring ${Math.round(progress * 100)}%` : "Measure"}
              </button>
              {roomDb != null && (
                <div className="mt-2">
                  <div className="font-mono text-sm">{roomDb.toFixed(1)} dBFS</div>
                  <div className={`text-[10px] ${noiseVerdict(roomDb)[1]}`}>{noiseVerdict(roomDb)[0]}</div>
                </div>
              )}
            </div>
            <div className="bg-panel-900 rounded p-3 border border-white/5">
              <div className="text-sm mb-1">Loudest level</div>
              <div className="text-[11px] text-gray-500 mb-2">Sing loud for 3s.</div>
              <button onClick={() => measure("level", 3000)} disabled={measuring !== null} className="text-[11px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1 w-full disabled:opacity-50">
                {measuring === "level" ? `Measuring ${Math.round(progress * 100)}%` : "Measure"}
              </button>
              {peakDb != null && (
                <div className="mt-2">
                  <div className="font-mono text-sm">{peakDb.toFixed(1)} dBFS peak</div>
                  <div className={`text-[10px] ${peakDb > -1 ? "text-panther-red" : peakDb > -6 ? "text-panther-gold" : "text-panther-green"}`}>
                    {peakDb > -1 ? "Too hot — lower gain." : peakDb > -6 ? "Good headroom." : "Could go louder."}
                  </div>
                </div>
              )}
            </div>
          </section>

          {(clipWarn || plosiveWarn) && (
            <div className="space-y-1">
              {clipWarn && <div className="text-[11px] text-panther-red">⚠ Clipping detected — lower input gain or back off the mic.</div>}
              {plosiveWarn && <div className="text-[11px] text-panther-gold">⚠ Plosives detected ("p"/"b" pops) — angle the mic or use a pop filter.</div>}
            </div>
          )}

          {/* Monitoring / headphone test */}
          <section className="bg-panel-900 rounded p-3 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">Headphone / output test</div>
                <div className="text-[11px] text-gray-500">Play a test tone through your selected output.</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => audioEngine.playTestTone(440)} className="text-xs bg-panel-700 hover:bg-panel-650 rounded px-3 py-1.5">L+R tone</button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">Input monitoring</div>
                <div className="text-[11px] text-panther-gold">⚠ Use headphones to avoid feedback.</div>
              </div>
              <button
                onClick={() => requestMonitor(!monitor)}
                className={`w-12 h-6 rounded-full relative transition-colors ${monitor ? "bg-panther-green" : "bg-panel-600"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${monitor ? "left-6" : "left-0.5"}`} />
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
