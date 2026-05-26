import { useEffect, useRef, useState } from "react";
import { audioEngine } from "../audio/AudioEngine";
import { useStore } from "../state/store";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function freqToNote(freq: number) {
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const name = NOTE_NAMES[(midi % 12 + 12) % 12] + (Math.floor(midi / 12) - 1);
  const refFreq = 440 * Math.pow(2, (midi - 69) / 12);
  const cents = Math.round(1200 * Math.log2(freq / refFreq));
  return { name, cents };
}

function Tuner() {
  const hasInput = useStore((s) => s.permission === "granted");
  const enableInput = useStore((s) => s.enableInput);
  const [pitch, setPitch] = useState<number | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      setPitch(audioEngine.detectPitch());
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const note = pitch ? freqToNote(pitch) : null;
  const cents = note?.cents ?? 0;
  const inTune = note && Math.abs(cents) <= 5;

  return (
    <div className="bg-panel-900 rounded p-2 border border-white/5">
      <div className="text-[11px] text-gray-400 mb-1">Tuner</div>
      {!hasInput ? (
        <button onClick={() => void enableInput()} className="text-[11px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1 w-full">
          Enable mic to tune
        </button>
      ) : (
        <div className="text-center">
          <div className={`text-2xl font-bold ${inTune ? "text-panther-green" : "text-gray-200"}`}>
            {note ? note.name : "—"}
          </div>
          <div className="relative h-2 bg-panel-700 rounded mt-1 overflow-hidden">
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/40" />
            {note && (
              <div
                className={`absolute top-0 bottom-0 w-1 rounded ${inTune ? "bg-panther-green" : "bg-panther-gold"}`}
                style={{ left: `calc(50% + ${Math.max(-50, Math.min(50, cents))}%)` }}
              />
            )}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {note ? `${pitch!.toFixed(1)} Hz · ${cents > 0 ? "+" : ""}${cents}¢` : "play a note"}
          </div>
        </div>
      )}
    </div>
  );
}

export function Tools() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const metronomeEnabled = useStore((s) => s.metronomeEnabled);
  const setMetronomeEnabled = useStore((s) => s.setMetronomeEnabled);
  const countInBars = useStore((s) => s.countInBars);
  const setCountInBars = useStore((s) => s.setCountInBars);
  const tapTempo = useStore((s) => s.tapTempo);
  const tempo = useStore((s) => s.project.tempo);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`h-9 px-3 rounded-md text-xs ${open ? "bg-accent text-white" : "bg-panel-700 hover:bg-panel-650 text-gray-200"}`}
        title="Studio tools"
      >
        🎛 Tools
      </button>
      {open && (
        <div className="absolute z-40 top-11 right-0 w-60 bg-panel-800 border border-white/10 rounded-lg shadow-2xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Metronome</span>
            <button
              onClick={() => setMetronomeEnabled(!metronomeEnabled)}
              className={`w-11 h-6 rounded-full relative ${metronomeEnabled ? "bg-panther-green" : "bg-panel-600"}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${metronomeEnabled ? "left-5" : "left-0.5"}`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">Count-in</span>
            <select value={countInBars} onChange={(e) => setCountInBars(parseInt(e.target.value))} className="bg-panel-900 border border-white/10 rounded px-2 py-1 text-xs">
              {[0, 1, 2, 4].map((v) => <option key={v} value={v}>{v === 0 ? "Off" : `${v} bar${v > 1 ? "s" : ""}`}</option>)}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">Tempo: <span className="font-mono text-panther-gold">{tempo}</span></span>
            <button onClick={tapTempo} className="text-xs bg-accent hover:bg-accent-hover text-white rounded px-3 py-1">Tap tempo</button>
          </div>

          <Tuner />
        </div>
      )}
    </div>
  );
}
