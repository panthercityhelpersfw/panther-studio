import { useStore } from "../state/store";
import type { AutomationLane, AutomationTarget } from "../state/types";

const TARGETS: { label: string; target: AutomationTarget; scoped: boolean }[] = [
  { label: "Volume", target: "track.volume", scoped: true },
  { label: "Pan", target: "track.pan", scoped: true },
  { label: "EQ Low", target: "effect.eq.lowGain", scoped: true },
  { label: "EQ Mid", target: "effect.eq.midGain", scoped: true },
  { label: "EQ Air", target: "effect.eq.highGain", scoped: true },
  { label: "Reverb Mix", target: "effect.reverb.mix", scoped: true },
  { label: "Delay Mix", target: "effect.delay.mix", scoped: true },
  { label: "Master", target: "master.volume", scoped: false },
  { label: "Width", target: "master.width", scoped: false },
];

function valueLabel(lane: AutomationLane, value: number) {
  if (lane.target.includes("pan")) return value < -0.02 ? `L${Math.round(Math.abs(value) * 100)}` : value > 0.02 ? `R${Math.round(value * 100)}` : "C";
  if (lane.target.includes("Gain") || lane.target.includes("threshold")) return `${value.toFixed(1)} dB`;
  return value.toFixed(2);
}

export function AutomationPanel() {
  const project = useStore((s) => s.project);
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const positionSec = useStore((s) => s.positionSec);
  const addLane = useStore((s) => s.addAutomationLane);
  const addPoint = useStore((s) => s.addAutomationPoint);
  const movePoint = useStore((s) => s.moveAutomationPoint);
  const deletePoint = useStore((s) => s.deleteAutomationPoint);
  const toggleLane = useStore((s) => s.toggleAutomationLane);

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-panel-900/35">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-wide">Automation</h3>
          <p className="text-[11px] text-gray-500">Draw points for track volume, pan, FX parameters, and master moves. Volume and pan render into WAV export.</p>
        </div>
        <div className="flex flex-wrap gap-1 justify-end">
          {TARGETS.map((t) => (
            <button
              key={t.target}
              onClick={() => addLane(t.target, t.scoped ? selectedTrackId : null)}
              disabled={t.scoped && !selectedTrackId}
              className="text-[10px] bg-panel-800 hover:bg-panel-750 disabled:opacity-40 border border-white/10 rounded px-2 py-1"
            >
              + {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {(project.automation ?? []).map((lane) => (
          <div key={lane.id} className="bg-panel-850 border border-white/5 rounded-md p-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm" style={{ background: lane.color }} />
              <span className="text-xs font-semibold flex-1 truncate">{lane.name}</span>
              <button onClick={() => toggleLane(lane.id)} className={`text-[10px] rounded px-2 py-0.5 ${lane.enabled ? "bg-accent text-white" : "bg-panel-700 text-gray-400"}`}>
                {lane.enabled ? "On" : "Bypassed"}
              </button>
              <button
                onClick={() => addPoint(lane.id, positionSec, lane.points[lane.points.length - 1]?.value ?? (lane.target.includes("pan") ? 0 : 1))}
                className="text-[10px] bg-panel-750 hover:bg-panel-700 rounded px-2 py-0.5"
              >
                Add @ playhead
              </button>
            </div>
            <div className="mt-2 space-y-1">
              {lane.points.map((pt) => (
                <div key={pt.id} className="grid grid-cols-[52px_1fr_58px_20px] items-center gap-2 text-[10px]">
                  <input
                    type="number"
                    min={0}
                    step={0.05}
                    value={pt.timeSec}
                    onChange={(e) => movePoint(lane.id, pt.id, parseFloat(e.target.value), pt.value)}
                    className="bg-panel-950 border border-white/10 rounded px-1 py-0.5"
                  />
                  <input
                    type="range"
                    min={lane.min}
                    max={lane.max}
                    step={0.01}
                    value={pt.value}
                    onChange={(e) => movePoint(lane.id, pt.id, pt.timeSec, parseFloat(e.target.value))}
                  />
                  <span className="font-mono text-gray-400">{valueLabel(lane, pt.value)}</span>
                  <button onClick={() => deletePoint(lane.id, pt.id)} className="text-gray-500 hover:text-panther-red">X</button>
                </div>
              ))}
              {lane.points.length === 0 && <div className="text-[11px] text-gray-600">No points yet. Add a point at the playhead, then drag its value.</div>}
            </div>
          </div>
        ))}
        {(project.automation ?? []).length === 0 && (
          <div className="border border-dashed border-white/10 rounded-md p-5 text-center text-xs text-gray-500">
            Select a track and add a lane to start writing automation.
          </div>
        )}
      </div>
    </div>
  );
}
