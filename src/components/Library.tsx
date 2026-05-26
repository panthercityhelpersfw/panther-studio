import { useEffect, useMemo, useState } from "react";
import { PRESETS } from "../audio/presets";
import { STUDIO_FACTORY_PRESETS } from "../audio/studioIntelligence";
import { audioEngine } from "../audio/AudioEngine";
import { useStore } from "../state/store";
import type { SavedPreset } from "../state/types";

type Tab = "projects" | "assets" | "presets" | "exports";

const kindLabel = (kind: SavedPreset["kind"]) =>
  kind === "vocalChain" ? "VOCAL CHAINS" : kind === "master" ? "MASTER PRESETS" : "INSTRUMENT PRESETS";

/** Per-profile library: searchable projects, factory chains, user presets, export history. */
export function Library() {
  const open = useStore((s) => s.libraryOpen);
  const setOpen = useStore((s) => s.setLibraryOpen);
  const projectList = useStore((s) => s.projectList);
  const openProject = useStore((s) => s.openProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const duplicateProjectById = useStore((s) => s.duplicateProjectById);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const refreshProjectList = useStore((s) => s.refreshProjectList);
  const presets = useStore((s) => s.presets);
  const refreshPresets = useStore((s) => s.refreshPresets);
  const savePresetToLibrary = useStore((s) => s.savePresetToLibrary);
  const deletePresetFromLibrary = useStore((s) => s.deletePresetFromLibrary);
  const duplicatePresetInLibrary = useStore((s) => s.duplicatePresetInLibrary);
  const togglePresetFavorite = useStore((s) => s.togglePresetFavorite);
  const applyLibraryPreset = useStore((s) => s.applyLibraryPreset);
  const applyPreset = useStore((s) => s.applyPreset);
  const applyFactoryFxPreset = useStore((s) => s.applyFactoryFxPreset);
  const project = useStore((s) => s.project);
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const importFiles = useStore((s) => s.importFiles);

  const [tab, setTab] = useState<Tab>("projects");
  const [q, setQ] = useState("");
  const [favOnly, setFavOnly] = useState(false);

  useEffect(() => {
    if (open) {
      void refreshProjectList();
      void refreshPresets();
    }
  }, [open, refreshProjectList, refreshPresets]);

  const query = q.trim().toLowerCase();
  const filteredProjects = projectList.filter(
    (p) => (!favOnly || p.favorite) && p.name.toLowerCase().includes(query)
  );
  const filteredAssets = project.assets.filter((a) => {
    const tags = a.durationSec < 3 ? "one-shot sample" : "loop audio";
    return (!query || `${a.name} ${tags}`.toLowerCase().includes(query));
  });

  const factoryPresets = useMemo(() => {
    const vocal = PRESETS.map((p) => ({
      id: `vocal:${p.id}`,
      name: p.name,
      category: "vocal",
      detail: p.description,
      apply: () => selectedTrackId && applyPreset(selectedTrackId, p.id),
      disabled: !selectedTrackId,
    }));
    const studio = STUDIO_FACTORY_PRESETS.map((p) => ({
      id: `factory:${p.id}`,
      name: p.name,
      category: p.category,
      detail: `${p.intendedUse} Tags: ${p.genreTags.join(", ") || "general"}.`,
      apply: () => applyFactoryFxPreset(p.id),
      disabled: p.routing !== "master" && !selectedTrackId,
    }));
    return [...vocal, ...studio].filter((p) => {
      if (!query) return true;
      return `${p.name} ${p.category} ${p.detail}`.toLowerCase().includes(query);
    });
  }, [applyFactoryFxPreset, applyPreset, query, selectedTrackId]);

  if (!open) return null;

  const byKind = (kind: SavedPreset["kind"]) =>
    presets
      .filter((p) => p.kind === kind)
      .filter((p) => (!favOnly || p.favorite) && (!query || `${p.name} ${(p.tags ?? []).join(" ")}`.toLowerCase().includes(query)));

  const saveTrackChain = () => {
    const track = project.tracks.find((t) => t.id === selectedTrackId);
    if (!track) return;
    const name = prompt("Name this track chain preset:", track.presetName || track.name);
    if (name) void savePresetToLibrary("vocalChain", name, track.effects);
  };

  const saveMaster = () => {
    const name = prompt("Name this master preset:", project.master.presetName || "My Master");
    if (name) void savePresetToLibrary("master", name, { effects: project.master.effects, outputGain: project.masterGain });
  };

  const TabBtn = ({ id, label }: { id: Tab; label: string }) => (
    <button onClick={() => setTab(id)} className={`studio-tab ${tab === id ? "is-active" : ""}`}>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6">
      <div className="studio-modal w-[860px] max-h-[88vh] flex flex-col">
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-wide">Library</h2>
            <p className="text-[11px] text-gray-500">Projects, factory chains, user presets, and export history.</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white" aria-label="Close library">X</button>
        </div>
        <div className="studio-dock__tabs px-3">
          <TabBtn id="projects" label="PROJECTS" />
          <TabBtn id="assets" label="LOOPS / ONE-SHOTS" />
          <TabBtn id="presets" label="PRESETS" />
          <TabBtn id="exports" label="EXPORTS" />
        </div>

        <div className="p-4 overflow-y-auto">
          <div className="flex gap-2 mb-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${tab}...`}
              className="flex-1 bg-panel-950 border border-white/10 rounded px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              onClick={() => setFavOnly((v) => !v)}
              className={`text-xs rounded px-3 border ${favOnly ? "bg-accent text-white border-accent" : "bg-panel-850 text-gray-300 border-white/10"}`}
            >
              Favorites
            </button>
          </div>

          {tab === "projects" && (
            <div className="grid grid-cols-2 gap-2">
              {filteredProjects.map((p) => (
                <div key={p.id} className="bg-panel-900 hover:bg-panel-850 rounded-md p-3 border border-white/5 group">
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => { setOpen(false); void openProject(p.id); }} className="text-left min-w-0 flex-1">
                      <div className="font-medium truncate flex items-center gap-1">{p.favorite && <span className="text-panther-gold">Starred</span>}{p.name}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{p.tracks.length} tracks / {p.clips.length} clips</div>
                      <div className="flex items-end gap-0.5 h-5 mt-1">
                        {p.tracks.slice(0, 12).map((t) => (
                          <div key={t.id} className="w-1.5 rounded-t" style={{ height: `${30 + (t.gain / 1.5) * 70}%`, background: t.color, opacity: 0.7 }} />
                        ))}
                      </div>
                    </button>
                    <div className="flex flex-col items-end gap-0.5 opacity-0 group-hover:opacity-100">
                      <button onClick={() => void toggleFavorite(p.id)} className="text-[10px] text-gray-500 hover:text-panther-gold">{p.favorite ? "Unstar" : "Star"}</button>
                      <button onClick={() => void duplicateProjectById(p.id)} className="text-[10px] text-gray-500 hover:text-white">Duplicate</button>
                      <button onClick={() => { if (confirm(`Delete "${p.name}"?`)) void deleteProject(p.id); }} className="text-[10px] text-gray-500 hover:text-panther-red">Delete</button>
                    </div>
                  </div>
                </div>
              ))}
              {filteredProjects.length === 0 && <div className="col-span-2 text-xs text-gray-500 p-4 text-center">No matching projects.</div>}
            </div>
          )}

          {tab === "presets" && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <button onClick={saveTrackChain} className="text-xs bg-accent hover:bg-accent-hover text-white rounded px-3 py-1.5">Save selected chain</button>
                <button onClick={saveMaster} className="text-xs bg-panel-750 hover:bg-panel-700 text-white rounded px-3 py-1.5 border border-white/10">Save master chain</button>
              </div>

              <section>
                <div className="text-[11px] font-semibold text-gray-300 mb-2">FACTORY EFFECT CHAINS</div>
                <div className="grid grid-cols-2 gap-2">
                  {factoryPresets.map((preset) => (
                    <div key={preset.id} className="bg-panel-900 rounded-md border border-white/5 p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold flex-1 truncate">{preset.name}</span>
                        <span className="text-[9px] uppercase text-gray-500">{preset.category}</span>
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-gray-500 line-clamp-2">{preset.detail}</p>
                      <button
                        onClick={preset.apply}
                        disabled={preset.disabled}
                        className="mt-2 text-[10px] bg-panel-750 hover:bg-panel-700 disabled:opacity-40 disabled:hover:bg-panel-750 rounded px-2 py-1"
                      >
                        {preset.disabled ? "Select track" : "Apply"}
                      </button>
                    </div>
                  ))}
                </div>
                {factoryPresets.length === 0 && <div className="text-[11px] text-gray-600">No factory presets match this search.</div>}
              </section>

              {(["vocalChain", "master", "instrument"] as SavedPreset["kind"][]).map((kind) => {
                const items = byKind(kind);
                return (
                  <section key={kind}>
                    <div className="text-[11px] font-semibold text-gray-300 mb-1">{kindLabel(kind)}</div>
                    <div className="space-y-1">
                      {items.map((pr) => (
                        <div key={pr.id} className="flex items-center gap-2 bg-panel-900 rounded-md px-2 py-1 border border-white/5">
                          <button onClick={() => void togglePresetFavorite(pr.id)} className={`text-[10px] ${pr.favorite ? "text-panther-gold" : "text-gray-600 hover:text-gray-300"}`}>
                            {pr.favorite ? "Starred" : "Star"}
                          </button>
                          <span className="text-xs flex-1 truncate">{pr.name}</span>
                          <button onClick={() => applyLibraryPreset(pr)} className="text-[10px] bg-panel-750 hover:bg-panel-700 rounded px-2 py-0.5">Apply</button>
                          <button onClick={() => void duplicatePresetInLibrary(pr.id)} className="text-[10px] text-gray-500 hover:text-white">Duplicate</button>
                          <button onClick={() => void deletePresetFromLibrary(pr.id)} className="text-[10px] text-gray-500 hover:text-panther-red">Delete</button>
                        </div>
                      ))}
                      {items.length === 0 && <div className="text-[11px] text-gray-600">None saved yet.</div>}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {tab === "assets" && (
            <div className="space-y-2">
              <label className="block border border-dashed border-white/10 rounded-md p-4 text-center text-xs text-gray-500 hover:border-accent/50 cursor-pointer">
                Import loops or one-shots
                <input type="file" accept="audio/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) void importFiles(e.target.files); e.currentTarget.value = ""; }} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                {filteredAssets.map((asset) => (
                  <div key={asset.id} className="bg-panel-900 rounded-md border border-white/5 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold truncate flex-1">{asset.name}</span>
                      <span className="text-[9px] uppercase text-gray-500">{asset.durationSec < 3 ? "one-shot" : "loop"}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-gray-600">{asset.durationSec.toFixed(1)}s / {asset.numChannels}ch / tag: {asset.durationSec < 3 ? "drum sample" : "session audio"}</div>
                    <button
                      onClick={() => {
                        const buf = audioEngine.getBuffer(asset.id);
                        if (buf) void audioEngine.ensure().then(() => audioEngine.playSample(buf, 0.85));
                      }}
                      className="mt-2 text-[10px] bg-panel-750 hover:bg-panel-700 rounded px-2 py-1"
                    >
                      Preview
                    </button>
                  </div>
                ))}
              </div>
              {filteredAssets.length === 0 && <div className="text-xs text-gray-500 p-3">No matching loops or one-shots in this project yet.</div>}
            </div>
          )}

          {tab === "exports" && (
            <div className="space-y-1">
              <div className="text-[11px] text-gray-500 mb-2">Export history for "{project.name}"</div>
              {(project.exportHistory ?? []).map((e) => (
                <div key={e.id} className="flex items-center gap-2 bg-panel-900 rounded-md px-2 py-1 border border-white/5 text-xs">
                  <span className="text-gray-400 uppercase text-[9px] w-12">{e.kind}</span>
                  <span className="flex-1 truncate">{e.name}{e.target ? ` / ${e.target}` : ""}</span>
                  <span className="text-[10px] text-gray-600">{new Date(e.when).toLocaleString()}</span>
                </div>
              ))}
              {(project.exportHistory ?? []).length === 0 && <div className="text-xs text-gray-500 p-3">No exports yet for this project.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
