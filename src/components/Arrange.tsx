import { useLayoutEffect, useRef } from "react";
import { useStore } from "../state/store";
import { Clip } from "./Clip";
import { EditToolbar } from "./EditToolbar";
import { TrackHeader } from "./TrackHeader";

const HEADER_W = 232;

export function Arrange() {
  const project = useStore((s) => s.project);
  const pps = useStore((s) => s.pixelsPerSecond);
  const positionSec = useStore((s) => s.positionSec);
  const snapEnabled = useStore((s) => s.snapEnabled);
  const snapSec = useStore((s) => s.snapSec);
  const seek = useStore((s) => s.seek);
  const addTrack = useStore((s) => s.addTrack);
  const addMidiClip = useStore((s) => s.addMidiClip);
  const setLoopRegion = useStore((s) => s.setLoopRegion);
  const jumpToMarker = useStore((s) => s.jumpToMarker);
  const deleteMarker = useStore((s) => s.deleteMarker);
  const importBeatResultToTimeline = useStore((s) => s.importBeatResultToTimeline);

  const lanesRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const headersRef = useRef<HTMLDivElement>(null);

  const secPerBeat = 60 / project.tempo;
  const secPerBar = secPerBeat * 4;

  const contentSec = Math.max(
    project.lengthSec,
    positionSec + 30,
    project.loop.endSec + 5,
    ...project.clips.map((c) => c.startSec + c.durationSec + 10)
  );
  const contentWidth = contentSec * pps;
  const sections = project.markers
    .filter((m) => m.kind === "section")
    .sort((a, b) => a.timeSec - b.timeSec)
    .map((m, i, arr) => {
      const end = arr[i + 1]?.timeSec ?? contentSec;
      const clips = project.clips.filter((c) => c.startSec < end && c.startSec + c.durationSec > m.timeSec);
      const midiNotes = clips.reduce((sum, c) => sum + (c.notes?.length ?? 0), 0);
      const audioDur = clips.filter((c) => c.kind === "audio").reduce((sum, c) => sum + c.durationSec, 0);
      const energy = Math.min(1, clips.length * 0.12 + midiNotes * 0.006 + (audioDur / Math.max(1, end - m.timeSec)) * 0.18);
      return { ...m, end, energy };
    });
  const beatMarkers = project.beatIntelligence?.beatGrid.filter((b) => b.timeSec <= contentSec) ?? [];

  const onLanesScroll = () => {
    const lanes = lanesRef.current;
    if (!lanes) return;
    if (rulerRef.current) rulerRef.current.scrollLeft = lanes.scrollLeft;
    if (headersRef.current) headersRef.current.scrollTop = lanes.scrollTop;
  };
  useLayoutEffect(() => {
    onLanesScroll();
  });

  const secFromClientX = (clientX: number) => {
    const lanes = lanesRef.current;
    if (!lanes) return 0;
    const rect = lanes.getBoundingClientRect();
    let sec = (clientX - rect.left + lanes.scrollLeft) / pps;
    if (snapEnabled) sec = Math.round(sec / snapSec) * snapSec;
    return Math.max(0, sec);
  };

  // Bar lines for the grid (subdivided by the snap grid).
  const bars: number[] = [];
  for (let s = 0; s <= contentSec; s += secPerBar) bars.push(s);
  const subLines: number[] = [];
  if (snapEnabled && snapSec * pps >= 6) {
    for (let s = 0; s <= contentSec; s += snapSec) subLines.push(s);
  }

  // Loop-strip drag to define the loop region.
  const onLoopStripDown = (e: React.PointerEvent) => {
    const start = secFromClientX(e.clientX);
    const move = (ev: PointerEvent) => {
      const cur = secFromClientX(ev.clientX);
      setLoopRegion(Math.min(start, cur), Math.max(start, cur));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden studio-arrange min-h-0">
      <EditToolbar />

      {/* Ruler row */}
      <div className="flex h-9 shrink-0 studio-ruler">
        <div
          className="shrink-0 flex items-center justify-between px-3 studio-ruler__tracks"
          style={{ width: HEADER_W }}
        >
          <span className="studio-label">TRACKS</span>
          <button
            onClick={() => addTrack()}
            className="studio-mini-command"
            title="Add track"
          >
            + Track
          </button>
        </div>
        <div ref={rulerRef} className="flex-1 overflow-hidden relative">
          <div className="relative h-full" style={{ width: contentWidth }}>
            {/* clickable ruler for seeking */}
            <div
              className="absolute inset-x-0 top-0 h-4 cursor-text"
              onPointerDown={(e) => seek(secFromClientX(e.clientX))}
            >
              {bars.map((s, i) => (
                <div key={s} className="absolute top-0 h-full border-l border-white/15" style={{ left: s * pps }}>
                  <span className="text-[9px] text-gray-500 ml-1 font-mono">{i + 1}</span>
                </div>
              ))}
            </div>

            {/* markers */}
            {project.markers.map((m) => (
              <div
                key={m.id}
                className="absolute top-0 h-4 group/marker"
                style={{ left: m.timeSec * pps }}
              >
                <button
                  onClick={() => jumpToMarker(m.id)}
                  className="absolute -top-0 left-0 text-[9px] px-1 rounded-sm whitespace-nowrap"
                  style={{ background: m.color, color: "#0b0d12" }}
                  title={`${m.kind}: ${m.name}`}
                >
                  {m.kind === "section" ? "▣" : "⚑"} {m.name}
                </button>
                <button
                  onClick={() => deleteMarker(m.id)}
                  className="absolute -top-0 -right-3 text-[9px] text-gray-500 opacity-0 group-hover/marker:opacity-100"
                  title="Delete marker"
                >
                  ✕
                </button>
              </div>
            ))}

            {/* vocal coach markers */}
            {(project.coachNotes ?? []).map((cn) => (
              <button
                key={cn.id}
                onClick={() => {
                  setLoopRegion(Math.max(0, cn.timeSec - 0.25), cn.timeSec + 1.25);
                  seek(cn.timeSec);
                }}
                className="absolute top-4 text-[9px] leading-none"
                style={{ left: cn.timeSec * pps, color: cn.severity === "bad" ? "#ff5d6c" : cn.severity === "warn" ? "#e8b341" : "#39d3e0" }}
                title={`${cn.text} / click to replay this section`}
              >
                🎯
              </button>
            ))}

            {/* loop strip */}
            <div
              className="absolute inset-x-0 bottom-0 h-3 studio-loop-strip cursor-ew-resize"
              onPointerDown={onLoopStripDown}
              title="Drag to set loop region"
            >
              {project.loop.enabled && (
                <div
                  className="absolute top-0 bottom-0 studio-loop-region"
                  style={{
                    left: project.loop.startSec * pps,
                    width: Math.max(2, (project.loop.endSec - project.loop.startSec) * pps),
                  }}
                />
              )}
            </div>

            {/* session energy lane */}
            {sections.map((s) => (
              <div
                key={`energy-${s.id}`}
                className="absolute bottom-0 h-1.5 rounded-sm pointer-events-none"
                style={{
                  left: s.timeSec * pps,
                  width: Math.max(2, (s.end - s.timeSec) * pps),
                  background: `linear-gradient(90deg, rgba(61,220,151,${0.15 + s.energy * 0.45}), rgba(232,179,65,${0.12 + s.energy * 0.55}), rgba(255,93,108,${Math.max(0, s.energy - 0.62)}))`,
                }}
                title={`${s.name} energy ${Math.round(s.energy * 100)}`}
              />
            ))}

            {/* Beat Intelligence grid markers */}
            {beatMarkers.map((b) => (
              <div
                key={`beat-ruler-${b.id}`}
                className={`absolute bottom-0 top-4 pointer-events-none ${b.downbeat ? "bg-panther-green/45" : "bg-white/10"}`}
                style={{ left: b.timeSec * pps, width: b.downbeat ? 2 : 1, opacity: b.downbeat ? 0.9 : 0.45 }}
                title={`AI beat grid: bar ${b.bar}, beat ${b.beat}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div
          ref={headersRef}
          className="shrink-0 overflow-hidden studio-track-headers"
          style={{ width: HEADER_W }}
        >
          {project.tracks.map((t) => (
            <TrackHeader key={t.id} track={t} height={t.height} />
          ))}
          {project.tracks.length === 0 && (
            <div className="p-4 text-xs text-gray-500">No tracks yet.</div>
          )}
        </div>

        <div
          ref={lanesRef}
          onScroll={onLanesScroll}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("application/x-panther-beat-result")) e.preventDefault();
          }}
          onDrop={(e) => {
            const resultId = e.dataTransfer.getData("application/x-panther-beat-result");
            if (!resultId) return;
            e.preventDefault();
            void importBeatResultToTimeline(resultId, secFromClientX(e.clientX));
          }}
          className="flex-1 overflow-auto relative"
        >
          <div className="relative" style={{ width: contentWidth }}>
            {/* sub-grid lines */}
            {subLines.map((s) => (
              <div key={"sub" + s} className="absolute top-0 bottom-0 border-l border-white/[0.03]" style={{ left: s * pps }} />
            ))}
            {/* bar lines */}
            {bars.map((s) => (
              <div key={"bar" + s} className="absolute top-0 bottom-0 border-l border-white/[0.08]" style={{ left: s * pps }} />
            ))}

            {/* loop region shading across lanes */}
            {project.loop.enabled && (
              <div
                className="absolute top-0 bottom-0 bg-accent/[0.06] pointer-events-none"
                style={{
                  left: project.loop.startSec * pps,
                  width: Math.max(0, (project.loop.endSec - project.loop.startSec) * pps),
                }}
              />
            )}

            {/* AI beat grid guides across lanes */}
            {beatMarkers.map((b) => (
              <div
                key={`beat-lane-${b.id}`}
                className={`absolute top-0 bottom-0 pointer-events-none ${b.downbeat ? "bg-panther-green/35" : "bg-white/[0.055]"}`}
                style={{ left: b.timeSec * pps, width: b.downbeat ? 2 : 1 }}
              />
            ))}

            {project.tracks.map((track) => (
              <div
                key={track.id}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) seek(secFromClientX(e.clientX));
                }}
                onDoubleClick={(e) => {
                  if (e.target === e.currentTarget) addMidiClip(track.id, secFromClientX(e.clientX));
                }}
                className="relative studio-lane"
                style={{ height: track.height }}
                title="Double-click empty space to add a MIDI clip"
              >
                {(() => {
                  const clips = project.clips.filter((c) => c.trackId === track.id);
                  const laneCount = Math.max(1, ...clips.map((clip) => clip.takeLane ?? clip.take ?? 1));
                  const laneHeight = track.height / laneCount;
                  return clips.map((clip) => {
                    const lane = Math.max(1, clip.takeLane ?? clip.take ?? 1);
                    return (
                      <Clip
                        key={clip.id}
                        clip={clip}
                        color={track.color}
                        height={laneHeight}
                        laneTop={(lane - 1) * laneHeight}
                        pps={pps}
                      />
                    );
                  });
                })()}
              </div>
            ))}

            {/* Empty-state hint */}
            {project.clips.length === 0 && (
              <div className="absolute left-6 top-6 pointer-events-none text-xs text-gray-500 max-w-xs">
                <div className="font-medium text-gray-400 mb-1">This timeline is empty.</div>
                <div>• <b>Import Beat</b> to drop a backing track</div>
                <div>• Arm a track and press <b>R</b> to record vocals</div>
                <div>• Double-click a lane to add a MIDI clip</div>
              </div>
            )}

            {/* markers full-height guide */}
            {project.markers.map((m) => (
              <div
                key={"mg" + m.id}
                className="absolute top-0 bottom-0 w-px pointer-events-none"
                style={{ left: m.timeSec * pps, background: m.color, opacity: 0.3 }}
              />
            ))}

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-px bg-panther-gold pointer-events-none z-10 studio-playhead"
              style={{ left: positionSec * pps }}
            >
              <div className="absolute -top-0 -left-1 w-2 h-2 bg-panther-gold rotate-45" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
