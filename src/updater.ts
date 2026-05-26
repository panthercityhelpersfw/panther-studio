import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { bootLog, isTauri } from "./tauri";

export type ReleaseChannel = "stable" | "beta";
export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "installed"
  | "error";

export interface ReleaseManifest {
  channel: ReleaseChannel;
  latestVersion: string;
  minimumSupportedVersion: string;
  projectSchema: {
    current: number;
    minimumReadable: number;
  };
  critical: boolean;
  major: boolean;
  releaseDate: string;
  releaseNotes: string;
  updaterEndpoint?: string;
}

export interface UpdateDiagnostics {
  currentVersion: string;
  releaseChannel: ReleaseChannel;
  updateEndpoint: string;
  updaterEnabled: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  expectedManifestUrl: string;
  localUpdateTestMode: boolean;
  httpStatus: number | null;
  jsonParsed: boolean | null;
  signaturePresent: boolean | null;
  windowsPlatformMatched: boolean | null;
  expectedPlatform: string;
  artifactUrl: string | null;
}

export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  latestVersion: string | null;
  channel: ReleaseChannel;
  releaseNotes: string;
  major: boolean;
  critical: boolean;
  blocked: boolean;
  message: string;
  downloaded: boolean;
  errorLog: string[];
  diagnostics: UpdateDiagnostics;
}

const DEFAULT_TAURI_UPDATER_ENDPOINT =
  "https://github.com/panthercityhelpersfw/panther-studio/releases/latest/download/latest.json";
const UPDATE_MANIFEST_BASE = import.meta.env.VITE_PANTHER_UPDATE_MANIFEST_URL || "";
const UPDATER_ENABLED = import.meta.env.VITE_PANTHER_UPDATER_ENABLED === "true";
const TAURI_UPDATER_ENDPOINT = import.meta.env.VITE_PANTHER_UPDATER_ENDPOINT || DEFAULT_TAURI_UPDATER_ENDPOINT;
const EXPECTED_PLATFORM = import.meta.env.VITE_PANTHER_UPDATER_PLATFORM || "windows-x86_64";
const LOCAL_UPDATE_TEST_MODE =
  import.meta.env.VITE_PANTHER_LOCAL_UPDATE_TEST_MODE === "true" ||
  /^http:\/\/(127\.0\.0\.1|localhost):17632\/latest\.json$/i.test(TAURI_UPDATER_ENDPOINT);

let pendingUpdate: Update | null = null;
let downloadedUpdate: Update | null = null;

function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function manifestUrl(channel: ReleaseChannel) {
  return `${UPDATE_MANIFEST_BASE.replace(/\/$/, "")}/${channel}/latest.json`;
}

async function fetchManifest(channel: ReleaseChannel): Promise<ReleaseManifest | null> {
  if (!UPDATE_MANIFEST_BASE) return null;
  try {
    const res = await fetch(manifestUrl(channel), { cache: "no-store" });
    if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
    return (await res.json()) as ReleaseManifest;
  } catch {
    return null;
  }
}

function readStoredDiagnostics(channel: ReleaseChannel, currentVersion = "0.1.0"): UpdateDiagnostics | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem("panther.updaterDiagnostics");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UpdateDiagnostics;
    return { ...parsed, currentVersion, releaseChannel: channel };
  } catch {
    return null;
  }
}

function baseDiagnostics(channel: ReleaseChannel, currentVersion = "0.1.0"): UpdateDiagnostics {
  return {
    currentVersion,
    releaseChannel: channel,
    updateEndpoint: TAURI_UPDATER_ENDPOINT,
    updaterEnabled: UPDATER_ENABLED && isTauri(),
    lastCheckedAt: null,
    lastError: null,
    expectedManifestUrl: TAURI_UPDATER_ENDPOINT,
    localUpdateTestMode: LOCAL_UPDATE_TEST_MODE,
    httpStatus: null,
    jsonParsed: null,
    signaturePresent: null,
    windowsPlatformMatched: null,
    expectedPlatform: EXPECTED_PLATFORM,
    artifactUrl: null,
  };
}

function saveDiagnostics(diagnostics: UpdateDiagnostics) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem("panther.updaterDiagnostics", JSON.stringify(diagnostics));
  } catch {
    /* diagnostics must never affect startup or updates */
  }
}

async function inspectUpdaterEndpoint(channel: ReleaseChannel, currentVersion: string): Promise<UpdateDiagnostics> {
  const diagnostics: UpdateDiagnostics = {
    ...baseDiagnostics(channel, currentVersion),
    lastCheckedAt: new Date().toISOString(),
  };

  try {
    const res = await fetch(TAURI_UPDATER_ENDPOINT, { cache: "no-store" });
    diagnostics.httpStatus = res.status;
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
      diagnostics.jsonParsed = true;
    } catch {
      diagnostics.jsonParsed = false;
    }

    const platform = (json as { platforms?: Record<string, { signature?: unknown; url?: unknown }> } | null)
      ?.platforms?.[EXPECTED_PLATFORM];
    diagnostics.windowsPlatformMatched = Boolean(platform);
    diagnostics.signaturePresent = typeof platform?.signature === "string" && platform.signature.length > 0;
    diagnostics.artifactUrl = typeof platform?.url === "string" ? platform.url : null;
  } catch (e) {
    diagnostics.lastError = `Endpoint fetch failed: ${String(e)}`;
  }

  saveDiagnostics(diagnostics);
  return diagnostics;
}

function diagnosticFailure(diagnostics: UpdateDiagnostics): string | null {
  if (diagnostics.lastError) return diagnostics.lastError;
  if (diagnostics.httpStatus !== null && (diagnostics.httpStatus < 200 || diagnostics.httpStatus >= 300)) {
    return `Update feed returned HTTP ${diagnostics.httpStatus}`;
  }
  if (diagnostics.jsonParsed === false) return "Update feed response was not valid JSON";
  if (diagnostics.windowsPlatformMatched === false) return `Update feed is missing platform key ${diagnostics.expectedPlatform}`;
  if (diagnostics.signaturePresent === false) return `Update feed is missing a signature for ${diagnostics.expectedPlatform}`;
  if (!diagnostics.artifactUrl && diagnostics.windowsPlatformMatched) return `Update feed is missing an artifact URL for ${diagnostics.expectedPlatform}`;
  return null;
}

function formatDiagnostics(diagnostics: UpdateDiagnostics): string[] {
  const yn = (value: boolean | null) => (value === null ? "unknown" : value ? "yes" : "no");
  return [
    `URL checked: ${diagnostics.updateEndpoint}`,
    `HTTP status: ${diagnostics.httpStatus ?? "unavailable"}`,
    `JSON parsed: ${yn(diagnostics.jsonParsed)}`,
    `Signature present: ${yn(diagnostics.signaturePresent)}`,
    `Windows platform matched (${diagnostics.expectedPlatform}): ${yn(diagnostics.windowsPlatformMatched)}`,
    `Artifact URL: ${diagnostics.artifactUrl ?? "unavailable"}`,
  ];
}

function detailedError(error: unknown, diagnostics: UpdateDiagnostics): string {
  const cause = diagnosticFailure(diagnostics) ?? String(error);
  return [`${cause}`, ...formatDiagnostics(diagnostics), `Updater error: ${String(error)}`].join("\n");
}

function fallbackState(
  channel: ReleaseChannel,
  message: string,
  error?: unknown,
  diagnostics: UpdateDiagnostics = readStoredDiagnostics(channel) ?? baseDiagnostics(channel)
): UpdateState {
  const errorLine = error ? `${new Date().toISOString()} ${String(error)}` : null;
  if (errorLine && typeof localStorage !== "undefined") {
    try {
      const prev = JSON.parse(localStorage.getItem("panther.updateErrors") || "[]") as string[];
      localStorage.setItem("panther.updateErrors", JSON.stringify([errorLine, ...prev].slice(0, 30)));
    } catch {
      /* ignore diagnostics storage failures */
    }
  }
  return {
    phase: error ? "error" : "idle",
    currentVersion: "0.1.0",
    latestVersion: null,
    channel,
    releaseNotes: "",
    major: false,
    critical: false,
    blocked: false,
    message,
    downloaded: false,
    errorLog: errorLine ? [errorLine] : [],
    diagnostics,
  };
}

export async function getUpdaterDiagnostics(channel: ReleaseChannel): Promise<UpdateDiagnostics> {
  const currentVersion = isTauri() ? await getVersion().catch(() => "0.1.0") : "0.1.0";
  return readStoredDiagnostics(channel, currentVersion) ?? baseDiagnostics(channel, currentVersion);
}

export function updateDiagnosticsText(diagnostics: UpdateDiagnostics): string {
  return [
    `Current version: ${diagnostics.currentVersion}`,
    `Release channel: ${diagnostics.releaseChannel}`,
    `Updater enabled: ${diagnostics.updaterEnabled}`,
    `Local update test mode: ${diagnostics.localUpdateTestMode}`,
    `Update endpoint: ${diagnostics.updateEndpoint}`,
    `Expected manifest URL: ${diagnostics.expectedManifestUrl}`,
    `Last checked: ${diagnostics.lastCheckedAt ?? "never"}`,
    `Last error: ${diagnostics.lastError ?? "none"}`,
    ...formatDiagnostics(diagnostics),
  ].join("\n");
}

export function openUpdateFeedUrl() {
  if (typeof window !== "undefined") window.open(TAURI_UPDATER_ENDPOINT, "_blank", "noopener,noreferrer");
}

export async function checkForAppUpdate(channel: ReleaseChannel): Promise<UpdateState> {
  const currentVersion = isTauri() ? await getVersion().catch(() => "0.1.0") : "0.1.0";
  if (!isTauri()) {
    return fallbackState(channel, "Updates are available in the packaged desktop app only.", undefined, baseDiagnostics(channel, currentVersion));
  }
  if (!UPDATER_ENABLED) {
    await bootLog("updater skipped: developer build");
    return fallbackState(channel, "Developer build: updates disabled.", undefined, baseDiagnostics(channel, currentVersion));
  }

  let diagnostics = await inspectUpdaterEndpoint(channel, currentVersion);
  const manifest = await fetchManifest(channel);
  let latestVersion = manifest?.latestVersion ?? null;
  let releaseNotes = manifest?.releaseNotes ?? "";
  let major = manifest?.major ?? false;
  let critical = manifest?.critical ?? false;
  let blocked = false;

  if (manifest && compareVersions(currentVersion, manifest.minimumSupportedVersion) < 0) {
    blocked = true;
  }

  try {
    await bootLog(`updater check start channel=${channel} current=${currentVersion}`);
    const problem = diagnosticFailure(diagnostics);
    if (problem) throw new Error(problem);
    const update = await check();
    pendingUpdate = update ?? null;
    if (update) {
      latestVersion = update.version || latestVersion;
      releaseNotes = update.body || releaseNotes;
      await bootLog(`updater available version=${latestVersion}`);
      return {
        phase: "available",
        currentVersion,
        latestVersion,
        channel,
        releaseNotes,
        major,
        critical,
        blocked,
        message: `Updates ready: version ${latestVersion}`,
        downloaded: false,
        errorLog: [],
        diagnostics,
      };
    }
    const outdatedByManifest = latestVersion && compareVersions(currentVersion, latestVersion) < 0;
    await bootLog(outdatedByManifest ? `updater advisory available version=${latestVersion}` : "updater check ok: latest");
    return {
      phase: outdatedByManifest ? "available" : "not-available",
      currentVersion,
      latestVersion,
      channel,
      releaseNotes,
      major,
      critical,
      blocked,
      message: outdatedByManifest
        ? `Updates ready: manifest reports ${latestVersion}; signed installer is not published for this build yet.`
        : "Updates ready: you're on the latest version.",
      downloaded: false,
      errorLog: [],
      diagnostics,
    };
  } catch (e) {
    const error = detailedError(e, diagnostics);
    diagnostics = { ...diagnostics, lastError: error };
    saveDiagnostics(diagnostics);
    await bootLog(`updater check failed: ${error}`);
    return {
      ...fallbackState(channel, "Update check failed. Your projects were not touched.", error, diagnostics),
      currentVersion,
      latestVersion,
      releaseNotes,
      major,
      critical,
      blocked,
    };
  }
}

export async function downloadAppUpdate(onProgress?: (message: string) => void): Promise<UpdateState> {
  const diagnostics = await getUpdaterDiagnostics("stable");
  if (!UPDATER_ENABLED) return fallbackState("stable", "Developer build: updates disabled.", undefined, diagnostics);
  if (!pendingUpdate) {
    return fallbackState("stable", "No approved signed update is ready to download.", undefined, diagnostics);
  }
  const currentVersion = await getVersion().catch(() => "0.1.0");
  try {
    await bootLog(`updater download start version=${pendingUpdate.version}`);
    let downloaded = 0;
    await pendingUpdate.download((event) => {
      if (event.event === "Started") onProgress?.(`Downloading ${event.data.contentLength ?? "update"} bytes...`);
      if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        onProgress?.(`Downloaded ${Math.round(downloaded / 1024 / 1024)} MB...`);
      }
      if (event.event === "Finished") onProgress?.("Update downloaded. Ready to install.");
    });
    downloadedUpdate = pendingUpdate;
    return {
      phase: "downloaded",
      currentVersion,
      latestVersion: pendingUpdate.version,
      channel: "stable",
      releaseNotes: pendingUpdate.body ?? "",
      major: false,
      critical: false,
      blocked: false,
      message: "Update downloaded. It can install now or on close.",
      downloaded: true,
      errorLog: [],
      diagnostics,
    };
  } catch (e) {
    await bootLog(`updater download failed: ${String(e)}`);
    return fallbackState("stable", "Update download failed. Keep using this version or download the installer manually.", e, diagnostics);
  }
}

export async function installDownloadedUpdate(): Promise<UpdateState> {
  const diagnostics = await getUpdaterDiagnostics("stable");
  if (!UPDATER_ENABLED) return fallbackState("stable", "Developer build: updates disabled.", undefined, diagnostics);
  const update = downloadedUpdate ?? pendingUpdate;
  if (!update) return fallbackState("stable", "No downloaded update is ready to install.", undefined, diagnostics);
  const currentVersion = await getVersion().catch(() => "0.1.0");
  try {
    await bootLog(`updater install start version=${update.version}`);
    await update.install();
    return {
      phase: "installed",
      currentVersion,
      latestVersion: update.version,
      channel: "stable",
      releaseNotes: update.body ?? "",
      major: false,
      critical: false,
      blocked: false,
      message: "Update installed. Restarting Panther Studio...",
      downloaded: true,
      errorLog: [],
      diagnostics,
    };
  } catch (e) {
    await bootLog(`updater install failed: ${String(e)}`);
    return fallbackState("stable", "Update install failed. Existing projects and settings were preserved.", e, diagnostics);
  }
}

export async function restartIntoUpdate(): Promise<void> {
  if (isTauri()) await relaunch();
}
