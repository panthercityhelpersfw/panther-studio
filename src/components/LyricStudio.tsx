import { useMemo, useState } from "react";
import {
  countSyllables,
  lyricLineMetrics,
  LYRIC_SECTIONS,
  repeatedWords,
  rhymeScheme,
  rhymeSuggestions,
} from "../audio/lyrics";
import { useStore } from "../state/store";
import type { LyricLine, LyricSectionId } from "../state/types";
import { formatTime } from "../utils/format";

const FlagButton = ({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`lyric-flag ${active ? "is-active" : ""}`}
    title={label}
  >
    {label}
  </button>
);

function LineRow({
  line,
  scheme,
  selected,
  onSelect,
}: {
  line: LyricLine;
  scheme: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const tempo = useStore((s) => s.project.tempo);
  const update = useStore((s) => s.updateLyricLine);
  const attach = useStore((s) => s.attachLyricLineToSelection);
  const moveToBank = useStore((s) => s.moveLyricLineToBank);
  const remove = useStore((s) => s.deleteLyricLine);
  const metrics = lyricLineMetrics(line, tempo);

  const setFlag = (key: keyof LyricLine["performance"]) => {
    if (key === "emphasisWords") return;
    update(line.id, { performance: { [key]: !line.performance[key] } });
  };

  return (
    <div className={`lyric-line ${selected ? "is-selected" : ""}`} onClick={onSelect}>
      <div className="lyric-line__num">
        <span>{line.order + 1}</span>
        <strong>{scheme}</strong>
      </div>
      <div className="lyric-line__main">
        <textarea
          value={line.text}
          onChange={(e) => update(line.id, { text: e.target.value })}
          placeholder="Write a line..."
          rows={2}
          className="lyric-line__text"
        />
        <div className="lyric-line__meta">
          <span>{metrics.syllables} syll</span>
          <span>{metrics.syllablesPerBar.toFixed(1)} syll/bar</span>
          <span>density {metrics.density}%</span>
          {line.timeSec != null && <span>@ {formatTime(line.timeSec)}</span>}
          {line.clipId && <span>clip-linked</span>}
          {metrics.warnings.map((w) => <span key={w} className="text-panther-gold">{w}</span>)}
        </div>
        <div className="lyric-line__flags">
          <FlagButton active={line.performance.punchIn} label="Punch" onClick={() => setFlag("punchIn")} />
          <FlagButton active={line.performance.adlib} label="Ad-lib" onClick={() => setFlag("adlib")} />
          <FlagButton active={line.performance.harmony} label="Harmony" onClick={() => setFlag("harmony")} />
          <FlagButton active={line.performance.double} label="Double" onClick={() => setFlag("double")} />
          <FlagButton active={line.performance.breathAfter} label="Breath" onClick={() => setFlag("breathAfter")} />
          <input
            value={line.performance.emphasisWords.join(", ")}
            onChange={(e) => update(line.id, { performance: { emphasisWords: e.target.value.split(",").map((w) => w.trim()).filter(Boolean) } })}
            placeholder="emphasis words"
            className="lyric-emphasis"
          />
        </div>
      </div>
      <div className="lyric-line__tools">
        <button onClick={(e) => { e.stopPropagation(); attach(line.id); }}>Attach</button>
        <button onClick={(e) => { e.stopPropagation(); moveToBank(line.id, "hook"); }}>Hook</button>
        <button onClick={(e) => { e.stopPropagation(); moveToBank(line.id, "unused"); }}>Unused</button>
        <button onClick={(e) => { e.stopPropagation(); remove(line.id); }}>Delete</button>
      </div>
    </div>
  );
}

export function LyricStudio() {
  const project = useStore((s) => s.project);
  const studio = project.lyricStudio;
  const setSection = useStore((s) => s.setLyricSection);
  const addLine = useStore((s) => s.addLyricLine);
  const updateConcept = useStore((s) => s.updateLyricConcept);
  const addHookIdea = useStore((s) => s.addHookIdea);
  const addUnusedLine = useStore((s) => s.addUnusedLyricLine);
  const captureInspiration = useStore((s) => s.captureInspiration);
  const runLyricCoach = useStore((s) => s.runLyricCoach);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [bankText, setBankText] = useState("");

  const lines = useMemo(
    () => (studio?.lines ?? []).filter((line) => line.section === (studio?.activeSection ?? "verse")).sort((a, b) => a.order - b.order),
    [studio]
  );
  const allLines = studio?.lines ?? [];
  const scheme = useMemo(() => rhymeScheme(lines), [lines]);
  const selected = lines.find((line) => line.id === selectedLineId) ?? lines[0] ?? null;
  const selectedRhymes = selected ? rhymeSuggestions(selected.text) : { exact: [], near: [] };
  const repeated = useMemo(() => repeatedWords(allLines), [allLines]);
  const section = studio?.activeSection ?? "verse";

  const addSectionLine = (target?: LyricSectionId) => {
    const id = addLine(target ?? section);
    setSelectedLineId(id);
  };

  return (
    <div className="lyric-studio flex-1 min-h-0 grid grid-cols-[1fr_320px]">
      <div className="min-h-0 flex flex-col">
        <div className="lyric-studio__head">
          <div>
            <div className="studio-label">Lyric Studio</div>
            <h3>Notebook, flow map, performance marks</h3>
          </div>
          <div className="flex gap-2">
            <button onClick={() => addSectionLine()} className="studio-action-btn is-active">Add line</button>
            <button onClick={() => runLyricCoach()} className="studio-action-btn">Run Lyric Coach</button>
            <button onClick={() => void captureInspiration("lyric", selected?.text)} className="studio-action-btn">Capture</button>
          </div>
        </div>

        <div className="lyric-sections">
          {LYRIC_SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={s.id === section ? "is-active" : ""}
            >
              {s.label}
              <span>{allLines.filter((line) => line.section === s.id).length}</span>
            </button>
          ))}
        </div>

        <div className="lyric-lines">
          {lines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              scheme={scheme[line.id] ?? "-"}
              selected={selectedLineId === line.id}
              onSelect={() => setSelectedLineId(line.id)}
            />
          ))}
          {lines.length === 0 && (
            <div className="lyric-empty">
              <div>No lines in this section yet.</div>
              <button onClick={() => addSectionLine()} className="studio-action-btn is-active">Write first line</button>
            </div>
          )}
        </div>
      </div>

      <aside className="lyric-side">
        <section>
          <div className="studio-label">Concept Notes</div>
          <textarea
            value={studio?.conceptNotes ?? ""}
            onChange={(e) => updateConcept(e.target.value)}
            placeholder="Song concept, references, emotional target, title ideas..."
            rows={5}
          />
        </section>

        <section>
          <div className="studio-label">Selected Line Analysis</div>
          {selected ? (
            <div className="space-y-2">
              <div className="lyric-meter">
                <span>Line length</span>
                <strong>{selected.text.length} chars</strong>
              </div>
              <div className="lyric-meter">
                <span>Syllables</span>
                <strong>{countSyllables(selected.text)}</strong>
              </div>
              <div className="lyric-token-row">
                {selectedRhymes.exact.map((r) => <button key={r} onClick={() => addHookIdea(r)}>{r}</button>)}
              </div>
              <div className="text-[10px] text-gray-500">Near rhymes</div>
              <div className="lyric-token-row">
                {selectedRhymes.near.map((r) => <button key={r} onClick={() => addUnusedLine(r)}>{r}</button>)}
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500">Select a line to see rhyme and flow tools.</div>
          )}
        </section>

        <section>
          <div className="studio-label">Hook Ideas</div>
          <div className="lyric-bank">
            {(studio?.hookIdeas ?? []).slice(0, 8).map((idea, i) => <div key={`${idea}:${i}`}>{idea}</div>)}
            {(studio?.hookIdeas ?? []).length === 0 && <span>No hook ideas saved.</span>}
          </div>
        </section>

        <section>
          <div className="studio-label">Unused Lines</div>
          <div className="lyric-bank">
            {(studio?.unusedLines ?? []).slice(0, 8).map((line, i) => <div key={`${line}:${i}`}>{line}</div>)}
            {(studio?.unusedLines ?? []).length === 0 && <span>No unused lines saved.</span>}
          </div>
        </section>

        <section>
          <div className="studio-label">Idea Bank</div>
          <div className="flex gap-2">
            <input value={bankText} onChange={(e) => setBankText(e.target.value)} placeholder="new hook or unused line" />
            <button onClick={() => { addHookIdea(bankText); setBankText(""); }}>Hook</button>
            <button onClick={() => { addUnusedLine(bankText); setBankText(""); }}>Unused</button>
          </div>
        </section>

        <section>
          <div className="studio-label">Repeated Words</div>
          <div className="lyric-token-row">
            {repeated.length ? repeated.slice(0, 12).map((word) => <span key={word}>{word}</span>) : <span>No heavy repeats.</span>}
          </div>
        </section>
      </aside>
    </div>
  );
}
