/**
 * Thin bridge to Tauri. Everything here degrades gracefully when running in a
 * plain browser (e.g. `npm run dev` without the Tauri shell), so the same code
 * works for web preview and the packaged desktop app.
 */

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface AppPaths {
  app_data_dir: string;
  app_local_data_dir: string;
  app_config_dir: string;
  version: string;
}

export async function getAppPaths(): Promise<AppPaths | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<AppPaths>("get_app_paths");
  } catch {
    return null;
  }
}

export async function ensureAppDirs(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("ensure_app_dirs");
  } catch {
    /* ignore */
  }
}

export async function bootLog(message: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("append_boot_log", { message });
  } catch {
    /* logging must never affect startup */
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function browserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Save a Blob to a user-chosen location via the native save dialog (desktop) or
 * a browser download (web preview). Returns true if the file was written.
 */
export async function saveBlobFile(blob: Blob, defaultName: string): Promise<boolean> {
  if (!isTauri()) {
    browserDownload(blob, defaultName);
    return true;
  }
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    const path = await save({
      defaultPath: defaultName,
      filters: [{ name: "WAV audio", extensions: ["wav"] }],
    });
    if (!path) return false;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await invoke("write_binary_file", { path, base64Data: bytesToBase64(bytes) });
    return true;
  } catch (e) {
    console.error("saveBlobFile failed", e);
    return false;
  }
}

/** Pick a directory (desktop only). Returns null in the browser. */
export async function pickDirectory(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = await open({ directory: true, multiple: false });
    return typeof dir === "string" ? dir : null;
  } catch {
    return null;
  }
}

/** Write a Blob into a directory by name (desktop) or download it (web). */
export async function writeBlobToDir(
  dir: string | null,
  filename: string,
  blob: Blob
): Promise<void> {
  if (!isTauri() || !dir) {
    browserDownload(blob, filename);
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const sep = dir.includes("\\") ? "\\" : "/";
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await invoke("write_binary_file", {
    path: `${dir}${sep}${filename}`,
    base64Data: bytesToBase64(bytes),
  });
}

/**
 * Check for updates via the updater plugin. This is a scaffold: it only does
 * anything once `plugins.updater` (endpoints + pubkey) is configured in
 * tauri.conf.json and a release feed is published. See DESKTOP_APP_ARCHITECTURE.md.
 */
export async function checkForUpdates(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (update) {
      return `Updates ready: version ${update.version}`;
    }
    return "Updates ready: you're on the latest version.";
  } catch (e) {
    // No updater config yet, or no network — expected during early development.
    return `Update check failed: ${String(e)}`;
  }
}
