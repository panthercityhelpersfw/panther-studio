import { useStore } from "../state/store";

export function RecoveryPrompt() {
  const rp = useStore((s) => s.recoveryPrompt);
  const recover = useStore((s) => s.recoverSession);
  const dismiss = useStore((s) => s.dismissRecovery);
  if (!rp) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-6">
      <div className="bg-panel-850 rounded-lg border border-white/10 shadow-2xl w-[460px] p-5">
        <div className="text-2xl mb-2">♻️</div>
        <h2 className="text-lg font-semibold mb-2">Recover your last session?</h2>
        <p className="text-sm text-gray-300 mb-1">
          Panther Studio didn't shut down cleanly last time. Your work was
          autosaved — you can reopen the project you were working on.
        </p>
        <p className="text-sm text-gray-400 mb-4">
          Project: <span className="text-white">{rp.name}</span>
          <br />
          Last backup: {new Date(rp.when).toLocaleString()}
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={dismiss} className="px-4 py-2 rounded text-sm bg-panel-700 hover:bg-panel-650">
            Start fresh
          </button>
          <button onClick={() => void recover()} className="px-4 py-2 rounded text-sm bg-panther-green text-black font-medium">
            Recover session
          </button>
        </div>
      </div>
    </div>
  );
}
