import { useRef } from "react";
import { useStore } from "../state/store";

function Btn({
  onClick,
  title,
  active,
  disabled,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`studio-edit-btn ${active ? "is-active" : ""}`}
    >
      {children}
    </button>
  );
}

const GRID_OPTIONS: { label: string; beats: number }[] = [
  { label: "1/1", beats: 4 },
  { label: "1/2", beats: 2 },
  { label: "1/4", beats: 1 },
  { label: "1/8", beats: 0.5 },
  { label: "1/16", beats: 0.25 },
];

export function EditToolbar() {
  const importFiles = useStore((s) => s.importFiles);
  const splitClipAtPlayhead = useStore((s) => s.splitClipAtPlayhead);
  const duplicateClip = useStore((s) => s.duplicateClip);
  const selectedClipId = useStore((s) => s.selectedClipId);
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const addMidiClip = useStore((s) => s.addMidiClip);
  const positionSec = useStore((s) => s.positionSec);
  const loop = useStore((s) => s.project.loop);
  const toggleLoop = useStore((s) => s.toggleLoop);
  const gridDivision = useStore((s) => s.gridDivision);
  const setGridDivision = useStore((s) => s.setGridDivision);
  const addMarker = useStore((s) => s.addMarker);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);

  const audioInput = useRef<HTMLInputElement>(null);
  const beatInput = useRef<HTMLInputElement>(null);

  const gridValue = GRID_OPTIONS.find((g) => g.beats === gridDivision)?.beats ?? 1;

  return (
    <div className="studio-edit-toolbar">
      <input
        ref={audioInput}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void importFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={beatInput}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void importFiles(e.target.files, { asBeat: true });
          e.target.value = "";
        }}
      />

      <Btn onClick={() => beatInput.current?.click()} title="Import a beat onto a new track">
        🎵 Import Beat
      </Btn>
      <Btn onClick={() => audioInput.current?.click()} title="Import audio to the selected track at the playhead">
        ⬇ Import Audio
      </Btn>

      <div className="w-px h-5 bg-white/10 mx-0.5" />

      <Btn onClick={splitClipAtPlayhead} title="Split clip at playhead (S)">
        ✂ Split
      </Btn>
      <Btn
        onClick={() => selectedClipId && duplicateClip(selectedClipId)}
        disabled={!selectedClipId}
        title="Duplicate selected clip"
      >
        ⧉ Duplicate
      </Btn>
      <Btn
        onClick={() => selectedTrackId && addMidiClip(selectedTrackId, positionSec)}
        disabled={!selectedTrackId}
        title="Add a MIDI clip on the selected track"
      >
        ♪ + MIDI
      </Btn>

      <div className="w-px h-5 bg-white/10 mx-0.5" />

      <Btn onClick={toggleLoop} active={loop.enabled} title="Toggle loop playback (L)">
        ⟲ Loop
      </Btn>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-500">Grid</span>
        <select
          value={gridValue}
          onChange={(e) => setGridDivision(parseFloat(e.target.value))}
          className="h-7 bg-panel-900 border border-white/10 rounded text-[11px] px-1 outline-none"
          title="Snap grid resolution"
        >
          {GRID_OPTIONS.map((g) => (
            <option key={g.label} value={g.beats}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      <div className="w-px h-5 bg-white/10 mx-0.5" />

      <Btn onClick={() => addMarker("marker")} title="Add marker at playhead">
        ⚑ Marker
      </Btn>
      <Btn onClick={() => addMarker("section")} title="Add section at playhead">
        ▣ Section
      </Btn>

      <div className="w-px h-5 bg-white/10 mx-0.5" />

      <Btn onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        ↶ Undo
      </Btn>
      <Btn onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
        ↷ Redo
      </Btn>
    </div>
  );
}
