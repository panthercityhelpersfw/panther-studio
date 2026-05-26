import { useEffect, useState } from "react";
import { useStore } from "../state/store";

const AVATARS = ["🐆", "🎤", "🎧", "🎹", "🔥", "⭐", "🎵", "🦊", "🐺", "🎸", "🥁", "👑"];
const COLORS = ["#7c5cff", "#39d3e0", "#3ddc97", "#e8b341", "#ff7ad9", "#4d8dff", "#ff5d6c", "#ff9f43"];

/**
 * Local-first profile selection. Shown on the dashboard when no profile is
 * active. Profiles live entirely on-disk (IndexedDB) — there is no network,
 * no password, no real "account". Selecting one scopes projects, presets, and
 * device preferences. See LOCAL_ACCOUNTS.md.
 */
export function ProfileGate() {
  const profiles = useStore((s) => s.profiles);
  const refreshProfiles = useStore((s) => s.refreshProfiles);
  const createProfile = useStore((s) => s.createProfile);
  const selectProfile = useStore((s) => s.selectProfile);
  const deleteProfileById = useStore((s) => s.deleteProfileById);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [color, setColor] = useState(COLORS[0]);

  useEffect(() => {
    void refreshProfiles();
  }, [refreshProfiles]);

  const submit = () => {
    if (!name.trim()) return;
    void createProfile(name.trim(), avatar, color);
    setCreating(false);
    setName("");
  };

  return (
    <div className="flex-1 overflow-y-auto studio-dashboard flex items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        <div className="flex flex-col items-center gap-3 mb-8">
          <img src="/panther.svg" alt="" className="w-16 h-16 rounded-md" />
          <h1 className="text-3xl font-bold text-white">Panther Studio</h1>
          <p className="text-sm text-gray-400">Choose a profile to continue</p>
        </div>

        {!creating ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {profiles.map((p) => (
                <div
                  key={p.id}
                  className="group relative studio-project-card flex flex-col items-center gap-2"
                  onClick={() => void selectProfile(p.id)}
                >
                  <div
                    className="w-16 h-16 rounded-md flex items-center justify-center text-2xl"
                    style={{ background: p.color }}
                  >
                    {p.avatar}
                  </div>
                  <div className="font-medium truncate max-w-full">{p.name}</div>
                  <div className="text-[10px] text-gray-500">
                    {new Date(p.lastUsedAt).toLocaleDateString()}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete profile "${p.name}" and all its projects? This cannot be undone.`)) {
                        void deleteProfileById(p.id);
                      }
                    }}
                    className="absolute top-2 right-2 text-gray-600 hover:text-panther-red text-xs opacity-0 group-hover:opacity-100"
                    title="Delete profile"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <button
                onClick={() => setCreating(true)}
                className="studio-project-card border-dashed flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-white min-h-[150px]"
              >
                <div className="w-16 h-16 rounded-md border-2 border-dashed border-white/20 flex items-center justify-center text-3xl">
                  +
                </div>
                <span className="text-sm">New profile</span>
              </button>
            </div>
            {profiles.length === 0 && (
              <p className="text-center text-[11px] text-gray-500 mt-6">
                Your work is stored locally on this computer. Create a profile to begin.
              </p>
            )}
          </>
        ) : (
          <div className="studio-dashboard-panel max-w-md mx-auto space-y-4">
            <h2 className="text-sm font-semibold text-gray-200">Create a profile</h2>
            <div className="flex items-center gap-3">
              <div
                className="w-16 h-16 rounded-md flex items-center justify-center text-2xl shrink-0"
                style={{ background: color }}
              >
                {avatar}
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Your name"
                autoFocus
                className="flex-1 bg-panel-900 border border-white/10 rounded px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-1">Avatar</div>
              <div className="flex flex-wrap gap-1.5">
                {AVATARS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAvatar(a)}
                    className={`w-9 h-9 rounded-lg text-lg ${avatar === a ? "bg-accent" : "bg-panel-900 hover:bg-panel-700"}`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-1">Color</div>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full border-2 ${color === c ? "border-white" : "border-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setCreating(false)} className="text-xs bg-panel-700 hover:bg-panel-650 rounded px-4 py-2">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!name.trim()}
                className="text-xs bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded px-4 py-2 font-medium"
              >
                Create profile
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
