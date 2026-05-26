import { EFFECT_LABELS, EFFECT_ORDER, type EffectsState } from "../audio/effects/types";

/** Signal-flow strip showing the fixed vocal chain order and what's active. */
export function ChainVisualizer({ effects }: { effects: EffectsState }) {
  return (
    <div className="flex items-center gap-1 flex-wrap text-[10px]">
      <span className="text-gray-500">IN</span>
      {EFFECT_ORDER.map((key) => {
        const on = effects[key].enabled;
        return (
          <span key={key} className="flex items-center gap-1">
            <span className="text-gray-600">→</span>
            <span
              className={`px-1.5 py-0.5 rounded ${
                on
                  ? "bg-accent/30 text-white border border-accent/50"
                  : "bg-panel-900 text-gray-600 border border-white/5"
              }`}
            >
              {EFFECT_LABELS[key]}
            </span>
          </span>
        );
      })}
      <span className="text-gray-600">→</span>
      <span className="text-panther-gold">OUT</span>
    </div>
  );
}
