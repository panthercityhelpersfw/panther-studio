import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { gainToDb } from "../utils/format";
import { Meter } from "./Meter";

export function SetupWizard() {
  const open = useStore((s) => s.wizardOpen);
  const completeSetup = useStore((s) => s.completeSetup);
  const enableInput = useStore((s) => s.enableInput);
  const refreshDevices = useStore((s) => s.refreshDevices);
  const devices = useStore((s) => s.devices);
  const selectedDeviceId = useStore((s) => s.selectedDeviceId);
  const selectDevice = useStore((s) => s.selectDevice);
  const permission = useStore((s) => s.permission);
  const inputLevel = useStore((s) => s.inputLevel);
  const inputGain = useStore((s) => s.inputGain);
  const setInputGain = useStore((s) => s.setInputGain);
  const [step, setStep] = useState(0);
  const [peak, setPeak] = useState(0);

  // Track the loudest recent level for the calibration recommendation.
  useEffect(() => {
    if (step !== 1) return;
    setPeak((p) => Math.max(p * 0.95, inputLevel));
  }, [inputLevel, step]);

  useEffect(() => {
    if (open) void refreshDevices();
  }, [open, refreshDevices]);

  if (!open) return null;

  const good = peak >= 0.3 && peak <= 0.85;
  const tooLow = peak < 0.3;
  const recommendation = !peak
    ? "Sing or speak at your performance volume…"
    : tooLow
    ? "A bit quiet — move closer or raise input gain."
    : peak > 0.85
    ? "Too hot — lower the input gain to avoid clipping."
    : "Great level! You're ready to record.";

  return (
    <div className="fixed inset-0 bg-black/76 z-[60] flex items-center justify-center p-6">
      <div className="studio-modal w-[560px]">
        <div className="px-5 py-4 border-b border-black/40 flex items-center gap-3">
          <img src="/panther.svg" alt="" className="w-8 h-8 rounded" />
          <h2 className="text-lg font-semibold">Studio Setup</h2>
        </div>

        <div className="p-5 min-h-[260px]">
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-300">
                Panther Studio is a vocal-focused desktop DAW. Let's get your
                microphone set up so you can start recording.
              </p>
              <ul className="text-sm text-gray-400 space-y-1 list-disc pl-5">
                <li>Record vocals over a beat</li>
                <li>Apply vocal presets &amp; Auto-Enhance</li>
                <li>Mix, master, and export a real WAV</li>
              </ul>
              <p className="text-[11px] text-gray-500">You can change everything later in Preferences.</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium mb-1">1. Choose your microphone</div>
                <button onClick={() => void enableInput()} className="w-full bg-accent hover:bg-accent-hover text-white rounded py-2 text-sm">
                  {permission === "granted" ? "Microphone connected ✓ (reconnect)" : "Enable microphone"}
                </button>
                {permission === "granted" && (
                  <select value={selectedDeviceId ?? ""} onChange={(e) => void selectDevice(e.target.value)} className="w-full mt-2 bg-panel-900 border border-white/10 rounded px-2 py-1.5 text-sm">
                    {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
                  </select>
                )}
              </div>

              <div>
                <div className="text-sm font-medium mb-1">2. Calibrate your level</div>
                <Meter level={inputLevel} vertical={false} className="w-full h-3" />
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] text-gray-500 w-16">Input gain</span>
                  <input type="range" min={0} max={2} step={0.01} value={inputGain} onChange={(e) => setInputGain(parseFloat(e.target.value))} className="flex-1" />
                  <span className="text-[11px] font-mono text-gray-400 w-12 text-right">{gainToDb(inputGain)} dB</span>
                </div>
                <div className={`text-xs mt-2 ${good ? "text-panther-green" : tooLow ? "text-gray-400" : "text-panther-gold"}`}>
                  {recommendation}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="text-2xl">🎧</div>
              <p className="text-sm text-gray-300">
                One safety note: only enable <b>input monitoring</b> when wearing
                headphones — otherwise your mic will pick up the playback and cause
                feedback/echo. Panther Studio keeps monitoring off by default.
              </p>
              <p className="text-sm text-gray-400">You're all set. Create a project and hit record!</p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-black/40 flex justify-between">
          <button onClick={completeSetup} className="text-xs text-gray-400 hover:text-white">Skip</button>
          <div className="flex gap-2">
            {step > 0 && <button onClick={() => setStep(step - 1)} className="text-xs bg-panel-700 hover:bg-panel-650 rounded px-4 py-2">Back</button>}
            {step < 2 ? (
              <button onClick={() => setStep(step + 1)} className="text-xs bg-accent hover:bg-accent-hover text-white rounded px-4 py-2">Next</button>
            ) : (
              <button onClick={completeSetup} className="text-xs bg-panther-green text-black font-medium rounded px-4 py-2">Get started</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
