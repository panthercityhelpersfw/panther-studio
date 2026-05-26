import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import type { MidiNote } from "../state/types";
import { audioEngine } from "../audio/AudioEngine";
import { KEY_NAMES, SCALES, type ScaleId } from "../audio/autotune";

const TOP_PITCH = 84; // C6
const LOW_PITCH = 36; // C2
const ROW_H = 14;
const PX_PER_SEC = 150;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const isBlack = (p: number) => [1, 3, 6, 8, 10].includes(p % 12);
const noteName = (p: number) => `${NOTE_NAMES[p % 12]}${Math.floor(p / 12) - 1}`;

/** Whether a pitch class is in the chosen key/scale. */
function inScale(pitch: number, key: number, scale: ScaleId): boolean {
  const deg = ((pitch - key) % 12 + 12) % 12;
  return SCALES[scale].degrees.includes(deg);
}

// Diatonic staff position (each letter = one step). Higher = higher pitch.
const SEMI_TO_STEP = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
function diatonicIndex(pitch: number): number {
  const oct = Math.floor(pitch / 12);
  return oct * 7 + SEMI_TO_STEP[pitch % 12];
}

/** Read-only staff view of the clip's notes (treble-ish ladder). */
function StaffView({ notes, durationSec, instrument }: { notes: MidiNote[]; durationSec: number; instrument: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#10131a";
    ctx.fillRect(0, 0, w, h);
    const leftPad = 60;
    const lineGap = 12; // px between adjacent staff lines (a third = 2 diatonic steps)
    const stepPx = lineGap / 2;
    // Center on the notes (or middle C if empty).
    let refIdx = diatonicIndex(71); // B4 center line
    if (notes.length) {
      const idxs = notes.map((n) => diatonicIndex(n.pitch));
      refIdx = Math.round(idxs.reduce((a, b) => a + b, 0) / idxs.length);
    }
    const midY = h / 2;
    const yOf = (pitch: number) => midY - (diatonicIndex(pitch) - refIdx) * stepPx;
    // 5 staff lines centered on the middle line.
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    for (let i = -2; i <= 2; i++) {
      const y = midY + i * lineGap;
      ctx.beginPath(); ctx.moveTo(leftPad, y); ctx.lineTo(w - 10, y); ctx.stroke();
    }
    // Clef-ish label + instrument.
    ctx.fillStyle = "#9aa6b8"; ctx.font = "11px sans-serif";
    ctx.fillText("Staff", 8, midY - 4);
    ctx.fillText(instrument, 8, midY + 12);
    const xOf = (sec: number) => leftPad + (sec / Math.max(0.5, durationSec)) * (w - leftPad - 20);
    for (const n of notes) {
      const x = xOf(n.startSec);
      const y = yOf(n.pitch);
      // Ledger lines if outside the 5-line staff.
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      for (let ly = midY - 2 * lineGap; y < ly - 1; ly -= lineGap) {
        ctx.beginPath(); ctx.moveTo(x - 7, ly - lineGap); ctx.lineTo(x + 7, ly - lineGap); ctx.stroke();
        if (ly - lineGap < y) break;
      }
      for (let ly = midY + 2 * lineGap; y > ly + 1; ly += lineGap) {
        ctx.beginPath(); ctx.moveTo(x - 7, ly + lineGap); ctx.lineTo(x + 7, ly + lineGap); ctx.stroke();
        if (ly + lineGap > y) break;
      }
      // Note head.
      ctx.fillStyle = `rgba(124,92,255,${0.55 + n.velocity * 0.45})`;
      ctx.beginPath(); ctx.ellipse(x, y, 5, 3.5, -0.3, 0, Math.PI * 2); ctx.fill();
      // Sharp glyph for black keys.
      if (isBlack(n.pitch)) {
        ctx.fillStyle = "#c9d2e0"; ctx.font = "11px serif";
        ctx.fillText("♯", x - 14, y + 4);
      }
      // Stem.
      ctx.strokeStyle = "rgba(200,210,224,0.7)";
      ctx.beginPath(); ctx.moveTo(x + 5, y); ctx.lineTo(x + 5, y - 18); ctx.stroke();
    }
    if (notes.length === 0) {
      ctx.fillStyle = "#5a6577"; ctx.font = "12px sans-serif";
      ctx.fillText("No notes yet — switch to Piano Roll to add some.", leftPad + 10, midY - 20);
    }
  }, [notes, durationSec, instrument]);
  return <canvas ref={ref} width={820} height={420} className="w-full" style={{ height: "100%" }} />;
}

export function PianoRoll() {
  const clipId = useStore((s) => s.editingMidiClipId);
  const clip = useStore((s) => s.project.clips.find((c) => c.id === s.editingMidiClipId));
  const trackInstrument = useStore((s) => {
    const c = s.project.clips.find((x) => x.id === s.editingMidiClipId);
    return s.project.tracks.find((t) => t.id === c?.trackId)?.instrument ?? "synth";
  });
  const close = useStore((s) => s.openPianoRoll);
  const addNote = useStore((s) => s.addNote);
  const moveNote = useStore((s) => s.moveNote);
  const resizeNote = useStore((s) => s.resizeNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const setNoteVelocity = useStore((s) => s.setNoteVelocity);
  const quantizeClip = useStore((s) => s.quantizeClip);
  const humanizeClip = useStore((s) => s.humanizeClip);
  const exportClipMidi = useStore((s) => s.exportClipMidi);
  const tuneKey = useStore((s) => s.tuneKey);
  const tuneScale = useStore((s) => s.tuneScale);
  const setTuneOpt = useStore((s) => s.setTuneOpt);
  const snapSec = useStore((s) => s.snapSec);
  const snapEnabled = useStore((s) => s.snapEnabled);
  const positionSec = useStore((s) => s.positionSec);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"roll" | "staff">("roll");

  if (!clipId || !clip || clip.kind !== "midi") return null;

  const pitches: number[] = [];
  for (let p = TOP_PITCH; p >= LOW_PITCH; p--) pitches.push(p);
  const gridWidth = Math.max(400, clip.durationSec * PX_PER_SEC);
  const gridHeight = pitches.length * ROW_H;
  const snap = (sec: number) => (snapEnabled ? Math.round(sec / snapSec) * snapSec : sec);

  const notes = clip.notes ?? [];
  const selNote = notes.find((n) => n.id === selected) ?? null;
  const stampChord = () => {
    const root = 60 + tuneKey;
    const minorish = tuneScale.includes("minor") || tuneScale.includes("blues");
    const chord = minorish ? [0, 3, 7] : [0, 4, 7];
    const start = snap(Math.max(0, positionSec - clip.startSec));
    chord.forEach((semi, i) =>
      addNote(clipId, { pitch: root + semi, startSec: start + i * 0.025, durationSec: Math.max(snapSec * 2, 0.5), velocity: 0.78 })
    );
  };

  const onGridDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pitch = TOP_PITCH - Math.floor(y / ROW_H);
    const start = snap(Math.max(0, x / PX_PER_SEC));
    const dur = snapEnabled ? snapSec : 0.25;
    addNote(clipId, { pitch, startSec: start, durationSec: dur, velocity: 0.8 });
    void audioEngine.ensure().then(() => audioEngine.previewNote(trackInstrument, pitch, 0.85, 0.4));
  };

  const startNoteDrag = (e: React.PointerEvent, note: MidiNote, mode: "move" | "resize") => {
    e.stopPropagation();
    setSelected(note.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const origStart = note.startSec;
    const origPitch = note.pitch;
    const origDur = note.durationSec;
    const tgt = e.currentTarget as HTMLElement;
    tgt.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / PX_PER_SEC;
      if (mode === "move") {
        const dRow = Math.round((ev.clientY - startY) / ROW_H);
        moveNote(clipId, note.id, snap(origStart + dx), origPitch - dRow);
      } else {
        resizeNote(clipId, note.id, snap(origDur + dx));
      }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try {
        tgt.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6">
      <div className="bg-panel-850 rounded-lg border border-white/10 shadow-2xl w-[900px] max-w-[95vw] h-[600px] max-h-[90vh] flex flex-col">
        {/* header */}
        <div className="h-11 px-4 flex items-center gap-2 border-b border-black/40 flex-wrap">
          <span className="font-semibold text-sm">♪ {clip.name}</span>
          <div className="flex rounded overflow-hidden border border-white/10 text-[11px]">
            <button onClick={() => setView("roll")} className={`px-2 py-1 ${view === "roll" ? "bg-accent text-white" : "bg-panel-900 text-gray-400"}`}>Piano Roll</button>
            <button onClick={() => setView("staff")} className={`px-2 py-1 ${view === "staff" ? "bg-accent text-white" : "bg-panel-900 text-gray-400"}`}>Staff</button>
          </div>
          <select value={tuneKey} onChange={(e) => setTuneOpt({ key: parseInt(e.target.value) })} className="bg-panel-900 border border-white/10 rounded px-1 py-1 text-[11px]" title="Key signature (for scale highlight)">
            {KEY_NAMES.map((k, i) => <option key={k} value={i}>{k}</option>)}
          </select>
          <select value={tuneScale} onChange={(e) => setTuneOpt({ scale: e.target.value as ScaleId })} className="bg-panel-900 border border-white/10 rounded px-1 py-1 text-[11px]">
            {(Object.keys(SCALES) as ScaleId[]).map((id) => <option key={id} value={id}>{SCALES[id].name}</option>)}
          </select>
          <button onClick={() => quantizeClip(clipId)} className="text-xs bg-panel-700 hover:bg-panel-650 rounded px-2 py-1">Quantize</button>
          <button onClick={() => humanizeClip(clipId)} className="text-xs bg-panel-700 hover:bg-panel-650 rounded px-2 py-1">Humanize</button>
          <button onClick={stampChord} className="text-xs bg-panel-700 hover:bg-panel-650 rounded px-2 py-1">Chord stamp</button>
          <button onClick={() => humanizeClip(clipId)} className="text-xs bg-panel-700 hover:bg-panel-650 rounded px-2 py-1">Strum</button>
          <button onClick={() => void exportClipMidi(clipId)} className="text-xs bg-panel-700 hover:bg-panel-650 rounded px-2 py-1">Export MIDI</button>
          {selNote && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400">
                {noteName(selNote.pitch)} · vel
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={selNote.velocity}
                onChange={(e) => setNoteVelocity(clipId, selNote.id, parseFloat(e.target.value))}
                className="w-28"
              />
              <button
                onClick={() => {
                  deleteNote(clipId, selNote.id);
                  setSelected(null);
                }}
                className="text-xs text-panther-red hover:underline"
              >
                Delete note
              </button>
            </div>
          )}
          <div className="flex-1" />
          <span className="text-[11px] text-gray-500">
            Click grid to add · drag to move · drag right edge to resize
          </span>
          <button onClick={() => close(null)} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>

        {/* editor */}
        {view === "staff" ? (
          <div className="flex-1 overflow-hidden p-2">
            <StaffView notes={notes} durationSec={clip.durationSec} instrument={trackInstrument} />
          </div>
        ) : (
        <div className="flex-1 flex overflow-auto">
          {/* keyboard */}
          <div className="shrink-0 sticky left-0 z-10 bg-panel-900" style={{ width: 56 }}>
            {pitches.map((p) => (
              <div
                key={p}
                className={`flex items-center justify-end pr-1 text-[9px] border-b border-black/40 ${
                  isBlack(p) ? "bg-panel-900 text-gray-500" : "bg-panel-800 text-gray-300"
                }`}
                style={{ height: ROW_H }}
              >
                {p % 12 === 0 ? noteName(p) : ""}
              </div>
            ))}
          </div>

          {/* grid */}
          <div className="relative" style={{ width: gridWidth, height: gridHeight }} onPointerDown={onGridDown}>
            {/* row backgrounds (scale tones get a subtle accent tint) */}
            {pitches.map((p, i) => (
              <div
                key={p}
                className={`absolute left-0 right-0 border-b border-black/30 pointer-events-none ${
                  isBlack(p) ? "bg-white/[0.015]" : ""
                } ${inScale(p, tuneKey, tuneScale) ? "bg-accent/[0.06]" : ""} ${
                  p % 12 === tuneKey ? "bg-accent/[0.12]" : ""
                }`}
                style={{ top: i * ROW_H, height: ROW_H }}
              />
            ))}
            {/* beat grid */}
            {snapEnabled &&
              Array.from({ length: Math.ceil(clip.durationSec / snapSec) + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-l border-white/[0.05] pointer-events-none"
                  style={{ left: i * snapSec * PX_PER_SEC }}
                />
              ))}

            {/* notes */}
            {notes.map((n) => {
              const top = (TOP_PITCH - n.pitch) * ROW_H;
              const left = n.startSec * PX_PER_SEC;
              const w = Math.max(4, n.durationSec * PX_PER_SEC);
              return (
                <div
                  key={n.id}
                  onPointerDown={(e) => startNoteDrag(e, n, "move")}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    deleteNote(clipId, n.id);
                  }}
                  className={`absolute rounded-sm cursor-grab active:cursor-grabbing ${
                    selected === n.id ? "ring-1 ring-white" : ""
                  }`}
                  style={{
                    top: top + 1,
                    left,
                    width: w,
                    height: ROW_H - 2,
                    background: `rgba(124,92,255,${0.4 + n.velocity * 0.6})`,
                  }}
                  title={`${noteName(n.pitch)} · right-click to delete`}
                >
                  <div
                    onPointerDown={(e) => startNoteDrag(e, n, "resize")}
                    className="absolute top-0 bottom-0 right-0 w-1.5 cursor-ew-resize bg-white/40"
                  />
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
