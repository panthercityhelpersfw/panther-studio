import { useMemo, useState } from "react";
import { KEY_NAMES } from "../audio/autotune";
import { useStore } from "../state/store";
import { formatTime } from "../utils/format";

type SuiteTab = "beat" | "vocal" | "cleanup" | "warmups" | "breakdown" | "team";

const tabs: Array<{ id: SuiteTab; label: string }> = [
  { id: "beat", label: "Beat Intelligence" },
  { id: "vocal", label: "Vocal Coach" },
  { id: "cleanup", label: "Mic Cleanup" },
  { id: "warmups", label: "Warmups" },
  { id: "breakdown", label: "Song Breakdown" },
  { id: "team", label: "AI Producer Notes" },
];

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div className="suite-meter">
      <div>
        <span>{label}</span>
        <strong>{Math.round(value)}%</strong>
      </div>
      <i style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </div>
  );
}

function LiveQueued({ live, queued }: { live: string[]; queued: string[] }) {
  return (
    <div className="suite-live-grid">
      <div>
        <span>Live</span>
        {live.map((item) => <b key={item}>{item}</b>)}
      </div>
      <div>
        <span>Queued</span>
        {queued.map((item) => <b key={item}>{item}</b>)}
      </div>
    </div>
  );
}

function BeatPanel() {
  const analysis = useStore((s) => s.project.beatIntelligence);
  const selectedClipId = useStore((s) => s.selectedClipId);
  const analyzing = useStore((s) => s.analyzing);
  const analyze = useStore((s) => s.analyzeBeatIntelligence);
  const applyTempo = useStore((s) => s.applyBeatTempoToProject);
  const alignClip = useStore((s) => s.autoAlignSelectedClipToGrid);
  const tapTempo = useStore((s) => s.tapTempo);

  return (
    <div className="suite-pane suite-beat-grid">
      <section className="suite-command-panel">
        <div>
          <p className="suite-kicker">Tempo, downbeats, grid</p>
          <h3>{analysis ? `${analysis.bpm} BPM` : "No beat scan yet"}</h3>
          <span>{analysis ? `${analysis.sourceName} / ${Math.round(analysis.confidence * 100)}% confidence` : "Import a beat or song, then scan the selected audio clip."}</span>
        </div>
        <div className="suite-actions">
          <button onClick={() => void analyze(selectedClipId ?? undefined)} disabled={analyzing}>{analyzing ? "Scanning..." : "Analyze Beat"}</button>
          <button onClick={applyTempo} disabled={!analysis}>Apply Tempo</button>
          <button onClick={alignClip} disabled={!analysis || !selectedClipId}>Align Clip</button>
          <button onClick={tapTempo}>Tap Tempo</button>
        </div>
      </section>

      <section className="suite-wave-panel">
        <div className="suite-wave-ruler">
          {(analysis?.beatGrid.slice(0, 48) ?? []).map((beat) => (
            <i key={beat.id} className={beat.downbeat ? "is-downbeat" : ""} title={`Bar ${beat.bar}, beat ${beat.beat} @ ${formatTime(beat.timeSec)}`} />
          ))}
          {!analysis && Array.from({ length: 32 }, (_, i) => <i key={i} />)}
        </div>
        <div className="suite-readouts">
          <Meter label="Tempo Confidence" value={(analysis?.confidence ?? 0) * 100} />
          <Meter label="Grid Lock" value={analysis ? Math.round(analysis.beatGrid.reduce((sum, b) => sum + b.confidence, 0) / Math.max(1, analysis.beatGrid.length) * 100) : 0} />
        </div>
      </section>

      {analysis && <LiveQueued live={analysis.live} queued={analysis.queued} />}
    </div>
  );
}

function BreakdownPanel() {
  const analysis = useStore((s) => s.project.beatIntelligence);
  if (!analysis) {
    return <div className="suite-empty">Run Beat Intelligence to generate the song map, key estimate, energy changes, and producer notes.</div>;
  }
  return (
    <div className="suite-pane suite-breakdown">
      <div className="suite-summary-strip">
        <div><span>Key</span><strong>{analysis.breakdown.keyEstimate} {analysis.breakdown.scaleEstimate}</strong></div>
        <div><span>Mood</span><strong>{analysis.breakdown.chordMood}</strong></div>
        <div><span>Downbeat</span><strong>{formatTime(analysis.downbeatSec)}</strong></div>
      </div>
      <div className="suite-section-list">
        {analysis.breakdown.sections.map((section) => (
          <article key={section.id} className="suite-section-row">
            <div>
              <strong>{section.name}</strong>
              <span>{formatTime(section.startSec)} - {formatTime(section.endSec)}</span>
            </div>
            <Meter label="Energy" value={section.energy * 100} />
            <Meter label="Vocal Space" value={section.vocalSpace * 100} />
            <p>{section.notes.join(" ")}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function VocalCoachPanel() {
  const selectedClipId = useStore((s) => s.selectedClipId);
  const report = useStore((s) => s.project.vocalTuneAssist);
  const analyzeTuneAssist = useStore((s) => s.analyzeTuneAssist);
  const applyTuneAssistSettings = useStore((s) => s.applyTuneAssistSettings);
  const applyAutotune = useStore((s) => s.applyAutotune);
  const analyzeTake = useStore((s) => s.analyzeTake);
  const processing = useStore((s) => s.processing);

  return (
    <div className="suite-pane suite-vocal-grid">
      <section className="suite-command-panel">
        <div>
          <p className="suite-kicker">Tune Assist</p>
          <h3>{report ? `${report.sharpFlat.toUpperCase()} / ${report.pitchScore}` : "Select a vocal take"}</h3>
          <span>{report ? `Suggested ${KEY_NAMES[report.suggestedKey]} ${report.suggestedScale}, strength ${Math.round(report.suggestedAutotuneStrength * 100)}%` : "Analyzes pitch trend, timing, breath, delivery, and emotion."}</span>
        </div>
        <div className="suite-actions">
          <button onClick={() => selectedClipId && analyzeTuneAssist(selectedClipId)} disabled={!selectedClipId}>Run Tune Assist</button>
          <button onClick={() => selectedClipId && analyzeTake(selectedClipId)} disabled={!selectedClipId}>Analyze Take</button>
          <button onClick={applyTuneAssistSettings} disabled={!report}>Load Settings</button>
          <button onClick={() => selectedClipId && void applyAutotune(selectedClipId)} disabled={!report || !selectedClipId || processing}>{processing ? "Tuning..." : "Apply Tune"}</button>
        </div>
      </section>
      <section className="suite-score-panel">
        <Meter label="Pitch" value={report?.pitchScore ?? 0} />
        <Meter label="Timing" value={report?.timingScore ?? 0} />
        <Meter label="Breath" value={report?.breathScore ?? 0} />
        <Meter label="Delivery" value={report?.deliveryScore ?? 0} />
        <Meter label="Emotion" value={report?.emotionScore ?? 0} />
      </section>
      <section className="suite-notes-panel">
        {(report?.retakeNotes ?? ["Run Tune Assist for sharp/flat, AutoTune, timing, breath, delivery, and emotion notes."]).map((note) => <p key={note}>{note}</p>)}
      </section>
      {report && <LiveQueued live={report.live} queued={report.queued} />}
    </div>
  );
}

function CleanupPanel() {
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const selectedClipId = useStore((s) => s.selectedClipId);
  const applyBedroomStudioCleaner = useStore((s) => s.applyBedroomStudioCleaner);
  const applyCleanup = useStore((s) => s.applyCleanup);
  const processing = useStore((s) => s.processing);
  const chain = ["Noise gate", "Background noise reduction", "De-esser", "Compressor", "EQ cleanup", "Low cut", "Room tone reducer", "Plosive control", "Air boost", "Output limiter"];

  return (
    <div className="suite-pane suite-cleanup-grid">
      <section className="suite-command-panel">
        <div>
          <p className="suite-kicker">Condenser mic preset</p>
          <h3>Bedroom Studio Cleaner</h3>
          <span>Designed for untreated rooms, close condenser mics, computer fan bleed, low-mid boxiness, and plosives.</span>
        </div>
        <div className="suite-actions">
          <button onClick={() => applyBedroomStudioCleaner(selectedTrackId ?? undefined)} disabled={!selectedTrackId}>Apply Chain</button>
          <button onClick={() => selectedClipId && void applyCleanup(selectedClipId, true)} disabled={!selectedClipId || processing}>{processing ? "Cleaning..." : "Clean Take"}</button>
        </div>
      </section>
      <div className="suite-chain-list">
        {chain.map((stage, index) => <span key={stage}><b>{index + 1}</b>{stage}</span>)}
      </div>
      <div className="suite-empty is-compact">Live: real FX-chain preset plus offline cleanup render. Queued: spectral-room fingerprinting and plosive-specific offline repair.</div>
    </div>
  );
}

function WarmupsPanel() {
  const warmups = useStore((s) => s.project.vocalWarmups);
  const complete = useStore((s) => s.completeWarmupDrill);
  const drills = warmups?.drills ?? [];
  return (
    <div className="suite-pane suite-warmup-grid">
      <div className="suite-drill-list">
        {drills.map((drill) => (
          <button key={drill.id} onClick={() => complete(drill.id)} className={drill.completedAt ? "is-done" : ""}>
            <strong>{drill.title}</strong>
            <span>{drill.durationMin} min / {drill.category}</span>
            <p>{drill.instruction}</p>
          </button>
        ))}
      </div>
      <aside className="suite-notes-panel">
        <h4>AI Feedback After Takes</h4>
        {(warmups?.lastFeedback.length ? warmups.lastFeedback : ["Complete a drill or run Tune Assist after a take to build feedback here."]).map((item) => <p key={item}>{item}</p>)}
      </aside>
    </div>
  );
}

function ProducerNotesPanel() {
  const beat = useStore((s) => s.project.beatIntelligence);
  const tune = useStore((s) => s.project.vocalTuneAssist);
  const project = useStore((s) => s.project);
  const addIdeaToNotes = useStore((s) => s.addIdeaToNotes);
  const notes = useMemo(() => {
    const beatNotes = beat?.breakdown.producerNotes ?? [];
    return [
      { role: "Vocal Coach", text: tune ? tune.retakeNotes[0] : "Run Tune Assist on a selected vocal before committing the take." },
      { role: "Mixing Engineer", text: beatNotes.find((n) => n.includes("Low mids")) ?? "Keep the vocal high-pass active and watch 250-400 Hz on dense beats." },
      { role: "Songwriter", text: "Make the hook title phrase repeatable; verses can be denser, hooks need cleaner vowels." },
      { role: "Producer", text: beatNotes[0] ?? "Map the sections first, then record vocals against the highest-energy pocket." },
      { role: "A&R Critic", text: project.clips.length < 2 ? "The session needs a beat and at least one lead vocal before it feels pitch-ready." : "Cut anything that does not make the hook easier to remember." },
    ];
  }, [beat, tune, project.clips.length]);

  return (
    <div className="suite-pane suite-team-grid">
      {notes.map((note) => (
        <article key={note.role} className="suite-role-card">
          <span>{note.role}</span>
          <p>{note.text}</p>
          <button onClick={() => addIdeaToNotes(`${note.role}: ${note.text}`)}>Save note</button>
        </article>
      ))}
      {beat && <LiveQueued live={beat.live} queued={beat.queued} />}
    </div>
  );
}

export function AIProducerSuite() {
  const [tab, setTab] = useState<SuiteTab>("beat");
  const active = tabs.find((item) => item.id === tab) ?? tabs[0];

  return (
    <div className="producer-suite">
      <aside className="producer-suite__rail">
        <div>
          <span>Panther AI</span>
          <strong>{active.label}</strong>
        </div>
        {tabs.map((item) => (
          <button key={item.id} onClick={() => setTab(item.id)} className={tab === item.id ? "is-active" : ""}>
            {item.label}
          </button>
        ))}
      </aside>
      <main className="producer-suite__main">
        {tab === "beat" && <BeatPanel />}
        {tab === "vocal" && <VocalCoachPanel />}
        {tab === "cleanup" && <CleanupPanel />}
        {tab === "warmups" && <WarmupsPanel />}
        {tab === "breakdown" && <BreakdownPanel />}
        {tab === "team" && <ProducerNotesPanel />}
      </main>
    </div>
  );
}
