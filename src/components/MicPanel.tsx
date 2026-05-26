import { useEffect } from "react";
import { useStore } from "../state/store";
import { gainToDb } from "../utils/format";
import { Meter } from "./Meter";

export function MicPanel() {
  const {
    micPanelOpen,
    setMicPanelOpen,
    devices,
    selectedDeviceId,
    permission,
    inputLevel,
    inputGain,
    monitor,
    monitorMode,
    setMonitorMode,
    enableInput,
    refreshDevices,
    selectDevice,
    setInputGain,
    requestMonitor,
  } = useStore();

  useEffect(() => {
    if (micPanelOpen) void refreshDevices();
  }, [micPanelOpen, refreshDevices]);

  if (!micPanelOpen) return null;

  const active = permission === "granted";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-30"
        onClick={() => setMicPanelOpen(false)}
      />
      <div className="fixed right-0 top-0 bottom-0 w-80 bg-panel-800 border-l border-black/50 z-40 shadow-2xl flex flex-col">
        <div className="h-12 px-4 flex items-center justify-between border-b border-black/40">
          <span className="font-semibold">🎙 Microphone & Input</span>
          <button
            onClick={() => setMicPanelOpen(false)}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto">
          {/* Permission */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">Status</span>
              <span
                className={`text-xs font-medium ${
                  active
                    ? "text-panther-green"
                    : permission === "denied"
                    ? "text-panther-red"
                    : "text-gray-400"
                }`}
              >
                {active ? "Connected" : permission === "denied" ? "Denied" : "Not enabled"}
              </span>
            </div>
            <button
              onClick={() => void enableInput()}
              className="w-full bg-accent hover:bg-accent-hover text-white rounded py-2 text-sm"
            >
              {active ? "Reconnect microphone" : "Enable microphone"}
            </button>
            {permission === "denied" && (
              <p className="text-[11px] text-panther-red mt-2">
                Access was blocked. Allow microphone access in your system
                settings, then click Enable again.
              </p>
            )}
          </section>

          {/* Device */}
          <section>
            <label className="text-xs text-gray-400 block mb-1">Input device</label>
            <select
              value={selectedDeviceId ?? ""}
              onChange={(e) => void selectDevice(e.target.value)}
              className="w-full bg-panel-900 border border-white/10 rounded px-2 py-1.5 text-sm outline-none"
            >
              {devices.length === 0 && <option value="">No devices found</option>}
              {devices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Microphone ${i + 1}`}
                </option>
              ))}
            </select>
          </section>

          {/* Input meter */}
          <section>
            <label className="text-xs text-gray-400 block mb-1">Input level</label>
            <Meter level={inputLevel} vertical={false} className="w-full h-3" />
          </section>

          {/* Input gain */}
          <section>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Input gain</span>
              <span className="font-mono">{gainToDb(inputGain)} dB</span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={inputGain}
              onChange={(e) => setInputGain(parseFloat(e.target.value))}
              className="w-full"
            />
          </section>

          {/* Monitor */}
          <section className="bg-panel-900 rounded p-3 border border-white/5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">Input monitoring</div>
                <div className="text-[11px] text-gray-500">
                  Hear yourself through outputs
                </div>
              </div>
              <button
                onClick={() => requestMonitor(!monitor)}
                className={`w-12 h-6 rounded-full relative transition-colors ${
                  monitor ? "bg-panther-green" : "bg-panel-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${
                    monitor ? "left-6" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <span className="text-[11px] text-gray-400">Monitor through</span>
              <div className="flex rounded overflow-hidden border border-white/10">
                <button
                  onClick={() => setMonitorMode("dry")}
                  className={`px-2 py-0.5 text-[11px] ${
                    monitorMode === "dry" ? "bg-accent text-white" : "bg-panel-800 text-gray-400"
                  }`}
                >
                  Dry
                </button>
                <button
                  onClick={() => setMonitorMode("wet")}
                  className={`px-2 py-0.5 text-[11px] ${
                    monitorMode === "wet" ? "bg-accent text-white" : "bg-panel-800 text-gray-400"
                  }`}
                  title="Hear the armed track's effect chain while monitoring"
                >
                  Wet (FX)
                </button>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              Wet routes your mic through the armed track's vocal chain.
            </p>
            <p className="text-[11px] text-panther-gold mt-2">
              ⚠ Use headphones when monitoring to avoid feedback/echo.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
