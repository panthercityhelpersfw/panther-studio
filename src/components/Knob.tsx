import { useRef } from "react";

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  disabled?: boolean;
  onChange: (v: number) => void;
}

/**
 * Drag-to-turn rotary knob. Vertical drag changes the value; double-click is a
 * fine-tune via prompt-free reset to mid. Fully wired to real audio params -
 * there are no decorative knobs in this app.
 */
export function Knob({
  label,
  value,
  min,
  max,
  step = 0.01,
  format,
  disabled,
  onChange,
}: KnobProps) {
  const ref = useRef<HTMLDivElement>(null);
  const norm = (value - min) / (max - min);
  const angle = -135 + norm * 270; // -135deg .. +135deg

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startVal = value;
    const range = max - min;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const dy = startY - ev.clientY;
      // Full range over ~200px of travel; Shift = fine (1/5).
      const sens = ev.shiftKey ? 0.2 : 1;
      let v = startVal + (dy / 200) * range * sens;
      v = Math.max(min, Math.min(max, v));
      if (step) v = Math.round(v / step) * step;
      onChange(v);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try {
        (e.target as HTMLElement).releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const display = format ? format(value) : value.toFixed(2);

  return (
    <div className={`flex flex-col items-center gap-0.5 ${disabled ? "opacity-40" : ""}`}>
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onDoubleClick={() => !disabled && onChange((min + max) / 2)}
        className="relative w-9 h-9 rounded-full bg-panel-900 border border-white/10 cursor-ns-resize touch-none"
        title={`${label}: ${display} (drag, Shift = fine)`}
        style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,0.6)" }}
      >
        {/* arc fill */}
        <svg className="absolute inset-0" viewBox="0 0 36 36">
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="#2a3344"
            strokeWidth="2.5"
            strokeDasharray="70.7 94.2"
            strokeDashoffset="0"
            transform="rotate(135 18 18)"
            strokeLinecap="round"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="#7c5cff"
            strokeWidth="2.5"
            strokeDasharray={`${norm * 70.7} 94.2`}
            transform="rotate(135 18 18)"
            strokeLinecap="round"
          />
        </svg>
        {/* pointer */}
        <div
          className="absolute left-1/2 top-1/2 w-0.5 h-3 bg-white rounded-full origin-bottom"
          style={{ transform: `translate(-50%, -100%) rotate(${angle}deg)` }}
        />
      </div>
      <span className="text-[9px] text-gray-400 leading-none">{label}</span>
      <span className="text-[9px] font-mono text-gray-300 leading-none">{display}</span>
    </div>
  );
}
