import { useStore } from "../state/store";
import type { LoudnessResult } from "../audio/loudness";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" | "warn" }) {
  return (
    <div className="bg-panel-900 rounded p-2 border border-white/5">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className={`text-sm font-mono ${tone === "bad" ? "text-panther-red" : tone === "warn" ? "text-panther-gold" : "text-gray-200"}`}>{value}</div>
    </div>
  );
}

function Body({ loud, title }: { loud: LoudnessResult; title: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-gray-400 mb-2">{title}</h3>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Peak" value={`${loud.peakDb.toFixed(1)} dBFS`} tone={loud.peak >= 0.999 ? "bad" : undefined} />
          <Stat label="RMS" value={`${loud.rmsDb.toFixed(1)} dBFS`} />
          <Stat label="Approx LUFS" value={`${loud.lufsApprox.toFixed(1)}`} />
          <Stat label="Clipped" value={`${loud.clippedPct.toFixed(2)}%`} tone={loud.clippedPct > 0.01 ? "bad" : undefined} />
        </div>
        <div className="text-[10px] text-gray-600 mt-1">
          LUFS is an approximate, ungated K-weighted estimate — not a certified measurement.
        </div>
      </div>
      <div className="space-y-1">
        {loud.warnings.map((w, i) => (
          <div key={i} className={`text-sm flex gap-2 ${w.severity === "bad" ? "text-panther-red" : w.severity === "warn" ? "text-panther-gold" : "text-panther-green"}`}>
            <span>{w.severity === "ok" ? "✓" : "⚠"}</span>
            <span>{w.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoudnessReport() {
  const report = useStore((s) => s.loudnessReport);
  const dismiss = useStore((s) => s.dismissLoudnessReport);
  if (!report) return null;
  return (
    <Modal title="Loudness Analysis" onClose={dismiss}>
      <Body loud={report} title="Measured mix" />
    </Modal>
  );
}

export function MasterReport() {
  const report = useStore((s) => s.masterReport);
  const dismiss = useStore((s) => s.dismissMasterReport);
  if (!report) return null;
  return (
    <Modal title="Auto Master" onClose={dismiss}>
      <Body loud={report.loud} title="Mix analyzed (pre-master)" />
      <div className="mt-4">
        <h3 className="text-xs font-semibold text-gray-400 mb-2">What I changed</h3>
        <ul className="space-y-1">
          {report.changes.map((c, i) => (
            <li key={i} className="text-sm text-gray-200 flex gap-2">
              <span className="text-panther-green">✓</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
      <div className="bg-panel-800 rounded-lg border border-white/10 shadow-2xl w-[560px] max-h-[80vh] flex flex-col">
        <div className="px-5 py-3 border-b border-black/40 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        <div className="px-5 py-3 border-t border-black/40 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded text-sm bg-accent hover:bg-accent-hover text-white">Done</button>
        </div>
      </div>
    </div>
  );
}
