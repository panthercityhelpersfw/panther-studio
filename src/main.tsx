import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { useStore } from "./state/store";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { bootLog } from "./tauri";

void bootLog("frontend entry loaded");

window.addEventListener("error", (event) => {
  void bootLog(`top-level error: ${event.message}`);
});

window.addEventListener("unhandledrejection", (event) => {
  void bootLog(`unhandled rejection: ${String(event.reason)}`);
});

// Dev-only: expose the store for automated smoke testing in the preview harness.
if (import.meta.env.DEV) {
  (window as unknown as { __pantherStore: typeof useStore }).__pantherStore = useStore;
}

try {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
  void bootLog("react render requested");
} catch (error) {
  void bootLog(`react render failed: ${String(error)}`);
  throw error;
}
