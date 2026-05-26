import { useEffect, useRef } from "react";
import { audioEngine } from "../audio/AudioEngine";
import { useStore } from "../state/store";

/** Real-time master-bus spectrum analyzer (log-ish frequency bars). */
export function Analyzer({ height = 56 }: { height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const disabled = useStore((s) => s.disableVisualizers);
  const lowCpu = useStore((s) => s.lowCpuMode);

  useEffect(() => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const bins = audioEngine.masterBinCount() || 512;
    const data = new Uint8Array(bins);
    let lastDraw = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const now = performance.now();
      const minFrameMs = lowCpu ? 120 : 40;
      if (now - lastDraw < minFrameMs) return;
      lastDraw = now;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#07090d";
      ctx.fillRect(0, 0, w, h);

      const ok = audioEngine.getMasterFrequencyData(data);
      if (!ok) return;

      const bars = 64;
      const barW = w / bars;
      for (let i = 0; i < bars; i++) {
        // Logarithmic bin mapping so lows aren't squashed.
        const frac = i / bars;
        const idx = Math.floor(Math.pow(frac, 2) * (bins - 1));
        const v = data[idx] / 255;
        const bh = v * h;
        const hue = 220 - frac * 80;
        ctx.fillStyle = `hsl(${hue}, 78%, ${34 + v * 28}%)`;
        ctx.fillRect(i * barW, h - bh, Math.max(1, barW - 1), bh);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [disabled, lowCpu]);

  if (disabled) {
    return (
      <div style={{ height }} className="w-full flex items-center justify-center rounded bg-panel-900 border border-white/5 text-[11px] text-gray-500">
        Visualizers disabled (Preferences)
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ height }}
      className="w-full block rounded bg-panel-900 border border-white/5"
    />
  );
}
