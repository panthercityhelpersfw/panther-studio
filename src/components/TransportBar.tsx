import type { WorkspaceMode } from "../App";
import { useStore } from "../state/store";
import { formatTime, gainToDb } from "../utils/format";
import { StereoMeter } from "./Meter";
import { Tools } from "./Tools";
import { FileMenu } from "./FileMenu";

const workspaces: WorkspaceMode[] = [
  "Recording",
  "Beatmaking",
  "Mixing",
  "Mastering",
  "Vocal Editing",
  "Performance Mode",
  "Minimal Focus Mode",
];

function IconBtn({
  onClick,
  active,
  title,
  className = "",
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`studio-transport-btn ${active ? "is-active" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

export function TransportBar({
  workspace,
  onWorkspaceChange,
}: {
  workspace: WorkspaceMode;
  onWorkspaceChange: (workspace: WorkspaceMode) => void;
}) {
  const {
    playing,
    recording,
    positionSec,
    togglePlay,
    stop,
    toggleRecord,
    seek,
    meters,
    project,
    setMasterGain,
    snapEnabled,
    toggleSnap,
    zoomIn,
    zoomOut,
    saving,
    lastSaved,
    dirty,
    saveNow,
    setView,
    setAudioSetupOpen,
    audioSetupOpen,
    setBuilderOpen,
    setCoachOpen,
    setPrefsOpen,
    setHelpOpen,
    setVibeMode,
    runMagicMicChain,
  } = useStore();
  const vibeMode = useStore((s) => s.project.vibeMode ?? "off");

  const activeFx = project.tracks.reduce((sum, track) => sum + Object.values(track.effects).filter((fx) => fx.enabled).length, 0);
  const cpuEstimate = Math.min(98, 12 + project.tracks.length * 5 + project.clips.length * 2 + activeFx * 3);

  return (
    <div className="studio-topbar">
      <button
        onClick={() => setView("dashboard")}
        className="studio-project-switch"
        title="Back to projects"
      >
        <img src="/panther.svg" alt="" />
        <div className="text-left leading-tight min-w-0">
          <div className="studio-project-switch__name">Panther Studio</div>
          <div className="studio-project-switch__meta" title={project.name}>
            {project.name}
          </div>
        </div>
      </button>

      <div className="studio-transport">
        <IconBtn onClick={() => seek(0)} title="Return to start">
          |&lt;
        </IconBtn>
        <IconBtn onClick={togglePlay} active={playing} title="Play / Pause (Space)">
          {playing ? "II" : "PLAY"}
        </IconBtn>
        <IconBtn onClick={stop} title="Stop">
          STOP
        </IconBtn>
        <IconBtn
          onClick={toggleRecord}
          title="Record (R)"
          className={recording ? "is-recording rec-pulse" : ""}
        >
          <span className="record-dot" />
        </IconBtn>
      </div>

      <div className="studio-time-display">
        <div className="studio-time-display__time">{formatTime(positionSec)}</div>
        <div className="studio-time-display__meta">
          {project.tempo} BPM / C Maj
        </div>
      </div>

      <div className="studio-workspace">
        <span>Workspace</span>
        <select value={workspace} onChange={(e) => onWorkspaceChange(e.target.value as WorkspaceMode)}>
          {workspaces.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>

      <div className="studio-tool-cluster">
        <button
          onClick={() => setVibeMode(vibeMode === "off" ? "late-night" : "off")}
          title="Toggle Vibe Mode"
          className={`studio-chip ${vibeMode !== "off" ? "is-active" : ""}`}
        >
          Vibe
        </button>
        <button onClick={() => void runMagicMicChain()} title="Make My Mic Sound Studio Ready" className="studio-chip">
          Magic Mic
        </button>
        <button onClick={toggleSnap} title="Toggle snap to grid" className={`studio-chip ${snapEnabled ? "is-active" : ""}`}>
          Snap
        </button>
        <IconBtn onClick={zoomOut} title="Zoom out">-</IconBtn>
        <IconBtn onClick={zoomIn} title="Zoom in">+</IconBtn>
      </div>

      <div className="flex-1" />

      <div className="studio-performance">
        <span>CPU</span>
        <div className="studio-performance__bar"><i style={{ width: `${cpuEstimate}%` }} /></div>
        <strong>{cpuEstimate}%</strong>
      </div>

      <button onClick={() => setBuilderOpen(true)} className="studio-action-btn" title="Instrumental Builder">
        Build
      </button>
      <button onClick={() => setCoachOpen(true)} className="studio-action-btn" title="Vocal Coach">
        Coach
      </button>
      <button
        onClick={() => setAudioSetupOpen(!audioSetupOpen)}
        className={`studio-action-btn ${audioSetupOpen ? "is-active" : ""}`}
        title="Audio Setup"
      >
        Audio
      </button>

      <Tools />
      <FileMenu />

      <button onClick={() => setHelpOpen(true)} className="studio-square-btn" title="Help & shortcuts">
        ?
      </button>
      <button onClick={() => setPrefsOpen(true)} className="studio-square-btn" title="Preferences">
        SET
      </button>

      <div className="studio-master-mini">
        <div className="h-7">
          <StereoMeter l={meters.master.l} r={meters.master.r} />
        </div>
        <div className="flex flex-col w-28">
          <div className="flex justify-between text-[10px] text-gray-400">
            <span>Master</span>
            <span className="font-mono text-gray-300">
              {gainToDb(project.masterGain)} dB
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={project.masterGain}
            onChange={(e) => setMasterGain(parseFloat(e.target.value))}
          />
        </div>
      </div>

      <button
        onClick={() => void saveNow()}
        title="Save now (Ctrl+S)"
        className="studio-save-btn"
      >
        {saving ? "Saving..." : dirty ? "Save*" : lastSaved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
