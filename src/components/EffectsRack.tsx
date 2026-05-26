import {
  EFFECT_LABELS,
  EFFECT_ORDER,
  type EffectKey,
  type EffectsState,
} from "../audio/effects/types";
import { PRESETS } from "../audio/presets";
import { useStore } from "../state/store";
import { ChainVisualizer } from "./ChainVisualizer";
import { PARAMS } from "./effectParams";
import { GainReductionMeter } from "./GainReductionMeter";
import { Knob } from "./Knob";

function EffectCard({
  trackId,
  effectKey,
  effects,
}: {
  trackId: string;
  effectKey: EffectKey;
  effects: EffectsState;
}) {
  const setEffectEnabled = useStore((s) => s.setEffectEnabled);
  const setEffectParam = useStore((s) => s.setEffectParam);
  const reduction = useStore((s) => s.meters.reduction[trackId]);
  const state = effects[effectKey] as unknown as Record<string, number | boolean>;
  const enabled = state.enabled as boolean;
  const params = PARAMS[effectKey];
  const showGR = effectKey === "compressor" || effectKey === "limiter";
  const grDb =
    effectKey === "compressor"
      ? reduction?.comp ?? 0
      : effectKey === "limiter"
      ? reduction?.limiter ?? 0
      : 0;

  return (
    <div
      className={`shrink-0 w-[176px] rounded-lg border p-2 flex flex-col ${
        enabled ? "border-accent/40 bg-panel-800" : "border-white/5 bg-panel-850"
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold truncate">{EFFECT_LABELS[effectKey]}</span>
        <button
          onClick={() => setEffectEnabled(trackId, effectKey, !enabled)}
          className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
            enabled ? "bg-panther-green text-black" : "bg-panel-700 text-gray-400"
          }`}
          title={enabled ? "Bypass" : "Enable"}
        >
          {enabled ? "ON" : "BYP"}
        </button>
      </div>

      {showGR && <div className="mb-1.5"><GainReductionMeter db={grDb} /></div>}

      <div className="grid grid-cols-3 gap-x-1 gap-y-2">
        {params.map((p) => (
          <Knob
            key={p.key}
            label={p.label}
            value={state[p.key] as number}
            min={p.min}
            max={p.max}
            step={p.step}
            format={p.format}
            disabled={!enabled}
            onChange={(v) => setEffectParam(trackId, effectKey, p.key, v)}
          />
        ))}
      </div>
    </div>
  );
}

export function EffectsRack() {
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const track = useStore((s) =>
    s.project.tracks.find((t) => t.id === s.selectedTrackId)
  );
  const applyPreset = useStore((s) => s.applyPreset);
  const clearEffects = useStore((s) => s.clearEffects);
  const autoEnhance = useStore((s) => s.autoEnhance);

  if (!track || !selectedTrackId) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
        Select a track to edit its vocal chain.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Controls bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-black/40 flex-wrap">
        <span className="text-xs text-gray-400">
          Chain: <span className="text-white font-medium">{track.name}</span>
        </span>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) applyPreset(selectedTrackId, e.target.value);
          }}
          className="bg-panel-900 border border-white/10 rounded px-2 py-1 text-xs outline-none"
          title="Apply a vocal preset"
        >
          <option value="">Preset…{track.presetName ? ` (${track.presetName})` : ""}</option>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id} title={p.description}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => autoEnhance(selectedTrackId)}
          className="text-xs bg-accent hover:bg-accent-hover text-white rounded px-3 py-1 font-medium"
          title="Analyze the selected clip and build a tailored chain"
        >
          Auto vocal chain
        </button>
        <button
          onClick={() => clearEffects(selectedTrackId)}
          className="text-xs bg-panel-700 hover:bg-panel-650 text-gray-200 rounded px-2 py-1"
        >
          Reset
        </button>
        <div className="flex-1 min-w-[120px]" />
        <ChainVisualizer effects={track.effects} />
      </div>

      {/* Rack cards */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-2 p-3 h-full items-stretch">
          {EFFECT_ORDER.map((key) => (
            <EffectCard
              key={key}
              trackId={selectedTrackId}
              effectKey={key}
              effects={track.effects}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
