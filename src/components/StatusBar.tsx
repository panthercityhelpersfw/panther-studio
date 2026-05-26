import { useEffect } from "react";
import { useStore } from "../state/store";

export function StatusBar() {
  const statusMessage = useStore((s) => s.statusMessage);
  const recording = useStore((s) => s.recording);
  const playing = useStore((s) => s.playing);
  const lastSaved = useStore((s) => s.lastSaved);
  const setStatus = useStore((s) => s.setStatus);
  const health = useStore((s) => s.performanceHealth ?? s.project.performanceHealth);

  // Auto-clear transient status messages.
  useEffect(() => {
    if (!statusMessage) return;
    const t = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(t);
  }, [statusMessage, setStatus]);

  return (
    <div className="h-6 shrink-0 bg-panel-900 border-t border-black/50 flex items-center px-3 gap-4 text-[11px] text-gray-500">
      <span className="flex items-center gap-1.5">
        <span
          className={`w-2 h-2 rounded-full ${
            recording
              ? "bg-panther-red rec-pulse"
              : playing
              ? "bg-panther-green"
              : "bg-gray-600"
          }`}
        />
        {recording ? "Recording" : playing ? "Playing" : "Ready"}
      </span>
      <span className="flex-1 text-gray-400">{statusMessage}</span>
      {health && (
        <span className={health.risk === "low" ? "text-panther-green" : health.risk === "medium" ? "text-panther-gold" : "text-panther-red"}>
          Health {health.score}/100
        </span>
      )}
      {lastSaved && (
        <span>Saved {new Date(lastSaved).toLocaleTimeString()}</span>
      )}
    </div>
  );
}
