import { useMemo } from "react";
import { useStore } from "../state/store";

function roleOf(name: string, busId?: string | null, instrument?: string) {
  const n = name.toLowerCase();
  if (busId === "vocals" || n.includes("vocal") || n.includes("vox") || n.includes("lead")) return "vocal";
  if (busId === "drums" || n.includes("drum") || n.includes("kick") || n.includes("snare")) return "drum";
  if (n.includes("bass") || instrument === "bass") return "bass";
  if (n.includes("pad") || instrument === "pad") return "pad";
  if (n.includes("fx") || n.includes("delay") || n.includes("reverb")) return "fx";
  return "music";
}

const rolePosition = {
  vocal: { x: 50, y: 40, z: 1.0, color: "#f3d28a" },
  drum: { x: 50, y: 72, z: 0.9, color: "#39d3e0" },
  bass: { x: 50, y: 82, z: 0.75, color: "#3ddc97" },
  pad: { x: 26, y: 52, z: 0.45, color: "#8c6dff" },
  fx: { x: 76, y: 30, z: 0.35, color: "#ff7ad9" },
  music: { x: 68, y: 56, z: 0.55, color: "#4d8dff" },
};

export function HolographicMixView() {
  const project = useStore((s) => s.project);
  const meters = useStore((s) => s.meters);
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const selectTrack = useStore((s) => s.selectTrack);
  const tracks = useMemo(
    () =>
      project.tracks.map((track, index) => {
        const role = roleOf(track.name, track.busId, track.instrument);
        const base = rolePosition[role];
        const panOffset = track.pan * 24;
        const level = meters.tracks[track.id] ?? 0.04;
        return {
          track,
          role,
          x: Math.max(8, Math.min(92, base.x + panOffset + ((index % 3) - 1) * 4)),
          y: Math.max(12, Math.min(88, base.y + (index % 4) * 2)),
          size: 16 + level * 38 + base.z * 8,
          color: base.color,
          opacity: track.muted ? 0.22 : 0.65 + Math.min(0.3, level),
        };
      }),
    [meters.tracks, project.tracks]
  );

  return (
    <div className="flex-1 min-h-0 grid grid-cols-[1fr_280px] bg-panel-950">
      <div className="relative overflow-hidden holo-stage">
        <div className="holo-grid" />
        <div className="holo-depth-ring ring-a" />
        <div className="holo-depth-ring ring-b" />
        <div className="holo-axis x" />
        <div className="holo-axis y" />
        <div className="absolute left-5 top-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-gray-500">Holographic Mix</div>
          <div className="text-lg font-semibold text-white">Stereo Field</div>
        </div>
        <div className="absolute right-5 top-4 text-right text-[10px] text-gray-500">
          <div>Center: vocal focus</div>
          <div>Low/front: drums + bass</div>
          <div>Wide/back: pads + FX</div>
        </div>
        {tracks.map(({ track, x, y, size, color, opacity, role }) => (
          <button
            key={track.id}
            onClick={() => selectTrack(track.id)}
            className={`holo-node ${selectedTrackId === track.id ? "is-selected" : ""}`}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              background: color,
              opacity,
              boxShadow: `0 0 ${Math.round(size)}px ${color}55`,
            }}
            title={`${track.name} / ${role}`}
          >
            <span>{track.name.slice(0, 2).toUpperCase()}</span>
          </button>
        ))}
      </div>
      <div className="border-l border-white/5 p-3 overflow-auto">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-300">Spatial Readout</div>
        <div className="mt-3 space-y-2">
          {tracks.map(({ track, role, color }) => (
            <button
              key={track.id}
              onClick={() => selectTrack(track.id)}
              className="w-full flex items-center gap-2 text-left bg-panel-900 hover:bg-panel-850 border border-white/5 rounded px-2 py-2"
            >
              <span className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="text-xs text-white flex-1 truncate">{track.name}</span>
              <span className="text-[9px] uppercase text-gray-500">{role}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
