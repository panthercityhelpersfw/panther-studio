interface MeterProps {
  level: number; // 0..1
  vertical?: boolean;
  className?: string;
}

/** A single segmented level meter (green/amber/red). */
export function Meter({ level, vertical = true, className = "" }: MeterProps) {
  const pct = Math.min(100, Math.max(0, level * 100));
  const color =
    level > 0.9 ? "#ff5d6c" : level > 0.7 ? "#e8b341" : "#3ddc97";

  if (vertical) {
    return (
      <div
        className={`relative meter-shell rounded-sm overflow-hidden ${className}`}
      >
        <div
          className="absolute bottom-0 left-0 right-0 transition-[height] duration-75"
          style={{ height: `${pct}%`, background: `linear-gradient(0deg, #3ddc97 0%, #3ddc97 58%, #e8b341 74%, ${color} 100%)` }}
        />
      </div>
    );
  }
  return (
    <div className={`relative meter-shell rounded-sm overflow-hidden ${className}`}>
      <div
        className="absolute top-0 bottom-0 left-0 transition-[width] duration-75"
        style={{ width: `${pct}%`, background: `linear-gradient(90deg, #3ddc97 0%, #3ddc97 58%, #e8b341 78%, ${color} 100%)` }}
      />
    </div>
  );
}

interface StereoMeterProps {
  l: number;
  r: number;
}

export function StereoMeter({ l, r }: StereoMeterProps) {
  return (
    <div className="flex gap-0.5 h-full">
      <Meter level={l} className="w-1.5 h-full" />
      <Meter level={r} className="w-1.5 h-full" />
    </div>
  );
}
