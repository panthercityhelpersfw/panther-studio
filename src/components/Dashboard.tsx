import { useEffect, useRef, useState } from "react";
import { estimateStorage } from "../persistence/db";
import { useStore } from "../state/store";
import { formatBytes } from "../utils/format";
import { getAppPaths, isTauri } from "../tauri";

export function Dashboard() {
  const projectList = useStore((s) => s.projectList);
  const newProject = useStore((s) => s.newProject);
  const openProject = useStore((s) => s.openProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const renameProjectById = useStore((s) => s.renameProjectById);
  const duplicateProjectById = useStore((s) => s.duplicateProjectById);
  const refreshProjectList = useStore((s) => s.refreshProjectList);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const setPrefsOpen = useStore((s) => s.setPrefsOpen);
  const profiles = useStore((s) => s.profiles);
  const currentProfileId = useStore((s) => s.currentProfileId);
  const signOutProfile = useStore((s) => s.signOutProfile);
  const importBundle = useStore((s) => s.importBundle);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const checkForUpdatesNow = useStore((s) => s.checkForUpdatesNow);
  const updateStatus = useStore((s) => s.updateStatus);
  const smartStartProject = useStore((s) => s.smartStartProject);
  const quickIdeaCapture = useStore((s) => s.quickIdeaCapture);

  const profile = profiles.find((p) => p.id === currentProfileId);
  const bundleInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [storage, setStorage] = useState<string>("");
  const [dataDir, setDataDir] = useState<string>("");
  const [version, setVersion] = useState<string>("0.1.0");

  useEffect(() => {
    void refreshProjectList();
    void estimateStorage().then((s) => {
      if (s) setStorage(`${formatBytes(s.usage)} used`);
    });
    void getAppPaths().then((p) => {
      if (p) {
        setDataDir(p.app_data_dir);
        setVersion(p.version);
      }
    });
  }, [refreshProjectList]);

  const create = () => {
    void newProject(name.trim() || "Untitled Project");
    setName("");
  };

  return (
    <div className="flex-1 overflow-y-auto studio-dashboard">
      <div className="max-w-5xl mx-auto px-8 py-8">
        <div className="studio-dashboard__header">
          <img src="/panther.svg" alt="" className="w-14 h-14 rounded-md" />
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white">Panther Studio</h1>
            <p className="text-sm text-gray-400">
              Vocal-focused desktop DAW · v{version}
            </p>
          </div>
          {profile && (
            <div className="studio-profile-chip">
              <span className="w-7 h-7 rounded-sm flex items-center justify-center text-sm" style={{ background: profile.color }}>
                {profile.avatar}
              </span>
              <span className="text-sm text-gray-200">{profile.name}</span>
              <button onClick={signOutProfile} className="text-[11px] text-gray-500 hover:text-white ml-1" title="Switch profile">
                Switch
              </button>
            </div>
          )}
          <button onClick={() => setHelpOpen(true)} className="studio-action-btn" title="Help & shortcuts">Help</button>
          <button onClick={() => setPrefsOpen(true)} className="h-9 px-3 rounded-md text-sm bg-panel-700 hover:bg-panel-650 text-gray-200" title="Preferences">⚙ Settings</button>
        </div>

        {/* Smart start */}
        <div className="mb-8">
          <div className="flex items-end justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-200">Smart Start</h2>
              <p className="text-xs text-gray-500">Choose the job. Panther opens the right studio surface.</p>
            </div>
            <button
              onClick={() => void quickIdeaCapture()}
              className="h-9 px-4 rounded-md bg-panther-red/90 hover:bg-panther-red text-white text-sm font-medium"
            >
              Quick Idea Capture
            </button>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[
              ["record", "Record vocals", "Mic, stack, takes"],
              ["beat", "Make a beat", "Builder ready"],
              ["mix", "Mix a song", "Assist panels"],
              ["master", "Master/export", "Loudness prep"],
              ["idea", "Capture idea", "Instant record"],
            ].map(([id, label, hint]) => (
              <button
                key={id}
                onClick={() => void smartStartProject(id as "record" | "beat" | "mix" | "master" | "idea")}
                className="studio-project-card h-24 text-left"
              >
                <div className="text-sm font-semibold text-white">{label}</div>
                <div className="text-[11px] text-gray-500 mt-1">{hint}</div>
              </button>
            ))}
          </div>
        </div>

        {/* New project */}
        <div className="studio-dashboard-panel mb-8">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">
            New project
          </h2>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="Project name"
              className="flex-1 bg-panel-900 border border-white/10 rounded px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              onClick={create}
              className="studio-action-btn is-active px-5"
            >
              Create & open
            </button>
            <button
              onClick={() => bundleInput.current?.click()}
              className="studio-action-btn px-4"
              title="Open a .panther project bundle"
            >
              Open bundle…
            </button>
            <input
              ref={bundleInput}
              type="file"
              accept=".panther,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importBundle(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {/* Project list */}
        <h2 className="text-sm font-semibold text-gray-300 mb-3">
          Your projects ({projectList.length})
        </h2>
        {projectList.length === 0 ? (
          <div className="text-sm text-gray-500 studio-dashboard-panel p-8 text-center">
            No projects yet. Create one above to start recording.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {projectList.map((p) => (
              <div
                key={p.id}
                className="studio-project-card group"
                onClick={() => void openProject(p.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-1">
                      {p.favorite && <span className="text-panther-gold">★</span>}
                      {p.name}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1">
                      {p.tracks.length} tracks · {p.clips.length} clips
                    </div>
                    <div className="text-[11px] text-gray-600 mt-0.5">
                      Updated {new Date(p.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleFavorite(p.id);
                      }}
                      className="text-gray-500 hover:text-panther-gold text-xs"
                    >
                      {p.favorite ? "Unstar" : "Star"}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const n = prompt("Rename project:", p.name);
                        if (n && n.trim()) void renameProjectById(p.id, n.trim());
                      }}
                      className="text-gray-500 hover:text-white text-xs"
                    >
                      Rename
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void duplicateProjectById(p.id);
                      }}
                      className="text-gray-500 hover:text-white text-xs"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${p.name}"? This cannot be undone.`)) {
                          void deleteProject(p.id);
                        }
                      }}
                      className="text-gray-500 hover:text-panther-red text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer info */}
        <div className="mt-10 pt-6 border-t border-white/5 text-[11px] text-gray-500 space-y-1">
          <div>Storage: {storage || "—"}</div>
          {isTauri() ? (
            <>
              <div className="break-all">Project data folder: {dataDir || "…"}</div>
              <button
                onClick={() => void checkForUpdatesNow()}
                className="text-accent hover:underline"
              >
                Check for updates
              </button>
              {updateStatus && <div className="text-gray-400">{updateStatus}</div>}
            </>
          ) : (
            <div>
              Running in browser preview — projects are stored in IndexedDB. Build
              the desktop app for the full experience.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
