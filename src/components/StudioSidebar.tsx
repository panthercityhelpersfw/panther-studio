import type { WorkspaceMode } from "../App";
import { useStore } from "../state/store";

type SidebarItem = {
  label: string;
  hint: string;
  icon: string;
  action: () => void;
  accent?: string;
};

function dispatchDock(tab: string) {
  window.dispatchEvent(new CustomEvent("panther:bottomDockTab", { detail: tab }));
}

export function StudioSidebar({
  collapsed,
  onToggleCollapse,
  workspace,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  workspace: WorkspaceMode;
}) {
  const setView = useStore((s) => s.setView);
  const setLibraryOpen = useStore((s) => s.setLibraryOpen);
  const setBeatBrowserOpen = useStore((s) => s.setBeatBrowserOpen);
  const setBuilderOpen = useStore((s) => s.setBuilderOpen);
  const setCoachOpen = useStore((s) => s.setCoachOpen);
  const exportFullSong = useStore((s) => s.exportFullSong);
  const setVibeMode = useStore((s) => s.setVibeMode);
  const captureInspiration = useStore((s) => s.captureInspiration);
  const project = useStore((s) => s.project);
  const memory = project.studioIntelligence?.memory;

  const items: SidebarItem[] = [
    { label: "Projects", hint: "Project hub", icon: "P", action: () => setView("dashboard") },
    { label: "Beat Browser", hint: "Search and import beats", icon: "S", action: () => setBeatBrowserOpen(true), accent: "var(--studio-cyan)" },
    { label: "Library", hint: "Projects, presets, exports", icon: "L", action: () => setLibraryOpen(true) },
    { label: "Builder", hint: "Instrumental builder", icon: "B", action: () => setBuilderOpen(true), accent: "var(--studio-blue)" },
    { label: "Vocal Coach", hint: "Take analysis", icon: "V", action: () => setCoachOpen(true), accent: "var(--studio-violet)" },
    { label: "Lyrics", hint: "Notebook and flow", icon: "Y", action: () => dispatchDock("lyrics"), accent: "var(--studio-gold)" },
    { label: "Vibe", hint: "Cinematic focus", icon: "Ø", action: () => setVibeMode(project.vibeMode === "off" ? "late-night" : "off"), accent: "var(--studio-cyan)" },
    { label: "Capture", hint: "Instant idea", icon: "I", action: () => void captureInspiration("lyric"), accent: "var(--studio-green)" },
    { label: "Mixer", hint: "Console dock", icon: "M", action: () => dispatchDock("mixer") },
    { label: "Presets", hint: "Vocal and master chains", icon: "F", action: () => setLibraryOpen(true) },
    { label: "Exports", hint: "Render mixdown", icon: "E", action: () => void exportFullSong(), accent: "var(--studio-gold)" },
  ];

  return (
    <aside className={`studio-sidebar ${collapsed ? "is-collapsed" : ""}`}>
      <div className="studio-sidebar__top">
        <div className="studio-sidebar__brand">
          <img src="/panther.svg" alt="" />
          {!collapsed && (
            <div>
              <div className="studio-sidebar__title">Panther</div>
              <div className="studio-sidebar__subtitle">Studio OS</div>
            </div>
          )}
        </div>
        <button onClick={onToggleCollapse} className="studio-icon-btn" title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? ">" : "<"}
        </button>
      </div>

      {!collapsed && (
        <div className="studio-session-card">
          <div className="studio-label">Active Session</div>
          <div className="studio-session-card__name" title={project.name}>{project.name}</div>
          <div className="studio-session-card__meta">
            {project.tracks.length} tracks / {project.clips.length} clips
          </div>
          <div className="studio-memory-glance">
            <span>Memory</span>
            <strong>{memory?.lastWorkflowIntent ?? "learning"}</strong>
          </div>
        </div>
      )}

      <nav className="studio-sidebar__nav" aria-label="Studio navigation">
        {items.map((item) => (
          <button
            key={item.label}
            onClick={item.action}
            className="studio-nav-item"
            title={collapsed ? `${item.label}: ${item.hint}` : item.hint}
          >
            <span className="studio-nav-item__icon" style={{ color: item.accent }}>
              {item.icon}
            </span>
            {!collapsed && (
              <span className="studio-nav-item__copy">
                <span>{item.label}</span>
                <small>{item.hint}</small>
              </span>
            )}
          </button>
        ))}
      </nav>

      {!collapsed && (
        <div className="studio-sidebar__footer">
          <div className="studio-label">Workspace</div>
          <div className="studio-sidebar__workspace">{workspace}</div>
        </div>
      )}
    </aside>
  );
}
