import { useEffect, useRef, useState } from "react";
import { audioEngine } from "../audio/AudioEngine";
import { computePeaksCached, drawWaveform, mixToMono } from "../audio/waveform";
import { useStore } from "../state/store";
import type { Clip as ClipModel } from "../state/types";

interface ClipProps {
  clip: ClipModel;
  color: string;
  height: number;
  pps: number;
  laneTop?: number;
}

const EDGE = 8; // px hit-zone for trim handles

export function Clip({ clip, color, height, pps, laneTop = 0 }: ClipProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selected = useStore((s) => s.selectedClipId === clip.id);
  const moveClip = useStore((s) => s.moveClip);
  const selectClip = useStore((s) => s.selectClip);
  const deleteClip = useStore((s) => s.deleteClip);
  const trimClipStart = useStore((s) => s.trimClipStart);
  const trimClipEnd = useStore((s) => s.trimClipEnd);
  const duplicateClip = useStore((s) => s.duplicateClip);
  const toggleClipMute = useStore((s) => s.toggleClipMute);
  const setClipFade = useStore((s) => s.setClipFade);
  const openPianoRoll = useStore((s) => s.openPianoRoll);
  const toggleClipLock = useStore((s) => s.toggleClipLock);
  const reverseClip = useStore((s) => s.reverseClip);
  const normalizeClipAudio = useStore((s) => s.normalizeClipAudio);
  const bounceClip = useStore((s) => s.bounceClip);
  const promoteTake = useStore((s) => s.promoteTake);
  const beatGrid = useStore((s) => s.project.beatIntelligence?.beatGrid ?? []);
  const [menu, setMenu] = useState(false);

  const width = Math.max(8, clip.durationSec * pps);
  const headerH = 15;
  const waveH = Math.max(4, height - 8 - headerH);
  const isMidi = clip.kind === "midi";

  // Draw waveform (audio) or note blocks (midi).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(waveH * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${waveH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, waveH);

    if (isMidi) {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(0, 0, width, waveH);
      const notes = clip.notes ?? [];
      if (notes.length) {
        const pitches = notes.map((n) => n.pitch);
        const lo = Math.min(...pitches) - 1;
        const hi = Math.max(...pitches) + 1;
        const span = Math.max(1, hi - lo);
        ctx.fillStyle = color;
        for (const n of notes) {
          const x = (n.startSec / clip.durationSec) * width;
          const w = Math.max(1.5, (n.durationSec / clip.durationSec) * width);
          const y = waveH - ((n.pitch - lo) / span) * waveH;
          ctx.fillRect(x, y - 1.5, w, 3);
        }
      }
      return;
    }

    const buffer = audioEngine.getBuffer(clip.assetId);
    if (!buffer) {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(0, 0, width, waveH);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "10px Inter";
      ctx.fillText("decoding…", 6, waveH / 2);
      return;
    }
    const mono = mixToMono(clip.assetId, buffer);
    const sr = buffer.sampleRate;
    const startSample = Math.floor(clip.offsetSec * sr);
    const endSample = Math.floor((clip.offsetSec + clip.durationSec) * sr);
    const columns = Math.max(1, Math.floor(width));
    const peaks = computePeaksCached(clip.assetId, mono, startSample, endSample, columns);
    drawWaveform(ctx, peaks, width, waveH, color, "rgba(8,10,14,0.72)");
  }, [clip.assetId, clip.offsetSec, clip.durationSec, clip.notes, width, waveH, color, isMidi]);

  // Generic horizontal-drag helper.
  const startDrag = (
    e: React.PointerEvent,
    onMove: (deltaSec: number, ev: PointerEvent) => void
  ) => {
    e.stopPropagation();
    const startX = e.clientX;
    const tgt = e.currentTarget as HTMLElement;
    tgt.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => onMove((ev.clientX - startX) / pps, ev);
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try {
        tgt.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onBodyDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    selectClip(clip.id);
    if (clip.locked) return;
    const origStart = clip.startSec;
    startDrag(e, (d) => moveClip(clip.id, Math.max(0, origStart + d)));
  };

  const fadeInPx = clip.fadeInSec * pps;
  const fadeOutPx = clip.fadeOutSec * pps;
  const clipBeatMarkers = beatGrid.filter((b) => b.timeSec >= clip.startSec && b.timeSec <= clip.startSec + clip.durationSec);

  return (
    <div
      onPointerDown={() => selectClip(clip.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        selectClip(clip.id);
        setMenu(true);
      }}
      onDoubleClick={() => isMidi && openPianoRoll(clip.id)}
      className={`absolute top-1 studio-clip overflow-hidden group ${
        selected ? "is-selected z-[5]" : ""
      } ${clip.muted ? "opacity-40" : ""}`}
      style={{ left: clip.startSec * pps, top: laneTop + 4, width, height: height - 8, background: "rgba(0,0,0,0.25)" }}
      title={isMidi ? `${clip.name} (double-click to edit notes)` : clip.name}
    >
      {/* header */}
      <div
        onPointerDown={onBodyDown}
        className="flex items-center justify-between px-2 text-[10px] font-semibold text-black/80 cursor-grab active:cursor-grabbing"
        style={{ height: headerH, background: clip.colorLabel ?? color }}
      >
        <span className={`truncate ${clip.muted ? "line-through" : ""}`}>
          {isMidi ? "♪ " : ""}
          {clip.locked ? "Lock " : ""}{clip.groupId ? "Grp " : ""}{clip.name}
        </span>
        <span className="ml-1 text-[9px] font-mono opacity-70">{clip.compRole === "chosen" ? "COMP" : clip.processedLabel ?? ""}</span>
      </div>

      {/* body (waveform / notes) — drag to move */}
      <div onPointerDown={onBodyDown} className="cursor-grab active:cursor-grabbing">
        <canvas ref={canvasRef} className="block" />
      </div>

      {clipBeatMarkers.map((beat) => (
        <div
          key={beat.id}
          className={`absolute pointer-events-none ${beat.downbeat ? "bg-panther-green/60" : "bg-white/20"}`}
          style={{
            top: headerH,
            bottom: 0,
            left: (beat.timeSec - clip.startSec) * pps,
            width: beat.downbeat ? 2 : 1,
          }}
          title={`AI beat ${beat.bar}.${beat.beat}`}
        />
      ))}

      {/* fade overlays */}
      {fadeInPx > 1 && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: 0,
            top: headerH,
            width: fadeInPx,
            height: waveH,
            background: "linear-gradient(to right, rgba(0,0,0,0.75), rgba(0,0,0,0))",
          }}
        />
      )}
      {fadeOutPx > 1 && (
        <div
          className="absolute pointer-events-none"
          style={{
            right: 0,
            top: headerH,
            width: fadeOutPx,
            height: waveH,
            background: "linear-gradient(to left, rgba(0,0,0,0.75), rgba(0,0,0,0))",
          }}
        />
      )}

      {/* fade handles (top corners) */}
      <div
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const orig = clip.fadeInSec;
          startDrag(e, (d) => setClipFade(clip.id, Math.max(0, orig + d), clip.fadeOutSec));
        }}
        className="absolute top-0 left-0 w-2.5 h-2.5 bg-white/70 rounded-br cursor-ew-resize opacity-0 group-hover:opacity-100"
        style={{ left: Math.max(0, fadeInPx - 4) }}
        title="Fade in"
      />
      <div
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const orig = clip.fadeOutSec;
          startDrag(e, (d) => setClipFade(clip.id, clip.fadeInSec, Math.max(0, orig - d)));
        }}
        className="absolute top-0 w-2.5 h-2.5 bg-white/70 rounded-bl cursor-ew-resize opacity-0 group-hover:opacity-100"
        style={{ right: Math.max(0, fadeOutPx - 4) }}
        title="Fade out"
      />

      {/* trim handles (edges) */}
      <div
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const orig = clip.startSec;
          startDrag(e, (d) => trimClipStart(clip.id, orig + d));
        }}
        className="absolute top-0 bottom-0 left-0 cursor-ew-resize hover:bg-white/20"
        style={{ width: EDGE }}
        title="Trim start"
      />
      <div
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const origEnd = clip.startSec + clip.durationSec;
          startDrag(e, (d) => trimClipEnd(clip.id, origEnd + d));
        }}
        className="absolute top-0 bottom-0 right-0 cursor-ew-resize hover:bg-white/20"
        style={{ width: EDGE }}
        title="Trim end"
      />

      {/* context menu */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} onContextMenu={(e) => { e.preventDefault(); setMenu(false); }} />
          <div className="absolute z-50 top-4 left-2 bg-panel-700 border border-white/10 rounded-md shadow-xl text-xs py-1 w-36">
            {isMidi && (
              <MenuItem label="Edit notes…" onClick={() => { openPianoRoll(clip.id); setMenu(false); }} />
            )}
            <MenuItem label={clip.locked ? "Unlock" : "Lock"} onClick={() => { toggleClipLock(clip.id); setMenu(false); }} />
            <MenuItem label="Promote take" onClick={() => { promoteTake(clip.id); setMenu(false); }} />
            {!isMidi && <MenuItem label="Reverse" onClick={() => { void reverseClip(clip.id); setMenu(false); }} />}
            {!isMidi && <MenuItem label="Normalize" onClick={() => { void normalizeClipAudio(clip.id); setMenu(false); }} />}
            <MenuItem label="Bounce to audio" onClick={() => { void bounceClip(clip.id); setMenu(false); }} />
            <MenuItem label="Duplicate" onClick={() => { duplicateClip(clip.id); setMenu(false); }} />
            <MenuItem label={clip.muted ? "Unmute" : "Mute"} onClick={() => { toggleClipMute(clip.id); setMenu(false); }} />
            <MenuItem label="Clear fades" onClick={() => { setClipFade(clip.id, 0, 0); setMenu(false); }} />
            <MenuItem label="Delete" danger onClick={() => { deleteClip(clip.id); setMenu(false); }} />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`block w-full text-left px-3 py-1 hover:bg-panel-650 ${
        danger ? "text-panther-red" : "text-gray-200"
      }`}
    >
      {label}
    </button>
  );
}
