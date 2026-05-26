import { useStore } from "../state/store";

const ERROR_HINTS = ["failed", "denied", "corrupt", "disconnected", "could not", "nearly full", "unavailable"];

/** Surfaces error-type status messages as a dismissable top banner. */
export function ErrorBanner() {
  const msg = useStore((s) => s.statusMessage);
  const setStatus = useStore((s) => s.setStatus);
  if (!msg) return null;
  const isError = ERROR_HINTS.some((h) => msg.toLowerCase().includes(h));
  if (!isError) return null;

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[55] max-w-[600px] bg-panther-red/95 text-black rounded-md shadow-lg px-4 py-2 flex items-center gap-3">
      <span className="text-sm font-medium">⚠ {msg}</span>
      <button onClick={() => setStatus(null)} className="text-black/70 hover:text-black text-sm">✕</button>
    </div>
  );
}
