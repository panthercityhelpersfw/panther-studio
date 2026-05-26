import { EFFECT_ORDER } from "../audio/effects/types";
import { useStore } from "../state/store";
import { gainToDb, panLabel } from "../utils/format";
import { GainReductionMeter } from "./GainReductionMeter";
import { Meter, StereoMeter } from "./Meter";

const FX_ABBR: Record<string, string> = {
  gate: "GT",
  eq: "EQ",
  deEsser: "DS",
  compressor: "CP",
  saturation: "ST",
  doubler: "DB",
  delay: "DL",
  reverb: "RV",
  limiter: "LM",
};

function ChannelStrip({ trackId }: { trackId: string }) {
  const track = useStore((s) => s.project.tracks.find((t) => t.id === trackId))!;
  const level = useStore((s) => s.meters.tracks[trackId] ?? 0);
  const selected = useStore((s) => s.selectedTrackId === trackId);
  const {
    setTrackGain,
    setTrackPan,
    setTrackSend,
    toggleMute,
    toggleSolo,
    toggleArm,
    selectTrack,
  } = useStore();
  if (!track) return null;
  const activeFx = EFFECT_ORDER.filter((k) => track.effects[k].enabled);

  return (
    <div
      onPointerDown={() => selectTrack(trackId)}
      className={`studio-channel-strip ${selected ? "is-selected" : ""}`}
    >
      <div className="w-full flex items-center gap-1">
        <span className="w-2 h-2 rounded-sm" style={{ background: track.color }} />
        <span className="text-[11px] truncate flex-1">{track.name}</span>
      </div>

      {/* Insert visibility: active effects on this channel */}
      <div className="w-full flex flex-wrap gap-0.5 min-h-[14px] justify-center" title={`Inserts: ${activeFx.length}`}>
        {activeFx.length === 0 ? (
          <span className="text-[8px] text-gray-600">no FX</span>
        ) : (
          activeFx.map((k) => (
            <span key={k} className="text-[7px] font-bold bg-accent/25 text-accent rounded px-0.5 leading-tight">
              {FX_ABBR[k]}
            </span>
          ))
        )}
      </div>

      <div className="w-full space-y-0.5">
        {(["vocals", "drums", "music"] as const).map((busId) => (
          <label key={busId} className="flex items-center gap-1 text-[8px] text-gray-500">
            <span className="w-7 uppercase">{busId.slice(0, 3)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={track.sends?.[busId]?.gain ?? 0}
              onChange={(e) => setTrackSend(trackId, busId, parseFloat(e.target.value))}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-16"
            />
          </label>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={track.pan}
          onChange={(e) => setTrackPan(trackId, parseFloat(e.target.value))}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-14"
        />
        <span className="text-[9px] font-mono text-gray-400 w-6">
          {panLabel(track.pan)}
        </span>
      </div>

      <div className="flex gap-2 items-stretch h-32">
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.01}
          value={track.gain}
          onChange={(e) => setTrackGain(trackId, parseFloat(e.target.value))}
          onPointerDown={(e) => e.stopPropagation()}
          className="fader"
        />
        <div className="w-2 h-full">
          <Meter level={level} className="w-2 h-full" />
        </div>
      </div>

      <span className="text-[9px] font-mono text-gray-400">
        {gainToDb(track.gain)} dB
      </span>

      <div className="flex gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleArm(trackId);
          }}
          className="w-5 h-5 rounded text-[10px] font-bold"
          style={{ background: track.armed ? "#ff5d6c" : "#202634", color: track.armed ? "#0b0d12" : "#9aa6b8" }}
        >
          R
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMute(trackId);
          }}
          className="w-5 h-5 rounded text-[10px] font-bold"
          style={{ background: track.muted ? "#e8b341" : "#202634", color: track.muted ? "#0b0d12" : "#9aa6b8" }}
        >
          M
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleSolo(trackId);
          }}
          className="w-5 h-5 rounded text-[10px] font-bold"
          style={{ background: track.soloed ? "#3ddc97" : "#202634", color: track.soloed ? "#0b0d12" : "#9aa6b8" }}
        >
          S
        </button>
      </div>
    </div>
  );
}

export function Mixer() {
  const tracks = useStore((s) => s.project.tracks);
  const masterGain = useStore((s) => s.project.masterGain);
  const master = useStore((s) => s.project.master);
  const setMasterGain = useStore((s) => s.setMasterGain);
  const setBusGain = useStore((s) => s.setBusGain);
  const setBusReturnGain = useStore((s) => s.setBusReturnGain);
  const toggleBusMute = useStore((s) => s.toggleBusMute);
  const toggleBusPreFader = useStore((s) => s.toggleBusPreFader);
  const meters = useStore((s) => s.meters);
  const buses = useStore((s) => s.project.buses ?? []);
  const activeMasterFx = EFFECT_ORDER.filter((k) => master.effects[k].enabled);

  return (
    <div className="flex-1 flex flex-col min-h-0 studio-mixer">
      <div className="flex-1 flex overflow-x-auto">
        <div className="flex studio-mixer__channels">
          {tracks.map((t) => (
            <ChannelStrip key={t.id} trackId={t.id} />
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex studio-mixer__channels border-l border-white/5">
          {buses.map((bus) => (
            <div key={bus.id} className="studio-channel-strip">
              <span className="text-[11px] font-semibold text-gray-200 truncate">{bus.name}</span>
              <button onClick={() => toggleBusMute(bus.id)} className={`text-[10px] rounded px-2 py-0.5 ${bus.muted ? "bg-panther-gold text-black" : "bg-panel-800 text-gray-400"}`}>{bus.muted ? "Muted" : "On"}</button>
              <label className="text-[9px] text-gray-500">Input</label>
              <input type="range" min={0} max={1.5} step={0.01} value={bus.gain} onChange={(e) => setBusGain(bus.id, parseFloat(e.target.value))} className="w-20" />
              <label className="text-[9px] text-gray-500">Return</label>
              <input type="range" min={0} max={1.5} step={0.01} value={bus.returnGain ?? 1} onChange={(e) => setBusReturnGain(bus.id, parseFloat(e.target.value))} className="w-20" />
              <button onClick={() => toggleBusPreFader(bus.id)} className="text-[9px] text-gray-500 hover:text-white">{bus.preFader ? "Pre-send" : "Post-send"}</button>
            </div>
          ))}
        </div>
        {/* Master strip */}
        <div className="studio-master-strip">
          <span className="text-[11px] font-semibold text-panther-gold">MASTER</span>
          <div className="w-full flex flex-wrap gap-0.5 min-h-[14px] justify-center" title="Master inserts">
            {master.bypass ? (
              <span className="text-[8px] text-panther-gold">BYPASS</span>
            ) : activeMasterFx.length === 0 ? (
              <span className="text-[8px] text-gray-600">no FX</span>
            ) : (
              activeMasterFx.map((k) => (
                <span key={k} className="text-[7px] font-bold bg-panther-gold/25 text-panther-gold rounded px-0.5 leading-tight">
                  {FX_ABBR[k]}
                </span>
              ))
            )}
          </div>
          <div className="flex gap-2 items-stretch h-28 mt-1">
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.01}
              value={masterGain}
              onChange={(e) => setMasterGain(parseFloat(e.target.value))}
              className="fader"
            />
            <div className="h-full">
              <StereoMeter l={meters.master.l} r={meters.master.r} />
            </div>
          </div>
          <span className="text-[9px] font-mono text-gray-400">{gainToDb(masterGain)} dB</span>
          <GainReductionMeter db={Math.min(meters.masterReduction.comp, meters.masterReduction.limiter)} />
        </div>
      </div>
    </div>
  );
}
