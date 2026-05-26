/** Horizontal gain-reduction meter. `db` is <= 0; shows how much is reduced. */
export function GainReductionMeter({ db }: { db: number }) {
  const amount = Math.min(20, Math.max(0, -db)); // 0..20 dB
  const pct = (amount / 20) * 100;
  return (
    <div className="flex items-center gap-1" title={`Gain reduction: ${(-amount).toFixed(1)} dB`}>
      <span className="text-[8px] text-gray-500">GR</span>
      <div className="relative w-14 h-2 bg-panel-900 rounded-sm overflow-hidden">
        <div
          className="absolute right-0 top-0 bottom-0 bg-panther-gold transition-[width] duration-75"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[8px] font-mono text-gray-400 w-7">
        {amount > 0.1 ? `-${amount.toFixed(0)}` : "0"}
      </span>
    </div>
  );
}
