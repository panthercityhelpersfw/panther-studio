import { liveWarmupsForFocus } from "../audio/liveVocalDirector";
import { useStore } from "../state/store";

const modeLabels = {
  engineer: "Engineer",
  producer: "Producer",
  vocalCoach: "Vocal Coach",
  artistDevelopment: "Artist Dev",
} as const;

const focusLabels = {
  singing: "Singing",
  rap: "Rap",
  melodicRap: "Melodic Rap",
  aggressive: "Aggressive",
  soft: "Soft",
} as const;

function toneClass(severity: "ok" | "warn" | "bad") {
  return severity === "bad" ? "is-bad" : severity === "warn" ? "is-warn" : "is-ok";
}

export function LiveVocalDirector() {
  const director = useStore((s) => s.project.liveVocalDirector);
  const recording = useStore((s) => s.recording);
  const setEnabled = useStore((s) => s.setLiveDirectorEnabled);
  const setOpen = useStore((s) => s.setLiveDirectorOpen);
  const setMode = useStore((s) => s.setLiveDirectorMode);
  const setFocus = useStore((s) => s.setLiveDirectorWarmupFocus);
  const completeWarmup = useStore((s) => s.completeLiveDirectorWarmup);
  const replayMarker = useStore((s) => s.replayLiveDirectorMarker);
  const retakeMarker = useStore((s) => s.retakeLiveDirectorMarker);
  const clearSession = useStore((s) => s.clearLiveDirectorSession);
  const runMagicMic = useStore((s) => s.runMagicMicChain);

  if (!director?.floatingOpen) {
    return (
      <button className="live-director-launch" onClick={() => setOpen(true)}>
        AI Director
      </button>
    );
  }

  const warmups = liveWarmupsForFocus(director.warmupFocus);
  const recentMarkers = [...director.markers].slice(-7).reverse();
  const recentWords = [...director.wordFeedback].slice(-5).reverse();
  const latestTake = director.takeSummaries[0];
  const latestProgress = director.progress[0];

  return (
    <aside className={`live-director ${recording ? "is-recording" : ""}`}>
      <header className="live-director__header">
        <div>
          <span>Live AI Vocal Director</span>
          <h2>{recording ? "Listening Live" : "Coach Standby"}</h2>
        </div>
        <div className="live-director__head-actions">
          <button onClick={() => setEnabled(!director.enabled)} className={director.enabled ? "is-on" : ""}>
            {director.enabled ? "On" : "Off"}
          </button>
          <button onClick={() => setOpen(false)}>Hide</button>
        </div>
      </header>

      <section className={`live-director__score ${toneClass(director.currentSeverity)}`}>
        <div>
          <strong>{director.currentScore || "--"}</strong>
          <span>Take Quality</span>
        </div>
        <p>{director.currentMessage}</p>
        <small>{director.workerLive ? "Worker analysis live" : "Main-thread fallback"} / {director.status}</small>
      </section>

      <div className="live-director__modes">
        {(Object.keys(modeLabels) as Array<keyof typeof modeLabels>).map((mode) => (
          <button key={mode} onClick={() => setMode(mode)} className={director.mode === mode ? "is-active" : ""}>
            {modeLabels[mode]}
          </button>
        ))}
      </div>

      <section className="live-director__section">
        <div className="live-director__section-head">
          <h3>Before Recording</h3>
          <select value={director.warmupFocus} onChange={(e) => setFocus(e.target.value as typeof director.warmupFocus)}>
            {(Object.keys(focusLabels) as Array<keyof typeof focusLabels>).map((focus) => (
              <option key={focus} value={focus}>{focusLabels[focus]}</option>
            ))}
          </select>
        </div>
        <div className="live-warmups">
          {warmups.map((drill) => (
            <button key={drill.id} onClick={() => completeWarmup(drill.title)}>
              <b>{drill.title}</b>
              <span>{drill.durationMin} min / {drill.instruction}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="live-director__section">
        <div className="live-director__section-head">
          <h3>Timeline Issues</h3>
          <button onClick={clearSession}>Clear</button>
        </div>
        <div className="live-marker-list">
          {recentMarkers.map((marker) => (
            <article key={marker.id} className={toneClass(marker.severity)}>
              <div>
                <b>{marker.message}</b>
                <span>{marker.timeSec.toFixed(1)}s / {marker.kind}</span>
              </div>
              <p>{marker.why}</p>
              <small>{marker.fix}</small>
              <footer>
                <button onClick={() => replayMarker(marker.id)}>Replay</button>
                <button onClick={() => retakeMarker(marker.id)}>Retake loop</button>
              </footer>
            </article>
          ))}
          {recentMarkers.length === 0 && <p className="live-director__empty">Record with the director on to generate live green/yellow/red zones.</p>}
        </div>
      </section>

      <section className="live-director__section">
        <h3>Word-Level Feedback</h3>
        <div className="live-word-list">
          {recentWords.map((word) => (
            <div key={word.id} className={toneClass(word.severity)}>
              <b>{word.word}</b>
              <span>{word.suggestion}</span>
              <small>{word.pronunciation}</small>
            </div>
          ))}
          {recentWords.length === 0 && <p className="live-director__empty">Attach lyric lines to regions for word-specific live coaching.</p>}
        </div>
      </section>

      <section className="live-director__section live-director__grid">
        <div>
          <h3>Retake Director</h3>
          <p>{latestTake ? `${latestTake.redoZones.length} redo zones / ${latestTake.bestSegments.length} best segments` : "A summary appears after each take."}</p>
          {(latestTake?.compSuggestions ?? ["Record a pass to generate comp recommendations."]).slice(0, 2).map((item) => <small key={item}>{item}</small>)}
        </div>
        <div>
          <h3>Progress</h3>
          <p>{latestProgress ? `${latestProgress.score}/100 session score` : "No live progress yet."}</p>
          {(director.weeklySummary.length ? director.weeklySummary : ["Weekly improvement summaries build from live takes."]).slice(0, 3).map((item) => <small key={item}>{item}</small>)}
        </div>
      </section>

      <button className="live-director__mic-fix" onClick={() => void runMagicMic()}>
        Run Mic Fault Check
      </button>
    </aside>
  );
}
