import { useEffect, useRef, useState } from "react";
import { normalizeBeatBrowser } from "../audio/beatDiscovery";
import { useStore } from "../state/store";
import type { BeatSearchResult } from "../state/types";

const energyLabel = (v: number) => (v >= 0.68 ? "High" : v >= 0.4 ? "Medium" : "Low");

function WaveformMini({ values }: { values: number[] }) {
  return (
    <div className="beat-wave-mini" aria-hidden="true">
      {values.map((value, index) => <i key={index} style={{ height: `${Math.round(value * 100)}%` }} />)}
    </div>
  );
}

function BeatCard({
  result,
  onPreview,
  onImport,
  onFavorite,
  onPin,
}: {
  result: BeatSearchResult;
  onPreview: () => void;
  onImport: () => void;
  onFavorite: () => void;
  onPin: () => void;
}) {
  return (
    <article
      className="beat-card"
      draggable={!!result.assetId}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-panther-beat-result", result.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      <div className="beat-card__head">
        <div className="min-w-0">
          <h4>{result.title}</h4>
          <span>{result.producer} / {result.source}</span>
        </div>
        <button onClick={onFavorite} className={result.favorite ? "is-fav" : ""}>{result.favorite ? "Starred" : "Star"}</button>
      </div>
      <WaveformMini values={result.waveform} />
      <div className="beat-card__meta">
        <b>{result.bpm ? `${result.bpm} BPM` : "Analyze BPM"}</b>
        <b>{result.key ?? "Key ?"}</b>
        <b>{energyLabel(result.energy)}</b>
      </div>
      <p>{result.ai.vocalPreset}. {result.ai.flowPacing}.</p>
      <div className="beat-card__tags">
        {[...result.genre, ...result.mood, ...result.tags].slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}
      </div>
      <div className="beat-card__actions">
        <button onClick={onPreview} disabled={!result.assetId}>Preview</button>
        <button onClick={onImport} disabled={!result.assetId}>Import</button>
        <button onClick={onPin}>{result.pinnedProjectId ? "Unpin" : "Pin"}</button>
      </div>
    </article>
  );
}

export function BeatBrowser() {
  const open = useStore((s) => s.beatBrowserOpen);
  const setOpen = useStore((s) => s.setBeatBrowserOpen);
  const project = useStore((s) => s.project);
  const browser = useStore((s) => normalizeBeatBrowser(s.project.beatBrowser));
  const updateFilters = useStore((s) => s.updateBeatSearchFilters);
  const searchBeats = useStore((s) => s.searchBeats);
  const preview = useStore((s) => s.previewBeatResult);
  const importBeat = useStore((s) => s.importBeatResultToTimeline);
  const toggleFavorite = useStore((s) => s.toggleBeatFavorite);
  const pinBeat = useStore((s) => s.pinBeatToProject);
  const addCrate = useStore((s) => s.addBeatCrate);
  const addToCrate = useStore((s) => s.addBeatToCrate);
  const setYouTubeUrl = useStore((s) => s.setYouTubeImportUrl);
  const importYouTubeOwnedAudio = useStore((s) => s.importYouTubeOwnedAudio);
  const enableArtistMode = useStore((s) => s.enableArtistMode);
  const runSessionAI = useStore((s) => s.runSessionAI);
  const fileRef = useRef<HTMLInputElement>(null);
  const [crateName, setCrateName] = useState("");

  useEffect(() => {
    if (open && (browser?.results.length ?? 0) === 0) void searchBeats();
  }, [open, browser?.results.length, searchBeats]);

  if (!open) return null;

  const filters = browser.filters;
  const queuedProviders = browser.providerStatuses.filter((provider) => !provider.live);
  const liveProviders = browser.providerStatuses.filter((provider) => provider.live);
  const selected = browser.results.find((result) => result.id === browser.selectedResultId) ?? browser.results[0] ?? null;
  const hookLines = (project.lyricStudio?.lines ?? []).filter((line) => line.section === "hook" && line.text.trim());
  const hookWords = hookLines.flatMap((line) => line.text.toLowerCase().split(/\s+/).filter(Boolean));
  const repeatedHookWords = hookWords.filter((word, index) => hookWords.indexOf(word) !== index);
  const hookScore = Math.min(100, Math.round(35 + hookLines.length * 14 + new Set(repeatedHookWords).size * 9 + (selected?.energy ?? 0) * 22));

  return (
    <div className="beat-browser-shell">
      <aside className="beat-browser">
        <header className="beat-browser__header">
          <div>
            <span>Producer Ecosystem</span>
            <h2>Beat Browser</h2>
          </div>
          <button onClick={() => setOpen(false)}>Close</button>
        </header>

        <section className="beat-search-panel">
          <input
            value={filters.query}
            onChange={(e) => updateFilters({ query: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") void searchBeats(); }}
            placeholder="Dark trap 140 BPM Travis Scott type beat"
          />
          <div className="beat-chip-row">
            {["trap", "rnb", "pop", "drill", "dark", "chill", "type beat"].map((chip) => (
              <button key={chip} onClick={() => updateFilters({ query: `${filters.query} ${chip}`.trim() })}>{chip}</button>
            ))}
          </div>
          <div className="beat-filter-grid">
            <input value={filters.genre} onChange={(e) => updateFilters({ genre: e.target.value })} placeholder="Genre" />
            <input value={filters.mood} onChange={(e) => updateFilters({ mood: e.target.value })} placeholder="Mood" />
            <input value={filters.artistStyle} onChange={(e) => updateFilters({ artistStyle: e.target.value })} placeholder="Artist style" />
            <select value={filters.energy} onChange={(e) => updateFilters({ energy: e.target.value as typeof filters.energy })}>
              <option value="any">Any energy</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <button onClick={() => void searchBeats()} disabled={browser.searchBusy} className="beat-search-btn">
            {browser.searchBusy ? "Searching..." : "Search Beats"}
          </button>
        </section>

        <section className="beat-provider-strip">
          <h3>Sources</h3>
          <div>
            {liveProviders.map((provider) => <span key={provider.source} className="is-live">{provider.label}</span>)}
            {queuedProviders.map((provider) => <span key={provider.source}>{provider.label}</span>)}
          </div>
        </section>

        <section className="beat-youtube-safe">
          <h3>YouTube Safe Import</h3>
          <input
            value={browser.youtubeImport.url}
            onChange={(e) => setYouTubeUrl(e.target.value)}
            placeholder="Paste YouTube URL for attribution"
          />
          <p>{browser.youtubeImport.note}</p>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importYouTubeOwnedAudio(file);
              e.currentTarget.value = "";
            }}
          />
          <button onClick={() => fileRef.current?.click()}>Attach owned audio</button>
        </section>

        <section className="beat-power-tools">
          <button onClick={() => void enableArtistMode()}>Artist Mode</button>
          <button onClick={() => void runSessionAI()}>Session AI</button>
        </section>
      </aside>

      <main className="beat-results">
        <div className="beat-results__top">
          <div>
            <span>{browser.results.length} results</span>
            <h3>Search, preview, favorite, crate, drag to timeline</h3>
          </div>
          <div className="beat-crate-maker">
            <input value={crateName} onChange={(e) => setCrateName(e.target.value)} placeholder="New crate" />
            <button onClick={() => { addCrate(crateName); setCrateName(""); }}>Create</button>
          </div>
        </div>

        <div className="beat-card-grid">
          {browser.results.map((result) => (
            <BeatCard
              key={result.id}
              result={result}
              onPreview={() => void preview(result.id)}
              onImport={() => void importBeat(result.id)}
              onFavorite={() => toggleFavorite(result.id)}
              onPin={() => pinBeat(result.id)}
            />
          ))}
          {browser.results.length === 0 && (
            <div className="beat-empty">
              <strong>No live local matches yet.</strong>
              <span>Import a beat, attach owned audio, or connect a future provider. External sources are scaffolded without unsafe downloader behavior.</span>
            </div>
          )}
        </div>
      </main>

      <aside className="beat-detail">
        <h3>AI Beat Match</h3>
        {selected ? (
          <>
            <WaveformMini values={selected.waveform} />
            <dl>
              <div><dt>Vocal preset</dt><dd>{selected.ai.vocalPreset}</dd></div>
              <div><dt>Mic chain</dt><dd>{selected.ai.micChain}</dd></div>
              <div><dt>Autotune</dt><dd>{selected.ai.autotune}</dd></div>
              <div><dt>Vocal style</dt><dd>{selected.ai.vocalStyle}</dd></div>
              <div><dt>Effects</dt><dd>{selected.ai.effects}</dd></div>
              <div><dt>Flow pacing</dt><dd>{selected.ai.flowPacing}</dd></div>
            </dl>
            <div className="beat-crates">
              <span>Crates</span>
              {browser.crates.map((crate) => (
                <button key={crate.id} onClick={() => addToCrate(crate.id, selected.id)}>
                  {crate.name} ({crate.resultIds.length})
                </button>
              ))}
            </div>
            <section className="marketplace-slate">
              <span>Flow Finder</span>
              <p>{selected.energy > 0.68 ? "High-energy beat: tighten bar endings, leave breath before drops, and use adlibs after the hook line." : "Medium/low-energy pocket: use more cadence variation in verses and simplify the hook rhythm."}</p>
            </section>
            <section className="marketplace-slate">
              <span>Hook Analyzer</span>
              <p>Catchiness {hookScore}/100. {hookLines.length ? "Hook has lyric material to evaluate; repetition and energy are being scored locally." : "Write hook lines in Lyric Studio to score repetition, memorability, and energy."}</p>
            </section>
          </>
        ) : (
          <p>Select a beat to see vocal presets, mic chain, effects, flow pacing, and arrangement guidance.</p>
        )}
        <section className="marketplace-slate">
          <span>Marketplace Architecture</span>
          <p>Profiles, leases, sales, uploads, collaborations, splits, comments, and reviews are modeled. Payments and rights verification are queued.</p>
        </section>
      </aside>
    </div>
  );
}
