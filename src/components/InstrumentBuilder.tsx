import { useState } from "react";
import { useStore } from "../state/store";
import { audioEngine } from "../audio/AudioEngine";
import { DRUM_LANES } from "../audio/instruments";
import { INSTRUMENT_LABELS, type InstrumentId } from "../state/types";

const GENRE_TEMPLATES: { label: string; prompt: string }[] = [
  { label: "Emotional Trap", prompt: "emotional trap beat in C minor 8 bar hook" },
  { label: "Boom-Bap Rap", prompt: "rap boom bap beat in A minor" },
  { label: "R&B Smooth", prompt: "chill r&b chords in D minor with bass" },
  { label: "Pop", prompt: "happy pop beat in C major with melody" },
  { label: "Rock", prompt: "rock beat in E minor with bass" },
  { label: "Cinematic", prompt: "emotional cinematic pad in F minor" },
  { label: "Podcast Bed", prompt: "chill podcast bed music in C major" },
];

const TRACK_BUILDERS: { label: string; prompt: string }[] = [
  { label: "808 Bass", prompt: "808 bass line in C minor 8 bar hook" },
  { label: "Drum Track", prompt: "trap drum groove in C minor 8 bar hook" },
  { label: "Chord Track", prompt: "minor piano chord progression in C minor 8 bars" },
  { label: "Melody Track", prompt: "lead melody in C minor 8 bar hook" },
  { label: "Pad Layer", prompt: "cinematic pad layer in C minor 8 bars" },
  { label: "Full Arrangement", prompt: "emotional trap full song arrangement in C minor with drums bass chords melody" },
  { label: "Hook Lift", prompt: "bigger hook lift in C minor with drums bass lead and wide pad" },
  { label: "Bridge Variation", prompt: "bridge variation in A minor with soft piano pad and bass" },
  { label: "Transition FX Track", prompt: "transition riser impact drums in C minor 4 bars" },
];

const PALETTE: InstrumentId[] = ["piano", "epiano", "bass", "lead", "pad", "pluck", "synth", "drumkit"];
const SECTIONS = ["Intro", "Verse", "Pre-Hook", "Hook", "Bridge", "Outro"];

export function InstrumentBuilder() {
  const open = useStore((s) => s.builderOpen);
  const setOpen = useStore((s) => s.setBuilderOpen);
  const composeFromPrompt = useStore((s) => s.composeFromPrompt);
  const addInstrumentTrack = useStore((s) => s.addInstrumentTrack);
  const addBeatClip = useStore((s) => s.addBeatClip);
  const addSongSection = useStore((s) => s.addSongSection);
  const buildSongStructure = useStore((s) => s.buildSongStructure);
  const tempo = useStore((s) => s.project.tempo);
  const lastPrompt = useStore((s) => s.project.lastComposerPrompt);

  const [prompt, setPrompt] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  // Drum grid: lane -> 16 steps
  const [grid, setGrid] = useState<Record<string, boolean[]>>(() =>
    Object.fromEntries(DRUM_LANES.map((l) => [l.id, new Array(16).fill(false)]))
  );

  if (!open) return null;

  const generate = (text: string) => {
    const s = composeFromPrompt(text);
    setSummary(s);
  };

  const toggleStep = (laneId: string, step: number) => {
    setGrid((g) => {
      const lane = [...g[laneId]];
      lane[step] = !lane[step];
      return { ...g, [laneId]: lane };
    });
  };

  const makeBeatFromGrid = () => {
    const beatSec = 60 / tempo;
    const barSec = beatSec * 4;
    const stepSec = barSec / 16;
    const notes: { pitch: number; startSec: number; durationSec: number; velocity: number }[] = [];
    for (const lane of DRUM_LANES) {
      const steps = grid[lane.id];
      for (let s = 0; s < 16; s++) {
        if (steps[s]) notes.push({ pitch: lane.pitch, startSec: s * stepSec, durationSec: stepSec, velocity: 0.85 });
      }
    }
    if (notes.length === 0) return;
    addBeatClip({ name: "Drums", instrument: "drumkit", busId: "drums", durationSec: barSec, notes });
    setSummary("Drum pattern added as an editable MIDI clip.");
  };

  const previewDrum = (pitch: number) => {
    void audioEngine.ensure().then(() => audioEngine.previewNote("drumkit", pitch, 0.9, 0.3));
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
      <div className="bg-panel-850 rounded-lg border border-white/10 shadow-2xl w-[760px] max-h-[88vh] flex flex-col">
        <div className="px-5 py-3 border-b border-black/40 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Instrumental Builder</h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white" aria-label="Close instrumental builder">X</button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* Typed composer */}
          <section className="space-y-2">
            <div className="text-xs font-semibold text-gray-300">Type a beat (local composer)</div>
            <div className="flex gap-2">
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && generate(prompt)}
                placeholder='e.g. "make a sad piano loop in C minor 8 bar hook"'
                className="flex-1 bg-panel-900 border border-white/10 rounded px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button onClick={() => generate(prompt)} className="bg-accent hover:bg-accent-hover text-white rounded px-4 py-2 text-sm font-medium">Generate</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {GENRE_TEMPLATES.map((t) => (
                <button key={t.label} onClick={() => { setPrompt(t.prompt); generate(t.prompt); }}
                  className="text-[11px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1">{t.label}</button>
              ))}
            </div>
            {(summary || lastPrompt) && (
              <div className="text-[11px] text-panther-green bg-panther-green/10 border border-panther-green/20 rounded p-2">
                {summary ?? `Last: "${lastPrompt}"`}
              </div>
            )}
            <div className="text-[10px] text-gray-600">Generated parts become real, editable MIDI clips routed to instruments. Open them in the piano roll to tweak.</div>
          </section>

          <section className="space-y-2">
            <div className="text-xs font-semibold text-gray-300">Track builders</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
              {TRACK_BUILDERS.map((builder) => (
                <button
                  key={builder.label}
                  onClick={() => { setPrompt(builder.prompt); generate(builder.prompt); }}
                  className="text-[11px] bg-panel-800 hover:bg-panel-750 border border-white/5 rounded px-2 py-1.5 text-left"
                >
                  {builder.label}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-gray-600">These create routed MIDI tracks and clips using the local composer, so they save, reload, edit, and export with the project.</div>
          </section>

          {/* Drum grid */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-300">Drum pattern (1 bar / 16 steps)</div>
              <button onClick={makeBeatFromGrid} className="text-[11px] bg-accent hover:bg-accent-hover text-white rounded px-3 py-1">Add drum clip</button>
            </div>
            <div className="space-y-1">
              {DRUM_LANES.map((lane) => (
                <div key={lane.id} className="flex items-center gap-1">
                  <button onClick={() => previewDrum(lane.pitch)} className="w-16 text-left text-[11px] text-gray-300 hover:text-white shrink-0">{lane.label}</button>
                  <div className="flex gap-0.5 flex-1">
                    {grid[lane.id].map((on, s) => (
                      <button
                        key={s}
                        onClick={() => toggleStep(lane.id, s)}
                        className={`flex-1 h-6 rounded-sm ${on ? "bg-accent" : s % 4 === 0 ? "bg-panel-700" : "bg-panel-800"} hover:opacity-80`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Instrument palette */}
          <section className="space-y-2">
            <div className="text-xs font-semibold text-gray-300">Add an instrument track</div>
            <div className="flex flex-wrap gap-1.5">
              {PALETTE.map((inst) => (
                <button key={inst} onClick={() => addInstrumentTrack(inst)} className="text-[11px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1">
                  + {INSTRUMENT_LABELS[inst]}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-gray-600">Then double-click the track lane to add a MIDI clip and draw notes.</div>
          </section>

          {/* Section builder */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-300">Song sections</div>
              <button onClick={buildSongStructure} className="text-[11px] bg-accent hover:bg-accent-hover text-white rounded px-3 py-1">Build full structure</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SECTIONS.map((s) => (
                <button key={s} onClick={() => addSongSection(s)} className="text-[11px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1">+ {s} @ playhead</button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
