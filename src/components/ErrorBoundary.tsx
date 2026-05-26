import { Component, type ErrorInfo, type ReactNode } from "react";
import { useStore } from "../state/store";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Top-level error boundary. If a render throws, we show a recovery screen and
 * try to save the current project rather than losing work. The user can attempt
 * to continue (re-render) or reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Panther Studio crashed:", error, info.componentStack);
    // Best-effort save so the user doesn't lose work.
    try {
      void useStore.getState().saveNow();
    } catch {
      /* ignore */
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-full flex items-center justify-center bg-panel-900 p-8">
          <div className="max-w-md bg-panel-800 rounded-xl border border-panther-red/30 p-6 space-y-3">
            <h2 className="text-lg font-semibold text-panther-red">Something went wrong</h2>
            <p className="text-sm text-gray-300">
              Panther Studio hit an unexpected error and tried to save your project automatically.
            </p>
            <pre className="text-[11px] text-gray-500 bg-panel-900 rounded p-2 overflow-auto max-h-32">
              {this.state.error.message}
            </pre>
            <div className="flex gap-2">
              <button
                onClick={() => this.setState({ error: null })}
                className="text-sm bg-accent hover:bg-accent-hover text-white rounded px-4 py-2"
              >
                Try to continue
              </button>
              <button
                onClick={() => location.reload()}
                className="text-sm bg-panel-700 hover:bg-panel-650 rounded px-4 py-2"
              >
                Reload app
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
