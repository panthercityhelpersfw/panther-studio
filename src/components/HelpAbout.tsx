import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { getAppPaths } from "../tauri";

const SHORTCUTS: [string, string][] = [
  ["Space", "Play / Pause"],
  ["R", "Record (with optional count-in)"],
  ["S", "Split selected clip at playhead"],
  ["L", "Toggle loop region"],
  ["Delete / Backspace", "Delete selected clip"],
  ["Ctrl / Cmd + S", "Save project"],
  ["Ctrl / Cmd + Z", "Undo"],
  ["Ctrl / Cmd + Shift + Z", "Redo"],
  ["Esc", "Stop / close editor"],
  ["Pad keys (1-0, q-p)", "Trigger sample pads"],
];

export function HelpAbout() {
  const open = useStore((s) => s.helpOpen);
  const setOpen = useStore((s) => s.setHelpOpen);
  const [version, setVersion] = useState("0.1.0");

  useEffect(() => {
    if (open) void getAppPaths().then((p) => p && setVersion(p.version));
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
      <div className="bg-panel-850 rounded-lg border border-white/10 shadow-2xl w-[560px] max-h-[85vh] flex flex-col">
        <div className="px-5 py-3 border-b border-black/40 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Help &amp; About</h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">✕</button>
        </div>
        <div className="p-5 overflow-y-auto space-y-5">
          <section className="flex items-center gap-3">
            <img src="/panther.svg" alt="" className="w-12 h-12 rounded-xl" />
            <div>
              <div className="text-base font-semibold text-white">Panther Studio</div>
              <div className="text-xs text-gray-400">Vocal-focused desktop DAW · v{version}</div>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2">Keyboard shortcuts</h3>
            <div className="grid grid-cols-1 gap-1">
              {SHORTCUTS.map(([k, d]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-gray-400">{d}</span>
                  <span className="font-mono text-gray-300">{k}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2">Quick workflow</h3>
            <ol className="text-sm text-gray-400 list-decimal pl-5 space-y-0.5">
              <li>Create a project &amp; complete mic setup</li>
              <li>Import a beat, arm a vocal track</li>
              <li>Record (use headphones for monitoring)</li>
              <li>Apply a preset or Auto Vocal Enhance</li>
              <li>Edit clips, mix levels</li>
              <li>Auto Master, then export a WAV</li>
            </ol>
          </section>

          <section className="text-[11px] text-gray-500">
            Built with Tauri + React + the Web Audio API. All audio processing is
            real. See the in-repo guides (USER_GUIDE.md, SETUP_GUIDE.md) for details.
          </section>
        </div>
        <div className="px-5 py-3 border-t border-black/40 flex justify-end">
          <button onClick={() => setOpen(false)} className="px-4 py-2 rounded text-sm bg-accent hover:bg-accent-hover text-white">Close</button>
        </div>
      </div>
    </div>
  );
}
