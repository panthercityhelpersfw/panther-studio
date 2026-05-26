import { useEffect, useState } from "react";
import { audioEngine } from "../audio/AudioEngine";
import { estimateStorage } from "../persistence/db";
import { useStore } from "../state/store";
import { formatBytes } from "../utils/format";
import { getAppPaths, isTauri } from "../tauri";
import {
  getUpdaterDiagnostics,
  openUpdateFeedUrl,
  updateDiagnosticsText,
  type UpdateDiagnostics,
} from "../updater";

const ACCENTS: { name: string; rgb: string }[] = [
  { name: "Violet", rgb: "124 92 255" },
  { name: "Blue", rgb: "77 141 255" },
  { name: "Green", rgb: "61 220 151" },
  { name: "Gold", rgb: "232 179 65" },
  { name: "Pink", rgb: "255 122 217" },
  { name: "Cyan", rgb: "57 211 224" },
];

const SHORTCUTS: [string, string][] = [
  ["Space", "Play / Pause"],
  ["R", "Record"],
  ["S", "Split clip at playhead"],
  ["L", "Toggle loop"],
  ["Delete", "Delete selected clip"],
  ["Ctrl/Cmd + S", "Save"],
  ["Ctrl/Cmd + Z", "Undo"],
  ["Ctrl/Cmd + Shift + Z", "Redo"],
  ["Esc", "Stop / close editor"],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">{title}</h3>
      {children}
    </section>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`w-11 h-6 rounded-full relative transition-colors ${on ? "bg-panther-green" : "bg-panel-600"}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${on ? "left-5" : "left-0.5"}`} />
    </button>
  );
}

function Pref({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div>
        <div className="text-sm">{label}</div>
        {hint && <div className="text-[11px] text-gray-500">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function Preferences() {
  const s = useStore();
  const [storage, setStorage] = useState("");
  const [dataDir, setDataDir] = useState("");
  const [version, setVersion] = useState("0.1.0");
  const [perf, setPerf] = useState(audioEngine.getPerfInfo());
  const [confirmReset, setConfirmReset] = useState(false);
  const [diagnostics, setDiagnostics] = useState<UpdateDiagnostics | null>(null);
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);

  useEffect(() => {
    if (!s.prefsOpen) return;
    void estimateStorage().then((e) => e && setStorage(`${formatBytes(e.usage)} of ${formatBytes(e.quota)}`));
    void getAppPaths().then((p) => { if (p) { setDataDir(p.app_data_dir); setVersion(p.version); } });
    void getUpdaterDiagnostics(s.releaseChannel).then(setDiagnostics);
    const id = setInterval(() => setPerf(audioEngine.getPerfInfo()), 1000);
    return () => clearInterval(id);
  }, [s.prefsOpen, s.releaseChannel]);

  useEffect(() => {
    if (s.updateInfo?.diagnostics) setDiagnostics(s.updateInfo.diagnostics);
  }, [s.updateInfo]);

  if (!s.prefsOpen) return null;

  const glitchRisk = perf.baseLatencyMs > 40 || perf.activeVoices > 64;
  const activeDiagnostics = diagnostics ?? s.updateInfo?.diagnostics;
  const copyDiagnostics = async () => {
    if (!activeDiagnostics) return;
    await navigator.clipboard?.writeText(updateDiagnosticsText(activeDiagnostics));
    setDiagnosticsCopied(true);
    window.setTimeout(() => setDiagnosticsCopied(false), 1600);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
      <div className="bg-panel-850 rounded-lg border border-white/10 shadow-2xl w-[640px] max-h-[85vh] flex flex-col">
        <div className="px-5 py-3 border-b border-black/40 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Preferences</h2>
          <button onClick={() => s.setPrefsOpen(false)} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <Section title="Audio & performance">
            <Pref label="Low-CPU mode" hint="Reduces meter/visualizer update rate for weaker machines">
              <Toggle on={s.lowCpuMode} onChange={s.setLowCpuMode} />
            </Pref>
            <Pref label="Disable visualizers" hint="Stops the spectrum analyzer drawing">
              <Toggle on={s.disableVisualizers} onChange={s.setDisableVisualizers} />
            </Pref>
            <div className="bg-panel-900 rounded p-2 border border-white/5 text-[11px] font-mono text-gray-400 space-y-0.5">
              <div>Sample rate: {perf.sampleRate || "—"} Hz · Output latency: {perf.baseLatencyMs} ms</div>
              <div>Active voices: {perf.activeVoices} · Tracks: {perf.trackCount} · Context: {perf.contextState}</div>
              <div className={glitchRisk ? "text-panther-gold" : "text-panther-green"}>
                {glitchRisk ? "⚠ Glitch risk elevated — try Low-CPU mode or fewer effects." : "✓ Audio load looks healthy."}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap pt-1">
              <button onClick={() => void s.clearUnusedAudio()} className="text-xs bg-panel-700 hover:bg-panel-650 rounded px-3 py-1.5">Clear unused audio</button>
              <button onClick={() => void s.projectCleanup()} className="text-xs bg-panel-700 hover:bg-panel-650 rounded px-3 py-1.5">Project cleanup</button>
            </div>
            <div className="text-[11px] text-gray-600">Freeze (❄) or Bounce a track from its header to render its effects to audio and free CPU. Frozen tracks reduce live processing load.</div>
          </Section>

          <Section title="Input device">
            <Pref label="Microphone" hint={s.permission === "granted" ? "Connected" : "Not enabled"}>
              <button onClick={() => { s.setPrefsOpen(false); s.setMicPanelOpen(true); }} className="text-xs bg-panel-700 hover:bg-panel-650 rounded px-3 py-1.5">
                Open input settings
              </button>
            </Pref>
          </Section>

          <Section title="Theme">
            <div className="flex gap-2 flex-wrap">
              {ACCENTS.map((a) => (
                <button
                  key={a.rgb}
                  onClick={() => s.setAccent(a.rgb)}
                  className={`w-8 h-8 rounded-full border-2 ${s.accent === a.rgb ? "border-white" : "border-transparent"}`}
                  style={{ background: `rgb(${a.rgb})` }}
                  title={a.name}
                />
              ))}
            </div>
            <div className="text-[11px] text-gray-500">Panther Studio uses a dark theme; choose your accent color.</div>
          </Section>

          <Section title="Saving">
            <Pref label="Autosave interval" hint="Background safety save while you work">
              <select value={s.autosaveIntervalSec} onChange={(e) => s.setAutosaveInterval(parseInt(e.target.value))} className="bg-panel-900 border border-white/10 rounded px-2 py-1 text-sm">
                {[10, 20, 30, 60, 120].map((v) => <option key={v} value={v}>{v}s</option>)}
              </select>
            </Pref>
            <Pref label="Count-in" hint="Bars of metronome before recording">
              <select value={s.countInBars} onChange={(e) => s.setCountInBars(parseInt(e.target.value))} className="bg-panel-900 border border-white/10 rounded px-2 py-1 text-sm">
                {[0, 1, 2, 4].map((v) => <option key={v} value={v}>{v === 0 ? "Off" : `${v} bar${v > 1 ? "s" : ""}`}</option>)}
              </select>
            </Pref>
          </Section>

          <Section title="Updates">
            {activeDiagnostics?.localUpdateTestMode && (
              <div className="rounded border border-panther-gold/40 bg-panther-gold/10 px-3 py-2 text-xs text-panther-gold">
                Local update test mode
              </div>
            )}
            <Pref label="Release channel" hint="Stable is recommended for production projects">
              <select value={s.releaseChannel} onChange={(e) => s.setReleaseChannel(e.target.value as "stable" | "beta")} className="bg-panel-900 border border-white/10 rounded px-2 py-1 text-sm">
                <option value="stable">Stable</option>
                <option value="beta">Beta</option>
              </select>
            </Pref>
            <Pref label="Download updates in background" hint="Downloads only after Panther finds a signed update">
              <Toggle on={s.autoDownloadUpdates} onChange={s.setAutoDownloadUpdates} />
            </Pref>
            <Pref label="Install on close" hint="Installs a downloaded update when you close Panther Studio">
              <Toggle on={s.installUpdatesOnClose} onChange={s.setInstallUpdatesOnClose} />
            </Pref>
            <Pref label="Check for updates on launch">
              <Toggle on={s.autoCheckUpdates} onChange={s.setAutoCheckUpdates} />
            </Pref>
            <div className="flex items-center gap-2">
              <button onClick={() => void s.checkForUpdatesNow()} disabled={s.checkingUpdate} className="text-xs bg-accent hover:bg-accent-hover text-white rounded px-3 py-1.5 disabled:opacity-50">
                {s.checkingUpdate ? "Checking…" : "Check for updates"}
              </button>
              {s.updateInfo?.phase === "available" && !s.updateInfo.blocked && (
                <button onClick={() => void s.downloadUpdateNow()} disabled={s.checkingUpdate} className="text-xs bg-panel-700 hover:bg-panel-650 rounded px-3 py-1.5 disabled:opacity-50">
                  Download
                </button>
              )}
              {s.updateInfo?.downloaded && (
                <button onClick={() => void s.installUpdateNow()} disabled={s.checkingUpdate} className="text-xs bg-panther-green text-black rounded px-3 py-1.5 disabled:opacity-50">
                  Install & restart
                </button>
              )}
              <span className="text-[11px] text-gray-400">{s.updateStatus}</span>
            </div>
            {activeDiagnostics && (
              <div className="bg-panel-900 rounded p-2 border border-white/5 text-[11px] text-gray-400 space-y-1">
                <div className="grid grid-cols-[145px_1fr] gap-x-2 gap-y-1">
                  <span className="text-gray-500">Current version</span>
                  <span>{activeDiagnostics.currentVersion}</span>
                  <span className="text-gray-500">Release channel</span>
                  <span>{activeDiagnostics.releaseChannel}</span>
                  <span className="text-gray-500">Updater enabled</span>
                  <span>{String(activeDiagnostics.updaterEnabled)}</span>
                  <span className="text-gray-500">Update endpoint</span>
                  <span className="break-all">{activeDiagnostics.updateEndpoint}</span>
                  <span className="text-gray-500">Last checked</span>
                  <span>{activeDiagnostics.lastCheckedAt ? new Date(activeDiagnostics.lastCheckedAt).toLocaleString() : "Never"}</span>
                  <span className="text-gray-500">Expected manifest URL</span>
                  <span className="break-all">{activeDiagnostics.expectedManifestUrl}</span>
                  <span className="text-gray-500">HTTP status</span>
                  <span>{activeDiagnostics.httpStatus ?? "Unknown"}</span>
                  <span className="text-gray-500">JSON parsed</span>
                  <span>{activeDiagnostics.jsonParsed === null ? "Unknown" : String(activeDiagnostics.jsonParsed)}</span>
                  <span className="text-gray-500">Signature present</span>
                  <span>{activeDiagnostics.signaturePresent === null ? "Unknown" : String(activeDiagnostics.signaturePresent)}</span>
                  <span className="text-gray-500">Windows platform</span>
                  <span>{activeDiagnostics.expectedPlatform}: {activeDiagnostics.windowsPlatformMatched === null ? "Unknown" : String(activeDiagnostics.windowsPlatformMatched)}</span>
                  <span className="text-gray-500">Last error</span>
                  <span className="whitespace-pre-wrap">{activeDiagnostics.lastError ?? "None"}</span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button onClick={openUpdateFeedUrl} className="text-xs bg-panel-700 hover:bg-panel-650 rounded px-3 py-1.5">
                    Open update feed URL
                  </button>
                  <button onClick={() => void copyDiagnostics()} className="text-xs bg-panel-700 hover:bg-panel-650 rounded px-3 py-1.5">
                    {diagnosticsCopied ? "Copied" : "Copy diagnostics"}
                  </button>
                </div>
              </div>
            )}
            {s.updateInfo?.releaseNotes && (
              <div className="bg-panel-900 rounded p-2 border border-white/5 text-[11px] text-gray-400 whitespace-pre-wrap max-h-28 overflow-auto">
                <div className="text-gray-300 mb-1">Release notes for {s.updateInfo.latestVersion}{s.updateInfo.major ? " (major update)" : ""}</div>
                {s.updateInfo.releaseNotes}
              </div>
            )}
            {s.updateInfo?.blocked && (
              <div className="text-[11px] text-panther-red">This installed version is below the minimum supported version in the release manifest. Back up projects, install the latest full installer, then reopen Panther Studio.</div>
            )}
            {s.updateInfo?.errorLog?.length ? (
              <div className="bg-panel-900 rounded p-2 border border-white/5 text-[10px] font-mono text-panther-gold max-h-20 overflow-auto">
                {s.updateInfo.errorLog.map((line) => <div key={line}>{line}</div>)}
              </div>
            ) : null}
            <div className="text-[11px] text-gray-600">
              Updates never delete projects, presets, or settings. If an update fails, keep using this version or install the previous installer from your release archive.
            </div>
          </Section>

          <Section title="Storage">
            <div className="bg-panel-900 rounded p-2 border border-white/5 text-[11px] text-gray-400 space-y-1">
              <div>App version: {version}</div>
              <div>Usage: {storage || "—"}</div>
              {isTauri() ? <div className="break-all">Data folder: {dataDir || "…"}</div> : <div>Browser preview (IndexedDB)</div>}
            </div>
          </Section>

          <Section title="Keyboard shortcuts">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {SHORTCUTS.map(([k, d]) => (
                <div key={k} className="flex justify-between text-[11px]">
                  <span className="text-gray-500">{d}</span>
                  <span className="font-mono text-gray-300">{k}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Danger zone">
            {!confirmReset ? (
              <button onClick={() => setConfirmReset(true)} className="text-xs bg-panel-700 hover:bg-panel-650 text-panther-red rounded px-3 py-1.5">
                Reset app (delete all projects &amp; settings)…
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-panther-red">This permanently deletes everything. Are you sure?</span>
                <button onClick={() => void s.resetApp()} className="text-xs bg-panther-red text-black rounded px-3 py-1.5 font-medium">Yes, reset</button>
                <button onClick={() => setConfirmReset(false)} className="text-xs bg-panel-700 rounded px-3 py-1.5">Cancel</button>
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
