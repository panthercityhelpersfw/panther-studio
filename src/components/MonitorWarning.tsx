import { useStore } from "../state/store";

export function MonitorWarning() {
  const show = useStore((s) => s.showMonitorWarning);
  const confirm = useStore((s) => s.confirmMonitor);
  const cancel = useStore((s) => s.cancelMonitor);
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-panel-800 rounded-lg border border-white/10 shadow-2xl w-[420px] p-5">
        <div className="text-2xl mb-2">🎧</div>
        <h2 className="text-lg font-semibold mb-2">Put on headphones first</h2>
        <p className="text-sm text-gray-300 mb-1">
          Input monitoring plays your microphone through your speakers in real
          time. If you are not wearing headphones, this will cause loud feedback
          (a squeal) and your recordings will capture echo.
        </p>
        <p className="text-sm text-gray-400 mb-4">
          Only enable monitoring when using headphones.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={cancel}
            className="px-4 py-2 rounded text-sm bg-panel-700 hover:bg-panel-650"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            className="px-4 py-2 rounded text-sm bg-panther-green text-black font-medium"
          >
            I'm wearing headphones — enable
          </button>
        </div>
      </div>
    </div>
  );
}
