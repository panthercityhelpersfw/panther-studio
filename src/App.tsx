import { useEffect, useMemo, useState } from "react";
import { Arrange } from "./components/Arrange";
import { BottomDock } from "./components/BottomDock";
import { Dashboard } from "./components/Dashboard";
import { EnhanceReport } from "./components/EnhanceReport";
import { ErrorBanner } from "./components/ErrorBanner";
import { HelpAbout } from "./components/HelpAbout";
import { Inspector } from "./components/Inspector";
import { LoudnessReport, MasterReport } from "./components/LoudnessReport";
import { MicPanel } from "./components/MicPanel";
import { MonitorWarning } from "./components/MonitorWarning";
import { PianoRoll } from "./components/PianoRoll";
import { Preferences } from "./components/Preferences";
import { ProfileGate } from "./components/ProfileGate";
import { AudioSetup } from "./components/AudioSetup";
import { InstrumentBuilder } from "./components/InstrumentBuilder";
import { VocalCoach } from "./components/VocalCoach";
import { Library } from "./components/Library";
import { BeatBrowser } from "./components/BeatBrowser";
import { LiveVocalDirector } from "./components/LiveVocalDirector";
import { RecoveryPrompt } from "./components/RecoveryPrompt";
import { SetupWizard } from "./components/SetupWizard";
import { StatusBar } from "./components/StatusBar";
import { StudioSidebar } from "./components/StudioSidebar";
import { TransportBar } from "./components/TransportBar";
import { useStore } from "./state/store";
import { bootLog, ensureAppDirs } from "./tauri";

export type WorkspaceMode =
  | "Recording"
  | "Beatmaking"
  | "Mixing"
  | "Mastering"
  | "Vocal Editing"
  | "Performance Mode"
  | "Minimal Focus Mode";

const WORKSPACE_KEY = "panther.studioLayout.v2";

const workspaceDefaults: Record<WorkspaceMode, { left: number; right: number; bottom: number; rightCollapsed?: boolean; bottomCollapsed?: boolean }> = {
  Recording: { left: 216, right: 304, bottom: 250 },
  Beatmaking: { left: 228, right: 276, bottom: 292 },
  Mixing: { left: 180, right: 332, bottom: 330 },
  Mastering: { left: 168, right: 360, bottom: 286 },
  "Vocal Editing": { left: 190, right: 356, bottom: 300 },
  "Performance Mode": { left: 72, right: 0, bottom: 0, rightCollapsed: true, bottomCollapsed: true },
  "Minimal Focus Mode": { left: 72, right: 0, bottom: 0, rightCollapsed: true, bottomCollapsed: true },
};

type StudioLayout = {
  workspace: WorkspaceMode;
  left: number;
  right: number;
  bottom: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  bottomCollapsed: boolean;
};

function loadStudioLayout(): StudioLayout {
  const fallback = workspaceDefaults.Recording;
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (raw) return { workspace: "Recording", leftCollapsed: false, rightCollapsed: false, bottomCollapsed: false, ...fallback, ...JSON.parse(raw) };
  } catch {
    /* ignore corrupted layout */
  }
  return { workspace: "Recording", leftCollapsed: false, rightCollapsed: false, bottomCollapsed: false, ...fallback };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function App() {
  const view = useStore((s) => s.view);
  const currentProfileId = useStore((s) => s.currentProfileId);
  const init = useStore((s) => s.init);
  const togglePlay = useStore((s) => s.togglePlay);
  const toggleRecord = useStore((s) => s.toggleRecord);
  const stop = useStore((s) => s.stop);
  const saveNow = useStore((s) => s.saveNow);
  const runPerformanceGuardian = useStore((s) => s.runPerformanceGuardian);
  const vibeMode = useStore((s) => s.project.vibeMode ?? "off");
  const [layout, setLayout] = useState<StudioLayout>(() => loadStudioLayout());

  useEffect(() => {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(layout));
  }, [layout]);

  const setWorkspace = (workspace: WorkspaceMode) => {
    const next = workspaceDefaults[workspace];
    setLayout((l) => ({
      ...l,
      ...next,
      workspace,
      leftCollapsed: workspace === "Performance Mode" ? true : false,
      rightCollapsed: !!next.rightCollapsed,
      bottomCollapsed: !!next.bottomCollapsed,
    }));
  };

  const resize = useMemo(
    () => ({
      left(e: React.PointerEvent) {
        const startX = e.clientX;
        const start = layout.left;
        const move = (ev: PointerEvent) => setLayout((l) => ({ ...l, left: clamp(start + ev.clientX - startX, 72, 280), leftCollapsed: false }));
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      },
      right(e: React.PointerEvent) {
        const startX = e.clientX;
        const start = layout.right || 304;
        const move = (ev: PointerEvent) => setLayout((l) => ({ ...l, right: clamp(start - (ev.clientX - startX), 250, 420), rightCollapsed: false }));
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      },
      bottom(e: React.PointerEvent) {
        const startY = e.clientY;
        const start = layout.bottom || 260;
        const move = (ev: PointerEvent) => setLayout((l) => ({ ...l, bottom: clamp(start - (ev.clientY - startY), 196, 380), bottomCollapsed: false }));
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      },
    }),
    [layout.left, layout.right, layout.bottom]
  );

  // One-time init: wire engine callbacks, restore last project, ensure dirs.
  useEffect(() => {
    void bootLog("frontend mounted");
    void ensureAppDirs()
      .then(() => bootLog("storage init ok"))
      .catch((e) => bootLog(`storage init failed: ${String(e)}`));
    void init().catch((e) => bootLog(`store init failed: ${String(e)}`));
  }, [init]);

  // Global keyboard shortcuts (ignored while typing in inputs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      const s = useStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNow();
        return;
      }
      if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (ctrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      if (typing) return;
      if (s.view !== "studio") return;
      // Don't hijack keys while the piano roll is open (except Esc/space).
      const pianoOpen = s.editingMidiClipId !== null;

      if (e.code === "Space") {
        e.preventDefault();
        void togglePlay();
        return;
      }
      if (e.key === "Escape") {
        if (pianoOpen) s.openPianoRoll(null);
        else stop();
        return;
      }
      if (pianoOpen) return;

      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        void toggleRecord();
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        s.splitClipAtPlayhead();
      } else if (e.key.toLowerCase() === "l") {
        e.preventDefault();
        s.toggleLoop();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        s.deleteSelected();
      } else {
        // Sample-pad triggering by mapped key.
        const pad = s.project.pads.find((p) => p.key && p.key === e.key.toLowerCase());
        if (pad) {
          e.preventDefault();
          s.triggerPad(pad.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, toggleRecord, stop, saveNow]);

  // Periodic safety autosave at the user-configured interval.
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    let lastInterval = 0;
    const arm = () => {
      const sec = useStore.getState().autosaveIntervalSec || 20;
      if (sec === lastInterval) return;
      lastInterval = sec;
      if (id) clearInterval(id);
      id = setInterval(() => {
        const s = useStore.getState();
        if (s.dirty && s.view === "studio") void s.saveNow();
      }, sec * 1000);
    };
    arm();
    const watcher = setInterval(arm, 5000); // pick up interval changes
    return () => {
      if (id) clearInterval(id);
      clearInterval(watcher);
    };
  }, []);

  // Auto-check for updates on launch if enabled.
  useEffect(() => {
    const t = setTimeout(() => {
      const state = useStore.getState();
      if (state.autoCheckUpdates) {
        void bootLog("auto updater check scheduled");
        void state.checkForUpdatesNow().catch((e) => bootLog(`auto updater check failed: ${String(e)}`));
      } else {
        void bootLog("auto updater check disabled");
      }
    }, 2500);
    return () => clearTimeout(t);
  }, []);

  // Lightweight performance guardian. It samples project complexity on a slow
  // interval and only intervenes when playback stability is at risk.
  useEffect(() => {
    const id = setInterval(() => {
      const s = useStore.getState();
      if (s.view === "studio") s.runPerformanceGuardian("background");
    }, 15000);
    return () => clearInterval(id);
  }, [runPerformanceGuardian]);

  // Clean-exit heartbeat + save on close.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // Mark a clean shutdown so we don't show a false crash-recovery prompt.
      try {
        localStorage.setItem("panther.sessionOpen", "false");
      } catch {
        /* ignore */
      }
      if (useStore.getState().dirty) {
        void useStore.getState().saveNow();
        e.preventDefault();
        e.returnValue = "";
      }
      const state = useStore.getState();
      if (!state.dirty && state.installUpdatesOnClose && state.updateInfo?.downloaded) {
        void state.installUpdateNow();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  if (view === "dashboard") {
    return (
      <div className="h-full flex flex-col relative">
        <ErrorBanner />
        {currentProfileId ? <Dashboard /> : <ProfileGate />}
        <MicPanel />
        <MonitorWarning />
        <Preferences />
        <SetupWizard />
        <RecoveryPrompt />
        <HelpAbout />
        <AudioSetup />
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col relative studio-root ${vibeMode !== "off" ? "is-vibe" : ""}`} data-workspace={layout.workspace} data-vibe={vibeMode}>
      <ErrorBanner />
      <TransportBar workspace={layout.workspace} onWorkspaceChange={setWorkspace} />
      <div className="flex-1 flex overflow-hidden min-h-0 studio-shell">
        <div
          className="relative shrink-0 studio-sidebar-wrap"
          style={{ width: layout.leftCollapsed ? 72 : layout.left }}
        >
          <StudioSidebar
            collapsed={layout.leftCollapsed}
            onToggleCollapse={() => setLayout((l) => ({ ...l, leftCollapsed: !l.leftCollapsed }))}
            workspace={layout.workspace}
          />
          {!layout.leftCollapsed && <div className="resize-grip resize-grip-x right-0" onPointerDown={resize.left} />}
        </div>
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 flex overflow-hidden min-h-0">
            <Arrange />
            {!layout.rightCollapsed && (
              <div className="relative shrink-0" style={{ width: layout.right }}>
                <div className="resize-grip resize-grip-x left-0" onPointerDown={resize.right} />
                <Inspector onCollapse={() => setLayout((l) => ({ ...l, rightCollapsed: true }))} />
              </div>
            )}
          </div>
          {!layout.bottomCollapsed && (
            <div className="relative shrink-0" style={{ height: layout.bottom }}>
              <div className="resize-grip resize-grip-y top-0" onPointerDown={resize.bottom} />
              <BottomDock onCollapse={() => setLayout((l) => ({ ...l, bottomCollapsed: true }))} />
            </div>
          )}
          {(layout.rightCollapsed || layout.bottomCollapsed) && (
            <div className="studio-reveal-strip">
              {layout.rightCollapsed && (
                <button onClick={() => setLayout((l) => ({ ...l, rightCollapsed: false, right: l.right || 304 }))}>Inspector</button>
              )}
              {layout.bottomCollapsed && (
                <button onClick={() => setLayout((l) => ({ ...l, bottomCollapsed: false, bottom: l.bottom || 260 }))}>Dock</button>
              )}
            </div>
          )}
        </div>
      </div>
      <StatusBar />
      <MicPanel />
      <MonitorWarning />
      <EnhanceReport />
      <LoudnessReport />
      <MasterReport />
      <PianoRoll />
      <Preferences />
      <SetupWizard />
      <RecoveryPrompt />
      <HelpAbout />
      <AudioSetup />
      <InstrumentBuilder />
      <VocalCoach />
      <Library />
      <BeatBrowser />
      <LiveVocalDirector />
    </div>
  );
}
