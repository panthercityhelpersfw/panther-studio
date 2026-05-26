import { useState } from "react";
import { useStore } from "../state/store";
import { INSTRUMENT_LABELS, TRACK_COLORS, type InstrumentId, type Track } from "../state/types";
import { gainToDb, panLabel } from "../utils/format";
import { Meter } from "./Meter";

const INSTRUMENTS: InstrumentId[] = ["synth", "piano", "epiano", "bass", "lead", "pad", "pluck", "drumkit"];

function MiniBtn({
  label,
  active,
  color,
  title,
  onClick,
}: {
  label: string;
  active: boolean;
  color: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="w-6 h-6 rounded-sm text-[11px] font-bold transition-colors"
      style={{
        background: active ? color : "#202634",
        color: active ? "#0b0d12" : "#9aa6b8",
      }}
    >
      {label}
    </button>
  );
}

export function TrackHeader({ track, height }: { track: Track; height: number }) {
  const selected = useStore((s) => s.selectedTrackId === track.id);
  const level = useStore((s) => s.meters.tracks[track.id] ?? 0);
  const {
    selectTrack,
    renameTrack,
    toggleArm,
    toggleMute,
    toggleSolo,
    setTrackGain,
    setTrackPan,
    setTrackColor,
    deleteTrack,
    setTrackInstrument,
    setTrackBus,
    freezeTrack,
    unfreezeTrack,
    bounceTrack,
  } = useStore();
  const buses = useStore((s) => s.project.buses ?? []);
  const processing = useStore((s) => s.processing);
  const hasMidi = useStore((s) => s.project.clips.some((c) => c.trackId === track.id && c.kind === "midi"));
  const [editing, setEditing] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div
      onPointerDown={() => selectTrack(track.id)}
      className={`relative flex studio-track-header ${selected ? "is-selected" : ""}`}
      style={{ height }}
    >
      <div className="w-1 shrink-0 studio-track-color" style={{ background: track.color }} />
      <div className="flex-1 px-2 py-1.5 flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPaletteOpen((v) => !v);
            }}
            className="w-3 h-3 rounded-sm shrink-0 border border-black/40"
            style={{ background: track.color }}
            title="Track color"
          />
          {editing ? (
            <input
              autoFocus
              defaultValue={track.name}
              onBlur={(e) => {
                renameTrack(track.id, e.target.value || track.name);
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="bg-panel-900 text-sm px-1 rounded w-full outline-none border border-accent/50"
            />
          ) : (
            <span
              onDoubleClick={() => setEditing(true)}
              className="text-sm font-medium truncate flex-1"
              title="Double-click to rename"
            >
              {track.name}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (track.frozen) unfreezeTrack(track.id);
              else void freezeTrack(track.id);
            }}
            disabled={processing}
            className={`text-xs px-1 ${track.frozen ? "text-panther-cyan" : "text-gray-500 hover:text-panther-cyan"}`}
            title={track.frozen ? "Unfreeze track" : "Freeze track (render FX to audio, save CPU)"}
          >
            ❄
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteTrack(track.id);
            }}
            className="text-gray-500 hover:text-panther-red text-xs px-1"
            title="Delete track"
          >
            ✕
          </button>
        </div>

        {paletteOpen && (
          <div className="absolute z-20 top-7 left-2 bg-panel-700 p-1.5 rounded-md shadow-xl flex gap-1 flex-wrap w-40 border border-white/10">
            {TRACK_COLORS.map((c) => (
              <button
                key={c.hex}
                onClick={(e) => {
                  e.stopPropagation();
                  setTrackColor(track.id, c.hex);
                  setPaletteOpen(false);
                }}
                className="w-5 h-5 rounded-full border border-black/40"
                style={{ background: c.hex }}
                title={c.name}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-1">
          <MiniBtn
            label="R"
            active={track.armed}
            color="#ff5d6c"
            title="Arm for recording"
            onClick={() => toggleArm(track.id)}
          />
          <MiniBtn
            label="M"
            active={track.muted}
            color="#e8b341"
            title="Mute"
            onClick={() => toggleMute(track.id)}
          />
          <MiniBtn
            label="S"
            active={track.soloed}
            color="#3ddc97"
            title="Solo"
            onClick={() => toggleSolo(track.id)}
          />
          <div className="flex-1" />
          <div className="h-6 w-1.5">
            <Meter level={level} className="w-1.5 h-full" />
          </div>
        </div>

        {height >= 88 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-1">
              <span className="text-[9px] text-gray-500 w-5">Vol</span>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.01}
                value={track.gain}
                onChange={(e) => setTrackGain(track.id, parseFloat(e.target.value))}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex-1"
              />
              <span className="text-[9px] font-mono text-gray-400 w-8 text-right">
                {gainToDb(track.gain)}
              </span>
            </div>
          </div>
        )}
        {height >= 88 && (
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-gray-500 w-5">Pan</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={track.pan}
              onChange={(e) => setTrackPan(track.id, parseFloat(e.target.value))}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex-1"
            />
            <span className="text-[9px] font-mono text-gray-400 w-8 text-right">
              {panLabel(track.pan)}
            </span>
          </div>
        )}
        {height >= 88 && (
          <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
            {hasMidi && (
              <select
                value={track.instrument ?? "synth"}
                onChange={(e) => setTrackInstrument(track.id, e.target.value as InstrumentId)}
                className="flex-1 bg-panel-900 border border-white/10 rounded px-1 py-0.5 text-[9px] outline-none"
                title="Instrument for this track's MIDI"
              >
                {INSTRUMENTS.map((i) => <option key={i} value={i}>{INSTRUMENT_LABELS[i]}</option>)}
              </select>
            )}
            <select
              value={track.busId ?? ""}
              onChange={(e) => setTrackBus(track.id, e.target.value || null)}
              className="flex-1 bg-panel-900 border border-white/10 rounded px-1 py-0.5 text-[9px] outline-none"
              title="Mix bus"
            >
              <option value="">Master</option>
              {buses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button
              onClick={() => void bounceTrack(track.id)}
              disabled={processing}
              className="text-[9px] bg-panel-700 hover:bg-panel-650 rounded px-1.5 py-0.5 shrink-0 disabled:opacity-50"
              title="Bounce this track to a new audio track"
            >
              Bnce
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
