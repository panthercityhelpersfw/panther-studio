import { create } from "zustand";
import { audioEngine } from "../audio/AudioEngine";
import { mixToMono, dropMono } from "../audio/waveform";
import {
  defaultEffects,
  normalizeEffects,
  type EffectsState,
  type EffectKey,
} from "../audio/effects/types";
import { getPreset } from "../audio/presets";
import { analyzeBuffer, deriveEnhancement, type ClipAnalysis } from "../audio/autoEnhance";
import { analyzeLoudness, type LoudnessResult } from "../audio/loudness";
import { deriveMaster, type LoudnessTarget } from "../audio/autoMaster";
import { getMasterPreset } from "../audio/masterPresets";
import { renderMixdown, renderProject, renderRegion, renderStem, encodeMp3, encodeWav } from "../audio/export";
import { correctPitch, detectPitchTrack, KEY_NAMES, pitchShiftConstant, timeStretchConstant, type PitchFrame, type ScaleId } from "../audio/autotune";
import { analyzeTake, type CoachResult } from "../audio/vocalCoach";
import { cleanVocal, type CleanOptions } from "../audio/cleanup";
import {
  analyzeBeatIntelligence as runBeatIntelligence,
  analyzeVocalTuneAssist,
  createDefaultWarmups,
  warmupFeedback,
} from "../audio/beatIntelligence";
import {
  analyzeLiveVocalFrame,
  summarizeLiveTake,
  type LiveVocalFrame,
  type LiveVocalFrameResult,
} from "../audio/liveVocalDirector";
import {
  connectorSummary,
  defaultBeatBrowser,
  normalizeBeatBrowser,
  searchBeatIndex,
} from "../audio/beatDiscovery";
import { analyzeMix, levelRide, type MixFixKind, type TrackMixReport } from "../audio/mixAssistant";
import { compose } from "../audio/composer";
import { createLyricProducerNotes } from "../audio/lyrics";
import { DRUM_LANES } from "../audio/instruments";
import {
  analyzeStudioIntelligence as runStudioIntelligence,
  applyMemoryEvent,
  getFactoryPreset,
  normalizeStudioMemory,
  type StudioIntelligenceSnapshot,
} from "../audio/studioIntelligence";
import { bootLog, saveBlobFile, pickDirectory, writeBlobToDir, isTauri } from "../tauri";
import {
  checkForAppUpdate,
  downloadAppUpdate,
  installDownloadedUpdate,
  restartIntoUpdate,
  type ReleaseChannel,
  type UpdateState,
} from "../updater";
import * as db from "../persistence/db";
import { migrateProjectForOpen, CURRENT_PROJECT_SCHEMA_VERSION } from "../persistence/projectMigrations";
import {
  type AppSettings,
  type AudioAsset,
  type AutomationLane,
  type AutomationTarget,
  type BeatSearchFilters,
  type Bus,
  type Clip,
  type CoachNote,
  type CoachScoreEntry,
  type ExportEntry,
  type ExportSettings,
  type IdeaSnapshot,
  type ID,
  type InstrumentId,
  type LiveDirectorMode,
  type LiveVocalDirectorState,
  type LiveVocalMarker,
  type LiveWordFeedback,
  type LyricLine,
  type LyricSectionId,
  type LyricStudio,
  type Marker,
  type MasterState,
  type MeterLevels,
  type MidiNote,
  type Pad,
  type PatternClip,
  type PerformanceHealth,
  type Profile,
  type Project,
  type ProjectStory,
  type ProducerTeamState,
  type VocalWarmupStudioState,
  type ReferenceTrack,
  type SavedPreset,
  type SmartHistoryEvent,
  type SongMoodBoard,
  type Track,
  type VibeModeId,
  TRACK_COLORS,
  defaultBuses,
} from "./types";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const safeName = (s: string) => s.replace(/[^\w.-]+/g, "_").slice(0, 60) || "panther";

function newTrack(index: number): Track {
  return {
    id: uid(),
    name: `Vocal ${index + 1}`,
    color: TRACK_COLORS[index % TRACK_COLORS.length].hex,
    gain: 1,
    pan: 0,
    muted: false,
    soloed: false,
    armed: index === 0,
    monitor: false,
    height: 96,
    effects: defaultEffects(),
    instrument: "synth",
    busId: "vocals",
    sends: {},
    frozen: null,
  };
}

function defaultMaster(): MasterState {
  return { effects: defaultEffects(), bypass: false };
}

function defaultMoodBoard(): SongMoodBoard {
  return {
    mood: "",
    genre: "",
    bpm: "",
    songKey: "",
    targetStyle: "",
    emotionTags: [],
    notes: "",
  };
}

function defaultVocalSession() {
  return {
    punchIn: false,
    loopRecord: false,
    stackMode: "lead" as const,
    monitoringDiagnostics: ["Input ready check pending", "Use headphones for live monitoring"],
    compareSlot: "A" as const,
  };
}

function defaultProjectStory(): ProjectStory {
  return {
    vibe: "",
    inspiration: "",
    concept: "",
    references: [],
    artworkPrompt: "",
    worldNotes: "",
  };
}

function defaultLyricMarks() {
  return {
    punchIn: false,
    adlib: false,
    harmony: false,
    double: false,
    breathAfter: false,
    emphasisWords: [] as string[],
  };
}

function defaultLyricStudio(): LyricStudio {
  return {
    lines: [],
    activeSection: "verse",
    conceptNotes: "",
    hookIdeas: [],
    unusedLines: [],
    freestyleCaptures: [],
    updatedAt: Date.now(),
  };
}

function normalizeLyricLine(line: Partial<LyricLine>, order: number): LyricLine {
  return {
    id: line.id ?? uid(),
    section: line.section ?? "verse",
    text: line.text ?? "",
    order: line.order ?? order,
    createdAt: line.createdAt ?? Date.now(),
    updatedAt: line.updatedAt ?? Date.now(),
    timeSec: line.timeSec ?? null,
    regionStartSec: line.regionStartSec ?? null,
    regionEndSec: line.regionEndSec ?? null,
    clipId: line.clipId ?? null,
    moodTags: line.moodTags ?? [],
    themeTags: line.themeTags ?? [],
    performance: { ...defaultLyricMarks(), ...(line.performance ?? {}) },
  };
}

function normalizeLyricStudio(studio?: Partial<LyricStudio>, legacyLyrics = ""): LyricStudio {
  const base = defaultLyricStudio();
  const legacyLines = legacyLyrics
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter((text) => text && !text.startsWith("• ["))
    .map((text, order) => normalizeLyricLine({ text, section: "verse" }, order));
  const lines = (studio?.lines?.length ? studio.lines : legacyLines).map((line, order) => normalizeLyricLine(line, order));
  return {
    ...base,
    ...studio,
    lines,
    activeSection: studio?.activeSection ?? "verse",
    hookIdeas: studio?.hookIdeas ?? [],
    unusedLines: studio?.unusedLines ?? [],
    freestyleCaptures: studio?.freestyleCaptures ?? [],
    updatedAt: studio?.updatedAt ?? Date.now(),
  };
}

function defaultProducerTeam(): ProducerTeamState {
  return {
    notes: [],
    dismissedIds: [],
    savedIds: [],
    updatedAt: Date.now(),
  };
}

function normalizeProducerTeam(team?: Partial<ProducerTeamState>): ProducerTeamState {
  const base = defaultProducerTeam();
  return {
    ...base,
    ...team,
    notes: team?.notes ?? [],
    dismissedIds: team?.dismissedIds ?? [],
    savedIds: team?.savedIds ?? [],
    updatedAt: team?.updatedAt ?? Date.now(),
  };
}

function defaultVocalWarmups(): VocalWarmupStudioState {
  return createDefaultWarmups();
}

function normalizeVocalWarmups(warmups?: Partial<VocalWarmupStudioState>): VocalWarmupStudioState {
  return createDefaultWarmups(warmups as VocalWarmupStudioState | undefined);
}

function defaultLiveVocalDirector(): LiveVocalDirectorState {
  return {
    enabled: true,
    floatingOpen: true,
    mode: "vocalCoach",
    active: false,
    status: "idle",
    currentScore: 0,
    currentMessage: "Arm a track and record to start live coaching.",
    currentSeverity: "ok",
    markers: [],
    wordFeedback: [],
    takeSummaries: [],
    progress: [],
    weeklySummary: [],
    warmupFocus: "melodicRap",
    workerLive: false,
    lastFrameAt: null,
  };
}

function normalizeLiveVocalDirector(state?: Partial<LiveVocalDirectorState>): LiveVocalDirectorState {
  const base = defaultLiveVocalDirector();
  return {
    ...base,
    ...state,
    markers: state?.markers ?? [],
    wordFeedback: state?.wordFeedback ?? [],
    takeSummaries: state?.takeSummaries ?? [],
    progress: state?.progress ?? [],
    weeklySummary: state?.weeklySummary ?? [],
  };
}

function defaultBeatDiscovery() {
  return defaultBeatBrowser();
}

function defaultExportSettings(): ExportSettings {
  return {
    format: "wav",
    sampleRate: 48000,
    wavBitDepth: 24,
    mp3Kbps: 192,
    includeMaster: true,
    normalizePeak: false,
  };
}

function normalizeExportSettings(settings?: Partial<ExportSettings>): ExportSettings {
  const base = defaultExportSettings();
  return {
    ...base,
    ...settings,
    format: settings?.format === "mp3" ? "mp3" : "wav",
    sampleRate: settings?.sampleRate === 44100 ? 44100 : 48000,
    wavBitDepth: settings?.wavBitDepth === 16 ? 16 : 24,
    mp3Kbps: [128, 192, 256, 320].includes(settings?.mp3Kbps ?? 0) ? settings!.mp3Kbps! : 192,
    includeMaster: settings?.includeMaster ?? true,
    normalizePeak: settings?.normalizePeak ?? false,
  };
}

function makeAutomationLane(target: AutomationTarget, name: string, color: string, trackId?: ID | null): AutomationLane {
  const isPan = target.includes("pan");
  const isDb = target.includes("threshold") || target.includes("Gain");
  return {
    id: uid(),
    target,
    trackId: trackId ?? null,
    name,
    color,
    enabled: true,
    min: isPan ? -1 : isDb ? -24 : 0,
    max: isPan ? 1 : isDb ? 12 : target === "master.width" ? 2 : 1.5,
    points: [],
  };
}

export function createEmptyProject(name = "Untitled Project", profileId: ID | null = null): Project {
  const now = Date.now();
  return {
    id: uid(),
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    savedWithVersion: "0.1.0",
    name,
    tempo: 120,
    createdAt: now,
    updatedAt: now,
    tracks: [newTrack(0)],
    clips: [],
    assets: [],
    markers: [],
    pads: [],
    loop: { enabled: false, startSec: 0, endSec: 4 },
    master: defaultMaster(),
    reference: null,
    masterGain: 1,
    lengthSec: 60,
    profileId,
    buses: defaultBuses(),
    lyrics: "",
    favorite: false,
    exportHistory: [],
    exportSettings: defaultExportSettings(),
    coachNotes: [],
    coachHistory: [],
    stereoWidth: 1,
    monoBelowHz: 0,
    studioIntelligence: {
      current: null,
      history: [],
      memory: normalizeStudioMemory(),
    },
    automation: [],
    libraryItems: [],
    patterns: [],
    sessionTemplateId: "blank-advanced",
    vocalSession: defaultVocalSession(),
    vibeMode: "off",
    projectStory: defaultProjectStory(),
    inspirationCaptures: [],
    magicMicReport: null,
    lyricStudio: defaultLyricStudio(),
    producerTeam: defaultProducerTeam(),
    beatIntelligence: null,
    vocalTuneAssist: null,
    vocalWarmups: defaultVocalWarmups(),
    liveVocalDirector: defaultLiveVocalDirector(),
    beatBrowser: defaultBeatDiscovery(),
    moodBoard: defaultMoodBoard(),
    producerNotes: "",
    ideaSnapshots: [],
    smartHistory: [],
    performanceHealth: null,
  };
}

/** Fill in defaults for clips loaded from older projects or created tersely. */
function normalizeClip(c: Partial<Clip>): Clip {
  return {
    id: c.id ?? uid(),
    trackId: c.trackId!,
    assetId: c.assetId ?? "",
    name: c.name ?? "Clip",
    kind: c.kind ?? "audio",
    startSec: c.startSec ?? 0,
    offsetSec: c.offsetSec ?? 0,
    durationSec: c.durationSec ?? 0,
    take: c.take ?? 1,
    gain: c.gain ?? 1,
    fadeInSec: c.fadeInSec ?? 0,
    fadeOutSec: c.fadeOutSec ?? 0,
    muted: c.muted ?? false,
    notes: c.kind === "midi" ? c.notes ?? [] : c.notes,
    dryAssetId: c.dryAssetId,
    processedLabel: c.processedLabel,
    groupId: c.groupId ?? null,
    locked: c.locked ?? false,
    colorLabel: c.colorLabel,
    reversed: c.reversed ?? false,
    normalized: c.normalized ?? false,
    takeLane: c.takeLane ?? c.take ?? 1,
    compRole: c.compRole ?? "candidate",
    bouncedFromClipIds: c.bouncedFromClipIds,
    sourceBpm: c.sourceBpm ?? null,
    stretchRatio: c.stretchRatio ?? 1,
    pitchShiftSemitones: c.pitchShiftSemitones ?? 0,
  };
}

/** Migrate a loaded project so new fields always exist (older projects too). */
function normalizeProject(p: Project): Project {
  return {
    ...p,
    schemaVersion: p.schemaVersion ?? CURRENT_PROJECT_SCHEMA_VERSION,
    savedWithVersion: p.savedWithVersion ?? "0.1.0",
    tracks: p.tracks.map((t) => ({
      ...t,
      effects: normalizeEffects(t.effects),
      instrument: t.instrument ?? "synth",
      busId: t.busId === undefined ? "vocals" : t.busId,
      sends: t.sends ?? {},
      frozen: t.frozen ?? null,
    })),
    clips: (p.clips ?? []).map(normalizeClip),
    markers: p.markers ?? [],
    pads: p.pads ?? [],
    loop: p.loop ?? { enabled: false, startSec: 0, endSec: 4 },
    master: p.master
      ? { ...p.master, effects: normalizeEffects(p.master.effects) }
      : defaultMaster(),
    reference: p.reference ?? null,
    profileId: p.profileId ?? null,
    buses: p.buses && p.buses.length ? p.buses : defaultBuses(),
    lyrics: p.lyrics ?? "",
    favorite: p.favorite ?? false,
    exportHistory: p.exportHistory ?? [],
    exportSettings: normalizeExportSettings(p.exportSettings),
    coachNotes: p.coachNotes ?? [],
    coachHistory: p.coachHistory ?? [],
    stereoWidth: p.stereoWidth ?? 1,
    monoBelowHz: p.monoBelowHz ?? 0,
    studioIntelligence: {
      current: p.studioIntelligence?.current ?? null,
      history: p.studioIntelligence?.history ?? [],
      memory: normalizeStudioMemory(p.studioIntelligence?.memory),
    },
    automation: p.automation ?? [],
    libraryItems: p.libraryItems ?? [],
    patterns: p.patterns ?? [],
    sessionTemplateId: p.sessionTemplateId ?? "blank-advanced",
    vocalSession: { ...defaultVocalSession(), ...(p.vocalSession ?? {}) },
    vibeMode: p.vibeMode ?? "off",
    projectStory: { ...defaultProjectStory(), ...(p.projectStory ?? {}) },
    inspirationCaptures: p.inspirationCaptures ?? [],
    magicMicReport: p.magicMicReport ?? null,
    lyricStudio: normalizeLyricStudio(p.lyricStudio, p.lyrics ?? ""),
    producerTeam: normalizeProducerTeam(p.producerTeam),
    beatIntelligence: p.beatIntelligence ?? null,
    vocalTuneAssist: p.vocalTuneAssist ?? null,
    vocalWarmups: normalizeVocalWarmups(p.vocalWarmups),
    liveVocalDirector: normalizeLiveVocalDirector(p.liveVocalDirector),
    beatBrowser: normalizeBeatBrowser(p.beatBrowser),
    moodBoard: { ...defaultMoodBoard(), ...(p.moodBoard ?? {}) },
    producerNotes: p.producerNotes ?? "",
    ideaSnapshots: p.ideaSnapshots ?? [],
    smartHistory: p.smartHistory ?? [],
    performanceHealth: p.performanceHealth ?? null,
  };
}

/** Look up a bus's multiplier (gain) and whether it mutes the track. */
function busFactor(buses: Bus[] | undefined, busId: string | null | undefined): { gain: number; muted: boolean } {
  if (!busId || !buses) return { gain: 1, muted: false };
  const b = buses.find((x) => x.id === busId);
  if (!b) return { gain: 1, muted: false };
  return { gain: b.gain * (b.returnGain ?? 1), muted: b.muted };
}

function effectiveGain(track: Track, anySolo: boolean, buses?: Bus[]): number {
  if (track.muted) return 0;
  if (anySolo && !track.soloed) return 0;
  const bf = busFactor(buses, track.busId);
  if (bf.muted) return 0;
  const sendLift = Object.entries(track.sends ?? {}).reduce((sum, [busId, send]) => {
    const bus = busFactor(buses, busId);
    return sum + (bus.muted ? 0 : send.gain * 0.35 * bus.gain);
  }, 0);
  return track.gain * bf.gain + (track.gain * sendLift);
}

interface StoreState {
  // Core
  project: Project;
  projectList: Project[];
  selectedTrackId: ID | null;
  selectedClipId: ID | null;

  // Transport
  playing: boolean;
  recording: boolean;
  positionSec: number;

  // View
  pixelsPerSecond: number;
  snapSec: number;
  snapEnabled: boolean;
  /** Grid division in beats (1 = 1/4 note at current tempo, 0.25 = 1/16). */
  gridDivision: number;

  // Editing / undo
  past: Project[];
  future: Project[];
  editingMidiClipId: ID | null;
  padBankOpen: boolean;

  // Mic
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  permission: "unknown" | "granted" | "denied" | "prompt";
  inputGain: number;
  monitor: boolean;
  monitorMode: "dry" | "wet";
  monitorWarningAcknowledged: boolean;
  inputLevel: number;

  // Meters
  meters: MeterLevels;

  // UI
  view: "dashboard" | "studio";
  micPanelOpen: boolean;
  showMonitorWarning: boolean;
  saving: boolean;
  lastSaved: number | null;
  dirty: boolean;
  statusMessage: string | null;

  // Auto-enhance report (drives a modal). Null when hidden.
  enhanceReport: {
    trackId: ID;
    trackName: string;
    changes: string[];
    analysis: ClipAnalysis;
  } | null;

  // Mastering / loudness / export
  loudnessReport: LoudnessResult | null;
  masterReport: { changes: string[]; loud: LoudnessResult } | null;
  analyzing: boolean;
  exporting: boolean;
  exportProgress: string | null;
  referenceMode: "mix" | "ref";
  exportSettings: ExportSettings;

  // Preferences (Step 5)
  prefsOpen: boolean;
  wizardOpen: boolean;
  helpOpen: boolean;
  accent: string;
  autosaveIntervalSec: number;
  autoCheckUpdates: boolean;
  releaseChannel: ReleaseChannel;
  autoDownloadUpdates: boolean;
  installUpdatesOnClose: boolean;
  lowCpuMode: boolean;
  disableVisualizers: boolean;
  metronomeEnabled: boolean;
  countInBars: number;
  setupComplete: boolean;
  updateStatus: string | null;
  updateInfo: UpdateState | null;
  checkingUpdate: boolean;
  recoveryPrompt: { projectId: ID; name: string; when: number } | null;

  // Profiles / accounts + preset library
  profiles: Profile[];
  currentProfileId: ID | null;
  presets: SavedPreset[];

  // Panels (Audio Setup, Instrument Builder, Vocal Coach, Library)
  audioSetupOpen: boolean;
  builderOpen: boolean;
  coachOpen: boolean;
  libraryOpen: boolean;
  beatBrowserOpen: boolean;
  outputDeviceId: string | null;
  outputDevices: MediaDeviceInfo[];

  // ---- profile actions ----
  refreshProfiles: () => Promise<void>;
  createProfile: (name: string, avatar?: string, color?: string) => Promise<void>;
  selectProfile: (id: ID) => Promise<void>;
  updateCurrentProfile: (patch: Partial<Profile>) => Promise<void>;
  deleteProfileById: (id: ID) => Promise<void>;
  signOutProfile: () => void;

  // ---- preset library ----
  refreshPresets: () => Promise<void>;
  savePresetToLibrary: (kind: SavedPreset["kind"], name: string, data: unknown) => Promise<void>;
  deletePresetFromLibrary: (id: ID) => Promise<void>;
  duplicatePresetInLibrary: (id: ID) => Promise<void>;
  togglePresetFavorite: (id: ID) => Promise<void>;
  applyLibraryPreset: (preset: SavedPreset, trackId?: ID) => void;

  // ---- panels ----
  setAudioSetupOpen: (open: boolean) => void;
  setBuilderOpen: (open: boolean) => void;
  setCoachOpen: (open: boolean) => void;
  setLibraryOpen: (open: boolean) => void;
  setBeatBrowserOpen: (open: boolean) => void;
  refreshOutputDevices: () => Promise<void>;
  setOutputDevice: (id: string) => Promise<void>;

  // ---- autotune / pitch ----
  tuneKey: number;
  tuneScale: ScaleId;
  tuneStrength: number;
  tuneSpeed: number;
  tuneHumanize: number;
  tuneFormant: boolean;
  pitchLane: { clipId: ID; frames: PitchFrame[] } | null;
  processing: boolean;
  setTuneOpt: (
    patch: Partial<{ key: number; scale: ScaleId; strength: number; speed: number; humanize: number; formant: boolean }>
  ) => void;
  analyzePitch: (clipId: ID) => void;
  applyAutotune: (clipId: ID) => Promise<void>;

  // ---- vocal cleanup ----
  cleanOpts: CleanOptions;
  setCleanOpt: (patch: Partial<CleanOptions>) => void;
  applyCleanup: (clipId: ID, oneClick?: boolean) => Promise<void>;

  /** Before/after toggle for destructive processors (autotune/cleanup). */
  toggleProcessBypass: (clipId: ID) => void;

  // ---- mix assistant ----
  mixReports: TrackMixReport[] | null;
  analyzeMixNow: () => Promise<void>;
  applyMixFix: (trackId: ID, kind: MixFixKind) => void;
  autoGainStage: () => Promise<void>;
  autoRouteBuses: () => void;
  levelRideClip: (clipId: ID) => Promise<void>;

  // ---- studio intelligence ----
  studioIntelligenceReport: StudioIntelligenceSnapshot | null;
  studioIntelligenceBusy: boolean;
  performanceHealth: PerformanceHealth | null;
  studioMode: boolean;
  liveSessionMode: boolean;
  analyzeStudioIntelligence: () => Promise<void>;
  applyStudioRecommendation: (recommendationId: ID) => Promise<void>;
  rejectStudioRecommendation: (recommendationId: ID) => void;
  applyFactoryFxPreset: (presetId: string, trackId?: ID) => void;
  analyzeBeatIntelligence: (clipId?: ID) => Promise<void>;
  applyBeatTempoToProject: () => void;
  autoAlignSelectedClipToGrid: () => void;
  analyzeTuneAssist: (clipId?: ID) => void;
  applyTuneAssistSettings: () => void;
  applyBedroomStudioCleaner: (trackId?: ID) => void;
  completeWarmupDrill: (drillId: ID) => void;
  setLiveDirectorEnabled: (enabled: boolean) => void;
  setLiveDirectorOpen: (open: boolean) => void;
  setLiveDirectorMode: (mode: LiveDirectorMode) => void;
  setLiveDirectorWarmupFocus: (focus: LiveVocalDirectorState["warmupFocus"]) => void;
  completeLiveDirectorWarmup: (drillTitle: string) => void;
  processLiveDirectorFrame: () => void;
  ingestLiveDirectorResult: (result: LiveVocalFrameResult, frameTimeSec: number) => void;
  finalizeLiveDirectorTake: (takeName?: string) => void;
  replayLiveDirectorMarker: (markerId: ID) => void;
  retakeLiveDirectorMarker: (markerId: ID) => void;
  clearLiveDirectorSession: () => void;
  updateBeatSearchFilters: (patch: Partial<BeatSearchFilters>) => void;
  searchBeats: () => Promise<void>;
  previewBeatResult: (resultId: ID) => Promise<void>;
  importBeatResultToTimeline: (resultId: ID, startSec?: number) => Promise<void>;
  toggleBeatFavorite: (resultId: ID) => void;
  pinBeatToProject: (resultId: ID) => void;
  addBeatCrate: (name: string, mood?: string) => void;
  addBeatToCrate: (crateId: ID, resultId: ID) => void;
  setYouTubeImportUrl: (url: string) => void;
  importYouTubeOwnedAudio: (file: File) => Promise<void>;
  enableArtistMode: () => Promise<void>;
  runSessionAI: () => Promise<void>;
  updateMoodBoard: (patch: Partial<SongMoodBoard>) => void;
  setProducerNotes: (text: string) => void;
  smartStartProject: (intent: "record" | "beat" | "mix" | "master" | "idea") => Promise<void>;
  quickIdeaCapture: () => Promise<void>;
  saveIdeaSnapshot: (name?: string) => Promise<void>;
  restoreIdeaSnapshot: (id: ID) => Promise<void>;
  makeItHit: () => Promise<void>;
  makeItEmotional: () => Promise<void>;
  creativePanic: (kind: "harder" | "hook" | "emotional" | "space" | "clean" | "aggressive" | "intimate" | "cinematic") => Promise<void>;
  runPerformanceGuardian: (reason?: string) => void;
  enableEmergencySafeMode: () => void;
  generateStressTestProject: () => Promise<void>;
  setStudioMode: (on: boolean) => void;
  setLiveSessionMode: (on: boolean) => void;

  // ---- optimization ----
  freezeTrack: (trackId: ID) => Promise<void>;
  unfreezeTrack: (trackId: ID) => void;
  bounceTrack: (trackId: ID) => Promise<void>;
  clearUnusedAudio: () => Promise<void>;
  projectCleanup: () => Promise<void>;

  // ---- vocal coach ----
  coachResult: { clipId: ID; result: CoachResult } | null;
  analyzeTake: (clipId: ID) => void;
  createPunchIn: (clipId: ID) => void;
  applySafeFixes: (clipId: ID) => Promise<void>;
  addDoubleTrack: (clipId: ID) => void;
  addHarmonyDraft: (clipId: ID) => Promise<void>;
  addIdeaToNotes: (text: string) => void;
  clearCoachNotes: () => void;
  createVocalStack: (clipId?: ID) => void;
  setVocalCompareSlot: (slot: "A" | "B") => void;
  runVocalRecordingWizard: () => Promise<void>;
  runMagicMicChain: () => Promise<void>;
  setVibeMode: (mode: VibeModeId) => void;
  updateProjectStory: (patch: Partial<ProjectStory>) => void;
  captureInspiration: (kind: "voice" | "melody" | "lyric" | "beat" | "rhythm", text?: string) => Promise<void>;
  learnCurrentSession: (intent: string) => void;

  // ---- local composer ----
  composeFromPrompt: (prompt: string) => string;
  addInstrumentTrack: (instrument: InstrumentId, name?: string) => ID;
  addBeatClip: (opts: {
    name: string;
    instrument: InstrumentId;
    busId: string;
    durationSec: number;
    notes: { pitch: number; startSec: number; durationSec: number; velocity: number }[];
  }) => ID;
  createPatternFromGrid: (name: string, grid: Record<string, boolean[]>, swing?: number) => ID | null;
  duplicatePattern: (patternId: ID, mutate?: boolean) => ID | null;
  placePattern: (patternId: ID, startSec?: number) => ID | null;
  convertMidiToAudio: (clipId: ID) => Promise<void>;
  addSongSection: (name: string) => void;
  buildSongStructure: () => void;
  applySessionTemplate: (templateId: string) => Promise<void>;

  // ---- actions ----
  init: () => Promise<void>;
  refreshProjectList: () => Promise<void>;
  newProject: (name?: string) => Promise<void>;
  openProject: (id: ID) => Promise<void>;
  deleteProject: (id: ID) => Promise<void>;
  renameProject: (name: string) => void;
  setView: (v: "dashboard" | "studio") => void;
  setMasterGain: (g: number) => void;
  setTempo: (t: number) => void;

  addTrack: (opts?: { name?: string; instrument?: InstrumentId; busId?: string }) => ID;
  deleteTrack: (id: ID) => void;
  renameTrack: (id: ID, name: string) => void;
  setTrackColor: (id: ID, hex: string) => void;
  setTrackGain: (id: ID, gain: number) => void;
  setTrackPan: (id: ID, pan: number) => void;
  toggleMute: (id: ID) => void;
  toggleSolo: (id: ID) => void;
  toggleArm: (id: ID) => void;
  setTrackMonitor: (id: ID, on: boolean) => void;
  setTrackInstrument: (id: ID, instrument: InstrumentId) => void;
  setTrackBus: (id: ID, busId: string | null) => void;
  setTrackSend: (trackId: ID, busId: string, gain: number, pre?: boolean) => void;
  selectTrack: (id: ID | null) => void;

  // Buses / mix groups
  setBusGain: (busId: string, gain: number) => void;
  toggleBusMute: (busId: string) => void;
  setBusReturnGain: (busId: string, gain: number) => void;
  toggleBusPreFader: (busId: string) => void;

  // Lyrics / notes / stereo master
  setLyrics: (text: string) => void;
  setLyricSection: (section: LyricSectionId) => void;
  addLyricLine: (section?: LyricSectionId, text?: string) => ID;
  updateLyricLine: (lineId: ID, patch: Partial<Omit<LyricLine, "performance">> & { performance?: Partial<LyricLine["performance"]> }) => void;
  deleteLyricLine: (lineId: ID) => void;
  attachLyricLineToSelection: (lineId: ID) => void;
  moveLyricLineToBank: (lineId: ID, bank: "hook" | "unused") => void;
  addHookIdea: (text: string) => void;
  addUnusedLyricLine: (text: string) => void;
  updateLyricConcept: (text: string) => void;
  runLyricCoach: () => void;
  applyProducerTeamNote: (noteId: ID) => void;
  dismissProducerTeamNote: (noteId: ID) => void;
  saveProducerTeamNote: (noteId: ID) => void;
  setStereoWidth: (w: number) => void;
  setMonoBelow: (hz: number) => void;

  // Save As / project bundles
  saveProjectAs: (name: string) => Promise<void>;
  exportBundle: () => Promise<void>;
  importBundle: (file: File) => Promise<void>;
  toggleFavorite: (id: ID) => Promise<void>;

  // Effects
  setEffectEnabled: (trackId: ID, key: EffectKey, enabled: boolean) => void;
  setEffectParam: (trackId: ID, key: EffectKey, param: string, value: number) => void;
  applyPreset: (trackId: ID, presetId: string) => void;
  clearEffects: (trackId: ID) => void;
  autoEnhance: (trackId: ID) => void;
  dismissEnhanceReport: () => void;
  setMonitorMode: (mode: "dry" | "wet") => void;

  selectClip: (id: ID | null) => void;
  moveClip: (id: ID, startSec: number) => void;
  moveClipToTrack: (id: ID, trackId: ID, startSec: number) => void;
  deleteClip: (id: ID) => void;
  renameClip: (id: ID, name: string) => void;
  trimClipStart: (id: ID, newStartSec: number) => void;
  trimClipEnd: (id: ID, newEndSec: number) => void;
  splitClipAtPlayhead: () => void;
  duplicateClip: (id: ID) => void;
  setClipGain: (id: ID, gain: number) => void;
  setClipFade: (id: ID, fadeInSec: number, fadeOutSec: number) => void;
  toggleClipMute: (id: ID) => void;
  groupSelectedClips: () => void;
  toggleClipLock: (id: ID) => void;
  setClipColorLabel: (id: ID, color: string) => void;
  reverseClip: (id: ID) => Promise<void>;
  normalizeClipAudio: (id: ID) => Promise<void>;
  bounceClip: (id: ID) => Promise<void>;
  consolidateSelection: () => Promise<void>;
  promoteTake: (clipId: ID) => void;
  setClipTakeLane: (clipId: ID, lane: number) => void;
  setClipCompRole: (clipId: ID, role: Clip["compRole"]) => void;
  detectClipTempo: (clipId: ID) => Promise<void>;
  setClipSourceBpm: (clipId: ID, bpm: number | null) => void;
  timeStretchClip: (clipId: ID, ratio: number) => Promise<void>;
  matchClipToProjectTempo: (clipId: ID) => Promise<void>;
  pitchShiftClip: (clipId: ID, semitones: number) => Promise<void>;
  deleteSelected: () => void;

  // Automation
  addAutomationLane: (target: AutomationTarget, trackId?: ID | null) => void;
  addAutomationPoint: (laneId: ID, timeSec: number, value: number) => void;
  moveAutomationPoint: (laneId: ID, pointId: ID, timeSec: number, value: number) => void;
  deleteAutomationPoint: (laneId: ID, pointId: ID) => void;
  toggleAutomationLane: (laneId: ID) => void;

  // Import
  importFiles: (files: FileList | File[], opts?: { asBeat?: boolean }) => Promise<void>;

  // Sample pads
  addPadFromFile: (file: File) => Promise<void>;
  triggerPad: (padId: ID) => void;
  removePad: (padId: ID) => void;
  setPadGain: (padId: ID, gain: number) => void;
  renamePad: (padId: ID, name: string) => void;
  setPadBankOpen: (open: boolean) => void;

  // MIDI
  addMidiClip: (trackId: ID, startSec: number) => void;
  openPianoRoll: (clipId: ID | null) => void;
  addNote: (clipId: ID, note: Omit<MidiNote, "id">) => void;
  deleteNote: (clipId: ID, noteId: ID) => void;
  moveNote: (clipId: ID, noteId: ID, startSec: number, pitch: number) => void;
  resizeNote: (clipId: ID, noteId: ID, durationSec: number) => void;
  setNoteVelocity: (clipId: ID, noteId: ID, velocity: number) => void;
  quantizeClip: (clipId: ID) => void;
  humanizeClip: (clipId: ID) => void;
  exportClipMidi: (clipId: ID) => Promise<void>;

  // Markers / sections
  addMarker: (kind: "marker" | "section") => void;
  deleteMarker: (id: ID) => void;
  renameMarker: (id: ID, name: string) => void;
  jumpToMarker: (id: ID) => void;

  // Loop / grid
  toggleLoop: () => void;
  setLoopRegion: (startSec: number, endSec: number) => void;
  clearLoop: () => void;
  setGridDivision: (beats: number) => void;

  // Undo
  undo: () => void;
  redo: () => void;

  // Master bus
  setMasterEffectEnabled: (key: EffectKey, enabled: boolean) => void;
  setMasterEffectParam: (key: EffectKey, param: string, value: number) => void;
  setMasterBypass: (bypass: boolean) => void;
  applyMasterPreset: (presetId: string) => void;
  clearMaster: () => void;

  // Loudness + auto master
  analyzeLoudnessNow: () => Promise<void>;
  dismissLoudnessReport: () => void;
  autoMaster: (target: LoudnessTarget) => Promise<void>;
  dismissMasterReport: () => void;

  // Export
  exportFullSong: () => Promise<void>;
  exportLoopRegion: () => Promise<void>;
  exportStems: () => Promise<void>;
  updateExportSettings: (patch: Partial<ExportSettings>) => void;
  cancelExport: () => void;

  // Reference A/B
  importReference: (file: File) => Promise<void>;
  removeReference: () => void;
  setReferenceGain: (gain: number) => void;
  setReferenceMode: (mode: "mix" | "ref") => void;

  // Preferences / app shell (Step 5)
  setPrefsOpen: (open: boolean) => void;
  setWizardOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setAccent: (accent: string) => void;
  setAutosaveInterval: (sec: number) => void;
  setAutoCheckUpdates: (on: boolean) => void;
  setReleaseChannel: (channel: ReleaseChannel) => void;
  setAutoDownloadUpdates: (on: boolean) => void;
  setInstallUpdatesOnClose: (on: boolean) => void;
  setLowCpuMode: (on: boolean) => void;
  setDisableVisualizers: (on: boolean) => void;
  setMetronomeEnabled: (on: boolean) => void;
  setCountInBars: (bars: number) => void;
  completeSetup: () => void;
  resetApp: () => Promise<void>;
  checkForUpdatesNow: () => Promise<void>;
  downloadUpdateNow: () => Promise<void>;
  installUpdateNow: () => Promise<void>;
  tapTempo: () => void;

  // Project management
  renameProjectById: (id: ID, name: string) => Promise<void>;
  duplicateProjectById: (id: ID) => Promise<void>;

  // Recovery
  recoverSession: () => Promise<void>;
  dismissRecovery: () => void;

  togglePlay: () => Promise<void>;
  play: () => Promise<void>;
  stop: () => void;
  seek: (sec: number) => void;
  toggleRecord: () => Promise<void>;

  setPixelsPerSecond: (pps: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  toggleSnap: () => void;

  refreshDevices: () => Promise<void>;
  selectDevice: (id: string) => Promise<void>;
  enableInput: () => Promise<void>;
  setInputGain: (g: number) => void;
  requestMonitor: (on: boolean) => void;
  confirmMonitor: () => void;
  cancelMonitor: () => void;
  setMicPanelOpen: (open: boolean) => void;

  saveNow: () => Promise<void>;
  markDirty: () => void;
  setStatus: (msg: string | null) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastCoalesceKey: string | null = null;
let lastCoalesceTime = 0;
let lastLiveDirectorFrameAt = 0;
let liveDirectorWorker: Worker | null = null;
let previousLiveRms = 0;
let previousLivePitchHz: number | null = null;

export const useStore = create<StoreState>((set, get) => {
  const applyAllTrackParams = () => {
    const { project } = get();
    const anySolo = project.tracks.some((t) => t.soloed);
    for (const t of project.tracks) {
      audioEngine.applyTrackParams(t.id, effectiveGain(t, anySolo, project.buses), t.pan);
    }
    audioEngine.setMasterGain(project.masterGain);
  };

  // Push every track's effect-chain settings into the live audio graph.
  const applyAllEffects = () => {
    for (const t of get().project.tracks) {
      audioEngine.applyEffects(t.id, t.effects);
    }
  };

  // Immutably patch one effect's params (avoids computed-key union typing pain).
  const patchEffect = (
    effects: EffectsState,
    key: EffectKey,
    patch: Record<string, unknown>
  ): EffectsState =>
    ({
      ...effects,
      [key]: { ...(effects[key] as unknown as Record<string, unknown>), ...patch },
    }) as EffectsState;

  // Route the wet monitor through whichever track is armed (else selected).
  const updateMonitorRoute = () => {
    const s = get();
    const target =
      s.project.tracks.find((t) => t.armed)?.id ??
      s.selectedTrackId ??
      s.project.tracks[0]?.id ??
      null;
    audioEngine.routeMonitorToTrack(target);
  };

  // Reconcile the live audio graph with the current project state (after
  // undo/redo, which can add/remove tracks and change every parameter).
  const applyMaster = () => {
    const m = get().project.master;
    audioEngine.setMasterChain(m.effects);
    audioEngine.setMasterBypass(m.bypass);
  };

  const reconcileEngine = () => {
    const p = get().project;
    audioEngine.syncTracks(p.tracks.map((t) => t.id));
    applyAllTrackParams();
    applyAllEffects();
    applyMaster();
    updateMonitorRoute();
    audioEngine.setLoop(p.loop.enabled, p.loop.startSec, p.loop.endSec);
  };

  // `coalesceKey` groups rapid edits (e.g. a knob drag) into one undo step.
  const touchProject = (
    mutator: (p: Project) => Project,
    coalesceKey?: string
  ) => {
    set((s) => {
      const now = Date.now();
      const coalesce =
        coalesceKey != null &&
        coalesceKey === lastCoalesceKey &&
        now - lastCoalesceTime < 700;
      lastCoalesceKey = coalesceKey ?? null;
      lastCoalesceTime = now;
      const past = coalesce ? s.past : [...s.past, s.project].slice(-100);
      const updated = mutator({ ...s.project });
      updated.updatedAt = now;
      return { project: updated, dirty: true, past, future: [] };
    });
    scheduleAutosave();
  };

  const scheduleAutosave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void get().saveNow();
    }, 1500);
  };

  const persistSettings = async (overrides?: Partial<AppSettings>) => {
    const s = get();
    const settings: AppSettings = {
      selectedDeviceId: s.selectedDeviceId,
      inputGain: s.inputGain,
      monitor: s.monitor,
      monitorMode: s.monitorMode,
      monitorWarningAcknowledged: s.monitorWarningAcknowledged,
      lastProjectId: s.project.id,
      accent: s.accent,
      autosaveIntervalSec: s.autosaveIntervalSec,
      autoCheckUpdates: s.autoCheckUpdates,
      releaseChannel: s.releaseChannel,
      autoDownloadUpdates: s.autoDownloadUpdates,
      installUpdatesOnClose: s.installUpdatesOnClose,
      lowCpuMode: s.lowCpuMode,
      disableVisualizers: s.disableVisualizers,
      metronomeEnabled: s.metronomeEnabled,
      countInBars: s.countInBars,
      setupComplete: s.setupComplete,
      sessionOpen: true,
      currentProfileId: s.currentProfileId,
      preferredOutputId: s.outputDeviceId,
      ...overrides,
    };
    await db.saveSettings(settings);
  };

  const applyAccent = (accent: string) => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--accent", accent);
  };

  // Throttled rolling backup for crash recovery.
  let lastBackupTime = 0;
  const maybeBackup = () => {
    const now = Date.now();
    if (now - lastBackupTime > 45000) {
      lastBackupTime = now;
      void db.saveBackup(get().project);
    }
  };

  // Encode a rendered AudioBuffer to a WAV blob, persist it, register it with
  // the engine, and return its new AudioAsset metadata. Shared by autotune,
  // vocal cleanup, and freeze/bounce.
  const registerRenderedAsset = async (buffer: AudioBuffer, name: string): Promise<AudioAsset> => {
    const assetId = uid();
    const wav = encodeWav(buffer);
    await db.saveBlob(assetId, get().project.id, wav);
    audioEngine.registerBuffer(assetId, buffer);
    mixToMono(assetId, buffer);
    return {
      id: assetId,
      name,
      mime: "audio/wav",
      durationSec: buffer.duration,
      sampleRate: buffer.sampleRate,
      numChannels: buffer.numberOfChannels,
      length: buffer.length,
      createdAt: Date.now(),
    };
  };

  // Render a clip's played region (offset..offset+duration) to a fresh buffer,
  // so destructive processors operate only on what's audible.
  const renderClipRegion = async (clip: Clip): Promise<AudioBuffer | null> => {
    const src = audioEngine.getBuffer(clip.assetId);
    if (!src) return null;
    const fs = src.sampleRate;
    const startSample = Math.floor(clip.offsetSec * fs);
    const lenSample = Math.max(1, Math.floor(clip.durationSec * fs));
    const numCh = src.numberOfChannels;
    const octx = new OfflineAudioContext(numCh, lenSample, fs);
    const out = octx.createBuffer(numCh, lenSample, fs);
    for (let c = 0; c < numCh; c++) {
      const sd = src.getChannelData(c);
      const od = out.getChannelData(c);
      for (let i = 0; i < lenSample; i++) od[i] = sd[startSample + i] || 0;
    }
    return out;
  };

  // Append an entry to the project's export history (no undo step).
  const recordExport = (kind: ExportEntry["kind"], name: string, target?: string) => {
    set((s) => ({
      project: {
        ...s.project,
        exportHistory: [
          { id: uid(), name, kind, target, when: Date.now() },
          ...(s.project.exportHistory ?? []),
        ].slice(0, 50),
      },
      dirty: true,
    }));
    scheduleAutosave();
  };

  const applyPeakNormalize = (buffer: AudioBuffer, peakTarget = 0.98): AudioBuffer => {
    let peak = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    }
    if (peak <= 0 || peak >= peakTarget) return buffer;
    const gain = peakTarget / peak;
    const out = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate)
      .createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = out.getChannelData(ch);
      for (let i = 0; i < src.length; i++) dst[i] = Math.max(-1, Math.min(1, src[i] * gain));
    }
    return out;
  };

  const exportBlobForSettings = (buffer: AudioBuffer, settings: ExportSettings) => {
    const finalBuffer = settings.normalizePeak ? applyPeakNormalize(buffer) : buffer;
    if (settings.format === "mp3") {
      return { blob: encodeMp3(finalBuffer, settings.mp3Kbps), ext: "mp3", label: `MP3 ${settings.mp3Kbps} kbps` };
    }
    return { blob: encodeWav(finalBuffer, { bitDepth: settings.wavBitDepth }), ext: "wav", label: `WAV ${settings.wavBitDepth}-bit` };
  };

  const recordSmartHistory = (
    title: string,
    detail: string,
    category: SmartHistoryEvent["category"]
  ) => {
    set((s) => ({
      project: {
        ...s.project,
        smartHistory: [
          { id: uid(), at: Date.now(), title, detail, category },
          ...(s.project.smartHistory ?? []),
        ].slice(0, 80),
      },
      dirty: true,
    }));
    scheduleAutosave();
  };

  const projectComplexityHealth = (reason = "manual"): PerformanceHealth => {
    const p = get().project;
    const perf = audioEngine.getPerfInfo();
    const liveEffectSlots = p.tracks.reduce(
      (sum, t) => sum + Object.values(t.effects).filter((e) => e.enabled).length,
      0
    );
    const clipLoad = p.clips.length * 2;
    const trackLoad = p.tracks.length * 5;
    const voiceLoad = perf.activeVoices * 1.5;
    const analyzerLoad = get().disableVisualizers ? 0 : get().lowCpuMode ? 18 : 34;
    const memoryLoad = p.assets.reduce((sum, a) => sum + a.length * a.numChannels, 0) / 48000 / 60;
    const cpuLoad = Math.min(100, liveEffectSlots * 3.5 + clipLoad + trackLoad + voiceLoad + analyzerLoad);
    const heavyTrackIds = p.tracks
      .filter((t) => {
        const trackClips = p.clips.filter((c) => c.trackId === t.id);
        const fx = Object.values(t.effects).filter((e) => e.enabled).length;
        return !t.frozen && (fx >= 4 || trackClips.length >= 8);
      })
      .map((t) => t.id);
    const suggestions: string[] = [];
    if (heavyTrackIds.length) suggestions.push("Freeze or bounce heavy live-FX tracks.");
    if (!get().lowCpuMode && cpuLoad > 70) suggestions.push("Enable Low-CPU mode to protect playback.");
    if (!get().disableVisualizers && (cpuLoad > 78 || reason === "analyzer")) suggestions.push("Throttle or disable visualizers while mixing.");
    if (memoryLoad > 90) suggestions.push("Run Cleanup to remove unused decoded assets.");
    if (p.clips.length > 60) suggestions.push("Consider bouncing edited sections into fewer clips.");
    const score = Math.max(0, Math.round(100 - cpuLoad * 0.55 - Math.max(0, memoryLoad - 30) * 0.18 - heavyTrackIds.length * 5));
    const risk: PerformanceHealth["risk"] =
      score < 35 || cpuLoad > 92 ? "emergency" :
      score < 58 || cpuLoad > 78 ? "high" :
      score < 76 || cpuLoad > 58 ? "medium" :
      "low";
    return {
      score,
      risk,
      cpuLoad: Math.round(cpuLoad),
      memoryLoad: Math.round(memoryLoad),
      activeVoices: perf.activeVoices,
      liveEffectSlots,
      analyzerLoad,
      heavyTrackIds,
      suggestions: suggestions.length ? suggestions : ["Project is healthy. Keep autosave on and freeze tracks if it grows."],
      checkedAt: Date.now(),
    };
  };

  const ensureLiveDirectorWorker = () => {
    if (liveDirectorWorker || typeof Worker === "undefined") return liveDirectorWorker;
    try {
      liveDirectorWorker = new Worker(new URL("../workers/liveVocalDirector.worker.ts", import.meta.url), { type: "module" });
      liveDirectorWorker.onmessage = (event: MessageEvent<{ id: string; result: LiveVocalFrameResult; frameTimeSec?: number }>) => {
        get().ingestLiveDirectorResult(event.data.result, event.data.frameTimeSec ?? get().positionSec);
      };
      liveDirectorWorker.onerror = () => {
        liveDirectorWorker?.terminate();
        liveDirectorWorker = null;
        touchProject((p) => ({
          ...p,
          liveVocalDirector: { ...normalizeLiveVocalDirector(p.liveVocalDirector), workerLive: false },
        }));
      };
      return liveDirectorWorker;
    } catch {
      liveDirectorWorker = null;
      return null;
    }
  };

  return {
    project: createEmptyProject(),
    projectList: [],
    selectedTrackId: null,
    selectedClipId: null,
    playing: false,
    recording: false,
    positionSec: 0,
    pixelsPerSecond: 60,
    snapSec: 0.25,
    snapEnabled: true,
    gridDivision: 1,
    past: [],
    future: [],
    editingMidiClipId: null,
    padBankOpen: false,
    devices: [],
    selectedDeviceId: null,
    permission: "unknown",
    inputGain: 1,
    monitor: false,
    monitorMode: "dry",
    monitorWarningAcknowledged: false,
    inputLevel: 0,
    meters: { master: { l: 0, r: 0 }, tracks: {}, reduction: {}, masterReduction: { comp: 0, limiter: 0 } },
    view: "dashboard",
    micPanelOpen: false,
    showMonitorWarning: false,
    saving: false,
    lastSaved: null,
    dirty: false,
    statusMessage: null,
    enhanceReport: null,
    loudnessReport: null,
    masterReport: null,
    analyzing: false,
    exporting: false,
    exportProgress: null,
    referenceMode: "mix",
    exportSettings: defaultExportSettings(),
    prefsOpen: false,
    wizardOpen: false,
    helpOpen: false,
    accent: "124 92 255",
    autosaveIntervalSec: 20,
    autoCheckUpdates: false,
    releaseChannel: "stable",
    autoDownloadUpdates: false,
    installUpdatesOnClose: false,
    lowCpuMode: false,
    disableVisualizers: false,
    metronomeEnabled: false,
    countInBars: 0,
    setupComplete: false,
    updateStatus: null,
    updateInfo: null,
    checkingUpdate: false,
    recoveryPrompt: null,
    profiles: [],
    currentProfileId: null,
    presets: [],
    audioSetupOpen: false,
    builderOpen: false,
    coachOpen: false,
    libraryOpen: false,
    beatBrowserOpen: false,
    outputDeviceId: null,
    outputDevices: [],
    tuneKey: 0,
    tuneScale: "major",
    tuneStrength: 0.8,
    tuneSpeed: 0.6,
    tuneHumanize: 0.2,
    tuneFormant: true,
    pitchLane: null,
    processing: false,
    mixReports: null,
    studioIntelligenceReport: null,
    studioIntelligenceBusy: false,
    performanceHealth: null,
    studioMode: false,
    liveSessionMode: false,
    coachResult: null,
    cleanOpts: {
      noiseReduction: 0.6,
      gate: true,
      breath: 0.5,
      declick: true,
      deEss: 0.5,
      harshness: 0.4,
      mud: 0.4,
      resonance: 0.3,
    },

    init: async () => {
      await bootLog("store init start");
      // Wire engine meter + position callbacks once.
      audioEngine.onMeter((m) => {
        set({
          meters: {
            master: m.master,
            tracks: m.tracks,
            reduction: m.reduction,
            masterReduction: m.masterReduction,
          },
          inputLevel: m.input,
        });
        const s = get();
        if (s.recording && s.project.liveVocalDirector?.enabled) s.processLiveDirectorFrame();
      });
      audioEngine.onPosition((sec) => set({ positionSec: sec }));
      audioEngine.onEnded(() => {
        set({ playing: false });
      });
      // Loop: jump the playhead back to the loop start and replay.
      audioEngine.onLoop(() => {
        const loop = get().project.loop;
        set({ positionSec: loop.startSec });
        void get().play();
      });
      // Microphone unplugged / lost mid-session.
      audioEngine.onInputEnded(() => {
        audioEngine.closeInput();
        set({
          permission: "prompt",
          monitor: false,
          statusMessage: "Microphone disconnected. Reconnect it in Audio Setup.",
        });
      });

      // Device hot-plug: refresh lists, warn if the selected mic vanished, and
      // auto-reconnect when a previously-selected device returns.
      if (typeof navigator !== "undefined" && navigator.mediaDevices) {
        navigator.mediaDevices.addEventListener?.("devicechange", () => {
          void (async () => {
            await get().refreshDevices();
            await get().refreshOutputDevices();
            const s = get();
            const wantId = s.selectedDeviceId;
            if (!wantId) return;
            const present = s.devices.some((d) => d.deviceId === wantId);
            if (!present && audioEngine.hasInput()) {
              set({ statusMessage: "Selected microphone disappeared — choose another in Audio Setup." });
            } else if (present && !audioEngine.hasInput() && s.permission === "granted") {
              // Came back: silently reconnect.
              try {
                await audioEngine.openInput(wantId, s.inputGain);
                set({ statusMessage: "Microphone reconnected." });
              } catch {
                /* ignore */
              }
            }
          })();
        });
      }

      const settings = await db.loadSettings();
      await bootLog("project DB init ok");
      let crashedId: ID | null = null;
      // Crash heartbeat lives in localStorage (synchronous, survives beforeunload).
      const hadOpenSession =
        typeof localStorage !== "undefined" &&
        localStorage.getItem("panther.sessionOpen") === "true";
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("panther.sessionOpen", "true");
      }
      if (settings) {
        await bootLog("settings loaded");
        if (hadOpenSession && settings.lastProjectId) crashedId = settings.lastProjectId;

        set({
          selectedDeviceId: settings.selectedDeviceId,
          inputGain: settings.inputGain ?? 1,
          monitor: false, // never auto-enable monitoring (feedback safety)
          monitorMode: settings.monitorMode ?? "dry",
          monitorWarningAcknowledged: settings.monitorWarningAcknowledged ?? false,
          accent: settings.accent ?? "124 92 255",
          autosaveIntervalSec: settings.autosaveIntervalSec ?? 20,
          autoCheckUpdates: settings.autoCheckUpdates ?? false,
          releaseChannel: settings.releaseChannel ?? "stable",
          autoDownloadUpdates: settings.autoDownloadUpdates ?? false,
          installUpdatesOnClose: settings.installUpdatesOnClose ?? false,
          lowCpuMode: settings.lowCpuMode ?? false,
          disableVisualizers: settings.disableVisualizers ?? false,
          metronomeEnabled: settings.metronomeEnabled ?? false,
          countInBars: settings.countInBars ?? 0,
          setupComplete: settings.setupComplete ?? false,
        });
        audioEngine.setMonitorMode(settings.monitorMode ?? "dry");
        audioEngine.setLowCpu(settings.lowCpuMode ?? false);
        applyAccent(settings.accent ?? "124 92 255");
      } else {
        await bootLog("no settings found");
        applyAccent("124 92 255");
      }

      // Load local profiles and restore the active one.
      const profiles = await db.listProfiles();
      const savedProfileId = settings?.currentProfileId ?? null;
      const activeProfile = profiles.find((p) => p.id === savedProfileId) ?? null;
      set({
        profiles,
        currentProfileId: activeProfile?.id ?? null,
        outputDeviceId: settings?.preferredOutputId ?? null,
      });
      if (activeProfile) {
        set({ accent: activeProfile.accent || get().accent, inputGain: activeProfile.inputGain ?? get().inputGain });
        applyAccent(activeProfile.accent || settings?.accent || "124 92 255");
        await get().refreshPresets();
      }

      // Mark this session open (heartbeat for crash detection).
      await persistSettings({ sessionOpen: true });

      // First run with a profile selected → show the setup wizard.
      if (activeProfile && (!settings || settings.setupComplete !== true)) {
        set({ wizardOpen: true });
      }

      await get().refreshProjectList();

      // No profile selected yet → stay on the dashboard (profile gate handles it).
      if (!activeProfile) {
        set({ selectedTrackId: get().project.tracks[0]?.id ?? null });
        return;
      }

      // Storage-low warning (if the browser/runtime reports a quota).
      void db.estimateStorage().then((est) => {
        if (est && est.quota > 0 && est.usage / est.quota > 0.9) {
          set({ statusMessage: "Storage is nearly full — export and delete old projects to free space." });
        }
      });

      // Crash recovery: offer to reopen the project that was open when we crashed.
      if (crashedId) {
        const crashedProj = await db.loadProject(crashedId);
        const backup = await db.latestBackup(crashedId);
        if (crashedProj || backup) {
          const name = crashedProj?.name ?? backup?.project.name ?? "Recovered project";
          set({ recoveryPrompt: { projectId: crashedId, name, when: backup?.createdAt ?? Date.now() } });
          set({ selectedTrackId: get().project.tracks[0]?.id ?? null });
          return; // let the user choose before auto-opening
        }
      }

      // Restore last project if present.
      if (settings?.lastProjectId) {
        const existing = await db.loadProject(settings.lastProjectId);
        if (existing) {
          await get().openProject(existing.id);
          return;
        }
      }
      // Else start on the dashboard with a fresh in-memory project.
      set({ selectedTrackId: get().project.tracks[0]?.id ?? null });
    },

    refreshProjectList: async () => {
      const list = await db.listProjects(get().currentProfileId);
      set({ projectList: list });
    },

    newProject: async (name) => {
      const p = createEmptyProject(name, get().currentProfileId);
      await db.saveProject(p);
      set({
        project: p,
        selectedTrackId: p.tracks[0]?.id ?? null,
        selectedClipId: null,
        positionSec: 0,
        view: "studio",
        lastSaved: Date.now(),
        dirty: false,
        past: [],
        future: [],
        exportSettings: normalizeExportSettings(p.exportSettings),
        studioIntelligenceReport: p.studioIntelligence?.current ?? null,
      });
      // Reset engine track nodes for the new project.
      await audioEngine.ensure();
      audioEngine.syncTracks(p.tracks.map((t) => t.id));
      applyAllTrackParams();
      applyAllEffects();
      applyMaster();
      updateMonitorRoute();
      audioEngine.setLoop(p.loop.enabled, p.loop.startSec, p.loop.endSec);
      await persistSettings();
      await get().refreshProjectList();
    },

    openProject: async (id) => {
      let p: Project;
      try {
        const loaded = await db.loadProject(id);
        if (!loaded) {
          set({ statusMessage: "Project not found." });
          return;
        }
        const migrated = migrateProjectForOpen(loaded);
        p = normalizeProject(migrated.project);
        if (migrated.migrations.length) {
          await db.saveProject(p);
          set({ statusMessage: `Project migrated ${migrated.fromVersion}->${migrated.toVersion}.` });
        }
      } catch (e) {
        // Corruption fallback: restore from the most recent backup snapshot.
        const backup = await db.latestBackup(id);
        if (!backup) {
          set({ statusMessage: "Could not open project (corrupted, no backup): " + String(e) });
          return;
        }
        const migrated = migrateProjectForOpen(backup.project);
        p = normalizeProject(migrated.project);
        await db.saveProject(p);
        set({ statusMessage: "Project was corrupted — restored from backup." });
      }
      set({ statusMessage: "Loading project…" });
      await audioEngine.ensure();

      // Hydrate audio buffers from stored blobs.
      for (const asset of p.assets) {
        if (audioEngine.hasBuffer(asset.id)) continue;
        const blob = await db.loadBlob(asset.id);
        if (!blob) continue;
        try {
          const buffer = await audioEngine.decodeBlob(blob);
          audioEngine.registerBuffer(asset.id, buffer);
          mixToMono(asset.id, buffer);
        } catch {
          /* skip undecodable asset */
        }
      }
      // Hydrate the reference track blob (not part of p.assets).
      if (p.reference && !audioEngine.hasBuffer(p.reference.assetId)) {
        const rblob = await db.loadBlob(p.reference.assetId);
        if (rblob) {
          try {
            audioEngine.registerBuffer(p.reference.assetId, await audioEngine.decodeBlob(rblob));
          } catch {
            /* ignore */
          }
        }
      }

      set({
        project: p,
        selectedTrackId: p.tracks[0]?.id ?? null,
        selectedClipId: null,
        positionSec: 0,
        referenceMode: "mix",
        view: "studio",
        lastSaved: p.updatedAt,
        dirty: false,
        statusMessage: null,
        past: [],
        future: [],
        exportSettings: normalizeExportSettings(p.exportSettings),
        studioIntelligenceReport: p.studioIntelligence?.current ?? null,
      });
      applyAllTrackParams();
      applyAllEffects();
      applyMaster();
      updateMonitorRoute();
      audioEngine.setLoop(p.loop.enabled, p.loop.startSec, p.loop.endSec);
      await persistSettings();
    },

    deleteProject: async (id) => {
      await db.deleteProject(id);
      await get().refreshProjectList();
      if (get().project.id === id) {
        const next = createEmptyProject();
        set({ project: next, selectedTrackId: next.tracks[0]?.id ?? null, view: "dashboard" });
      }
    },

    renameProject: (name) => touchProject((p) => ({ ...p, name })),
    setView: (v) => set({ view: v }),

    setMasterGain: (g) => {
      // In reference mode the mix output is muted; just store the value.
      if (get().referenceMode === "mix") audioEngine.setMasterGain(g);
      touchProject((p) => ({ ...p, masterGain: g }), "mastergain");
    },
    setTempo: (t) => {
      touchProject((p) => ({ ...p, tempo: t }));
      set({ snapSec: (60 / t) * get().gridDivision });
      audioEngine.setMetronome(get().metronomeEnabled, t);
    },

    addTrack: (opts) => {
      const { project } = get();
      const track = newTrack(project.tracks.length);
      if (opts?.name) track.name = opts.name;
      if (opts?.instrument) track.instrument = opts.instrument;
      if (opts?.busId !== undefined) track.busId = opts.busId;
      touchProject((p) => ({ ...p, tracks: [...p.tracks, track] }));
      set({ selectedTrackId: track.id });
      audioEngine.ensureTrack(track.id);
      audioEngine.applyEffects(track.id, track.effects);
      applyAllTrackParams();
      return track.id;
    },

    setTrackInstrument: (id, instrument) =>
      touchProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === id ? { ...t, instrument } : t)),
      })),

    setTrackBus: (id, busId) => {
      touchProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === id ? { ...t, busId } : t)),
      }));
      applyAllTrackParams();
    },

    setTrackSend: (trackId, busId, gain, pre) => {
      touchProject(
        (p) => ({
          ...p,
          tracks: p.tracks.map((t) =>
            t.id === trackId
              ? {
                  ...t,
                  sends: {
                    ...(t.sends ?? {}),
                    [busId]: {
                      gain: Math.max(0, Math.min(1.5, gain)),
                      pre: pre ?? t.sends?.[busId]?.pre ?? false,
                    },
                  },
                }
              : t
          ),
        }),
        `send:${trackId}:${busId}`
      );
    },

    setBusGain: (busId, gain) => {
      touchProject(
        (p) => ({
          ...p,
          buses: (p.buses ?? []).map((b) => (b.id === busId ? { ...b, gain } : b)),
        }),
        `busgain:${busId}`
      );
      applyAllTrackParams();
    },

    toggleBusMute: (busId) => {
      touchProject((p) => ({
        ...p,
        buses: (p.buses ?? []).map((b) => (b.id === busId ? { ...b, muted: !b.muted } : b)),
      }));
      applyAllTrackParams();
    },

    setBusReturnGain: (busId, gain) => {
      touchProject(
        (p) => ({
          ...p,
          buses: (p.buses ?? []).map((b) => (b.id === busId ? { ...b, returnGain: Math.max(0, Math.min(1.5, gain)) } : b)),
        }),
        `busreturn:${busId}`
      );
      applyAllTrackParams();
    },

    toggleBusPreFader: (busId) => {
      touchProject((p) => ({
        ...p,
        buses: (p.buses ?? []).map((b) => (b.id === busId ? { ...b, preFader: !b.preFader } : b)),
      }));
    },

    setLyrics: (text) => touchProject((p) => ({ ...p, lyrics: text }), "lyrics"),
    setLyricSection: (section) => {
      touchProject((p) => ({
        ...p,
        lyricStudio: { ...normalizeLyricStudio(p.lyricStudio, p.lyrics ?? ""), activeSection: section, updatedAt: Date.now() },
      }), "lyric-section");
    },
    addLyricLine: (section, text = "") => {
      const id = uid();
      touchProject((p) => {
        const studio = normalizeLyricStudio(p.lyricStudio, p.lyrics ?? "");
        const targetSection = section ?? studio.activeSection;
        const order = studio.lines.filter((line) => line.section === targetSection).length;
        const line = normalizeLyricLine({ id, section: targetSection, text, order }, order);
        const nextLines = [...studio.lines, line];
        return {
          ...p,
          lyrics: nextLines.map((l) => l.text).filter(Boolean).join("\n"),
          lyricStudio: { ...studio, lines: nextLines, activeSection: targetSection, updatedAt: Date.now() },
        };
      }, "lyric-add");
      return id;
    },
    updateLyricLine: (lineId, patch) => {
      touchProject((p) => {
        const studio = normalizeLyricStudio(p.lyricStudio, p.lyrics ?? "");
        const lines = studio.lines.map((line) =>
          line.id === lineId
            ? normalizeLyricLine({ ...line, ...patch, performance: { ...line.performance, ...(patch.performance ?? {}) }, updatedAt: Date.now() }, line.order)
            : line
        );
        return {
          ...p,
          lyrics: lines.map((line) => line.text).filter(Boolean).join("\n"),
          lyricStudio: { ...studio, lines, updatedAt: Date.now() },
        };
      }, `lyric-line:${lineId}`);
    },
    deleteLyricLine: (lineId) => {
      touchProject((p) => {
        const studio = normalizeLyricStudio(p.lyricStudio, p.lyrics ?? "");
        const lines = studio.lines.filter((line) => line.id !== lineId).map((line, order) => ({ ...line, order }));
        return {
          ...p,
          lyrics: lines.map((line) => line.text).filter(Boolean).join("\n"),
          lyricStudio: { ...studio, lines, updatedAt: Date.now() },
        };
      });
    },
    attachLyricLineToSelection: (lineId) => {
      const selectedClip = get().selectedClipId ? get().project.clips.find((clip) => clip.id === get().selectedClipId) : null;
      const time = get().positionSec;
      touchProject((p) => {
        const studio = normalizeLyricStudio(p.lyricStudio, p.lyrics ?? "");
        return {
          ...p,
          lyricStudio: {
            ...studio,
            lines: studio.lines.map((line) => line.id === lineId ? {
              ...line,
              clipId: selectedClip?.id ?? line.clipId ?? null,
              timeSec: time,
              regionStartSec: selectedClip?.startSec ?? p.loop.startSec,
              regionEndSec: selectedClip ? selectedClip.startSec + selectedClip.durationSec : p.loop.enabled ? p.loop.endSec : time + (60 / Math.max(40, p.tempo)) * 4,
              updatedAt: Date.now(),
            } : line),
            updatedAt: Date.now(),
          },
        };
      }, `lyric-attach:${lineId}`);
      set({ statusMessage: selectedClip ? "Lyric line attached to selected vocal clip." : "Lyric line attached to current timeline position." });
    },
    moveLyricLineToBank: (lineId, bank) => {
      touchProject((p) => {
        const studio = normalizeLyricStudio(p.lyricStudio, p.lyrics ?? "");
        const line = studio.lines.find((l) => l.id === lineId);
        if (!line) return p;
        const lines = studio.lines.filter((l) => l.id !== lineId).map((l, order) => ({ ...l, order }));
        return {
          ...p,
          lyrics: lines.map((l) => l.text).filter(Boolean).join("\n"),
          lyricStudio: {
            ...studio,
            lines,
            hookIdeas: bank === "hook" ? [line.text, ...studio.hookIdeas].slice(0, 80) : studio.hookIdeas,
            unusedLines: bank === "unused" ? [line.text, ...studio.unusedLines].slice(0, 120) : studio.unusedLines,
            updatedAt: Date.now(),
          },
        };
      });
    },
    addHookIdea: (text) => {
      const clean = text.trim();
      if (!clean) return;
      touchProject((p) => {
        const studio = normalizeLyricStudio(p.lyricStudio, p.lyrics ?? "");
        return { ...p, lyricStudio: { ...studio, hookIdeas: [clean, ...studio.hookIdeas].slice(0, 80), updatedAt: Date.now() } };
      }, "hook-idea");
    },
    addUnusedLyricLine: (text) => {
      const clean = text.trim();
      if (!clean) return;
      touchProject((p) => {
        const studio = normalizeLyricStudio(p.lyricStudio, p.lyrics ?? "");
        return { ...p, lyricStudio: { ...studio, unusedLines: [clean, ...studio.unusedLines].slice(0, 120), updatedAt: Date.now() } };
      }, "unused-lyric");
    },
    updateLyricConcept: (text) => {
      touchProject((p) => {
        const studio = normalizeLyricStudio(p.lyricStudio, p.lyrics ?? "");
        return { ...p, lyricStudio: { ...studio, conceptNotes: text, updatedAt: Date.now() } };
      }, "lyric-concept");
    },
    runLyricCoach: () => {
      touchProject((p) => {
        const team = normalizeProducerTeam(p.producerTeam);
        const generated = createLyricProducerNotes(p).filter((note) => !team.dismissedIds.includes(note.id));
        return {
          ...p,
          producerTeam: {
            ...team,
            notes: [
              ...generated,
              ...team.notes.filter((note) => note.status === "saved" || note.status === "applied"),
            ].slice(0, 40),
            updatedAt: Date.now(),
          },
        };
      }, "lyric-coach");
      set({ statusMessage: "Lyric Coach scanned lines for density, hook strength, breaths, doubles, ad-libs, and punch-ins." });
    },
    applyProducerTeamNote: (noteId) => {
      touchProject((p) => {
        const team = normalizeProducerTeam(p.producerTeam);
        const note = team.notes.find((n) => n.id === noteId);
        if (!note) return p;
        const studio = normalizeLyricStudio(p.lyricStudio, p.lyrics ?? "");
        const mark = (line: LyricLine): LyricLine => {
          if (line.id !== note.lineId) return line;
          const performance = { ...line.performance };
          if (note.action === "mark-punch") performance.punchIn = true;
          if (note.action === "mark-adlib") performance.adlib = true;
          if (note.action === "mark-double") performance.double = true;
          if (note.action === "mark-breath") performance.breathAfter = true;
          return { ...line, performance, updatedAt: Date.now() };
        };
        return {
          ...p,
          lyricStudio: { ...studio, lines: studio.lines.map(mark), updatedAt: Date.now() },
          producerTeam: {
            ...team,
            notes: team.notes.map((n) => n.id === noteId ? { ...n, status: "applied" } : n),
            updatedAt: Date.now(),
          },
          studioIntelligence: {
            current: p.studioIntelligence?.current ?? null,
            history: p.studioIntelligence?.history ?? [],
            memory: applyMemoryEvent(p.studioIntelligence?.memory, { kind: "accepted", key: `team:${note.role}:${note.action ?? "note"}` }),
          },
        };
      }, `team-apply:${noteId}`);
      set({ statusMessage: "Producer Team note applied." });
    },
    dismissProducerTeamNote: (noteId) => {
      touchProject((p) => {
        const team = normalizeProducerTeam(p.producerTeam);
        const note = team.notes.find((n) => n.id === noteId);
        return {
          ...p,
          producerTeam: {
            ...team,
            notes: team.notes.map((n) => n.id === noteId ? { ...n, status: "dismissed" } : n),
            dismissedIds: [...new Set([...team.dismissedIds, noteId])],
            updatedAt: Date.now(),
          },
          studioIntelligence: note ? {
            current: p.studioIntelligence?.current ?? null,
            history: p.studioIntelligence?.history ?? [],
            memory: applyMemoryEvent(p.studioIntelligence?.memory, { kind: "rejected", key: `team:${note.role}:${note.action ?? "note"}` }),
          } : p.studioIntelligence,
        };
      });
      set({ statusMessage: "Producer Team note dismissed and learned locally." });
    },
    saveProducerTeamNote: (noteId) => {
      const note = get().project.producerTeam?.notes.find((n) => n.id === noteId);
      if (note) get().addIdeaToNotes(`${note.role.toUpperCase()}: ${note.title} - ${note.detail} Why: ${note.why}`);
      touchProject((p) => {
        const team = normalizeProducerTeam(p.producerTeam);
        return {
          ...p,
          producerTeam: {
            ...team,
            notes: team.notes.map((n) => n.id === noteId ? { ...n, status: "saved" } : n),
            savedIds: [...new Set([...team.savedIds, noteId])],
            updatedAt: Date.now(),
          },
        };
      });
    },
    setStereoWidth: (w) => touchProject((p) => ({ ...p, stereoWidth: w }), "stereowidth"),
    setMonoBelow: (hz) => touchProject((p) => ({ ...p, monoBelowHz: hz }), "monobelow"),

    deleteTrack: (id) => {
      touchProject((p) => ({
        ...p,
        tracks: p.tracks.filter((t) => t.id !== id),
        clips: p.clips.filter((c) => c.trackId !== id),
      }));
      audioEngine.removeTrack(id);
      const first = get().project.tracks[0]?.id ?? null;
      if (get().selectedTrackId === id) set({ selectedTrackId: first });
    },

    renameTrack: (id, name) =>
      touchProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === id ? { ...t, name } : t)),
      })),

    setTrackColor: (id, hex) =>
      touchProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === id ? { ...t, color: hex } : t)),
      })),

    setTrackGain: (id, gain) => {
      touchProject(
        (p) => ({
          ...p,
          tracks: p.tracks.map((t) => (t.id === id ? { ...t, gain } : t)),
        }),
        `trackgain:${id}`
      );
      applyAllTrackParams();
    },

    setTrackPan: (id, pan) => {
      touchProject(
        (p) => ({
          ...p,
          tracks: p.tracks.map((t) => (t.id === id ? { ...t, pan } : t)),
        }),
        `trackpan:${id}`
      );
      applyAllTrackParams();
    },

    toggleMute: (id) => {
      touchProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === id ? { ...t, muted: !t.muted } : t)),
      }));
      applyAllTrackParams();
    },

    toggleSolo: (id) => {
      touchProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === id ? { ...t, soloed: !t.soloed } : t)),
      }));
      applyAllTrackParams();
    },

    toggleArm: (id) => {
      touchProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === id ? { ...t, armed: !t.armed } : t)),
      }));
      updateMonitorRoute();
    },

    setTrackMonitor: (id, on) =>
      touchProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === id ? { ...t, monitor: on } : t)),
      })),

    selectTrack: (id) => {
      set({ selectedTrackId: id });
      updateMonitorRoute();
    },
    selectClip: (id) => set({ selectedClipId: id }),

    // ---- Effects ----
    setEffectEnabled: (trackId, key, enabled) => {
      touchProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) =>
          t.id === trackId ? { ...t, effects: patchEffect(t.effects, key, { enabled }) } : t
        ),
      }));
      const t = get().project.tracks.find((x) => x.id === trackId);
      if (t) audioEngine.applyEffects(trackId, t.effects);
    },

    setEffectParam: (trackId, key, param, value) => {
      touchProject(
        (p) => ({
          ...p,
          tracks: p.tracks.map((t) =>
            t.id === trackId
              ? { ...t, effects: patchEffect(t.effects, key, { [param]: value }) }
              : t
          ),
        }),
        `fx:${trackId}:${key}:${param}`
      );
      const t = get().project.tracks.find((x) => x.id === trackId);
      if (t) audioEngine.applyEffects(trackId, t.effects);
    },

    applyPreset: (trackId, presetId) => {
      const preset = getPreset(presetId);
      if (!preset) return;
      const effects = preset.build();
      touchProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) =>
          t.id === trackId ? { ...t, effects, presetName: preset.name } : t
        ),
      }));
      audioEngine.applyEffects(trackId, effects);
      set({ statusMessage: `Applied preset: ${preset.name}` });
    },

    clearEffects: (trackId) => {
      const effects = defaultEffects();
      touchProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) =>
          t.id === trackId ? { ...t, effects, presetName: undefined } : t
        ),
      }));
      audioEngine.applyEffects(trackId, effects);
      set({ statusMessage: "Effects reset to neutral." });
    },

    autoEnhance: (trackId) => {
      const s = get();
      const track = s.project.tracks.find((t) => t.id === trackId);
      if (!track) return;
      // Prefer the selected clip if it's on this track, else the track's last clip.
      let clip = s.project.clips.find(
        (c) => c.id === s.selectedClipId && c.trackId === trackId
      );
      if (!clip) {
        const onTrack = s.project.clips.filter((c) => c.trackId === trackId);
        clip = onTrack[onTrack.length - 1];
      }
      if (!clip) {
        set({ statusMessage: "Record or select a clip on this track first." });
        return;
      }
      const buffer = audioEngine.getBuffer(clip.assetId);
      if (!buffer) {
        set({ statusMessage: "Audio for this clip is still loading." });
        return;
      }
      const analysis = analyzeBuffer(buffer);
      const { effects, trackGain, changes } = deriveEnhancement(analysis, track.gain);
      touchProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) =>
          t.id === trackId
            ? { ...t, effects, gain: trackGain, presetName: "Auto Enhance" }
            : t
        ),
      }));
      audioEngine.applyEffects(trackId, effects);
      applyAllTrackParams();
      set({
        statusMessage: "Auto Vocal Enhance applied.",
        enhanceReport: {
          trackId,
          trackName: track.name,
          changes,
          analysis,
        },
      });
    },

    dismissEnhanceReport: () => set({ enhanceReport: null }),

    setMonitorMode: (mode) => {
      audioEngine.setMonitorMode(mode);
      set({ monitorMode: mode });
      void persistSettings();
    },

    moveClip: (id, startSec) => {
      const current = get().project.clips.find((c) => c.id === id);
      if (current?.locked) {
        set({ statusMessage: "Clip is locked." });
        return;
      }
      const snapped = get().snapEnabled
        ? Math.round(startSec / get().snapSec) * get().snapSec
        : startSec;
      touchProject(
        (p) => ({
          ...p,
          clips: p.clips.map((c) =>
            c.id === id ? { ...c, startSec: Math.max(0, snapped) } : c
          ),
        }),
        `move:${id}`
      );
    },

    moveClipToTrack: (id, trackId, startSec) => {
      const snapped = get().snapEnabled
        ? Math.round(startSec / get().snapSec) * get().snapSec
        : startSec;
      touchProject((p) => ({
        ...p,
        clips: p.clips.map((c) =>
          c.id === id ? { ...c, trackId, startSec: Math.max(0, snapped) } : c
        ),
      }));
    },

    deleteClip: (id) => {
      const clip = get().project.clips.find((c) => c.id === id);
      if (clip?.locked) {
        set({ statusMessage: "Unlock the clip before deleting it." });
        return;
      }
      touchProject((p) => {
        const clips = p.clips.filter((c) => c.id !== id);
        // Drop the asset if no remaining clip references it.
        const stillUsed = clip
          ? clips.some((c) => c.assetId === clip.assetId)
          : true;
        const assets = stillUsed
          ? p.assets
          : p.assets.filter((a) => a.id !== clip!.assetId);
        return { ...p, clips, assets };
      });
      if (clip) {
        const stillUsed = get().project.clips.some((c) => c.assetId === clip.assetId);
        if (!stillUsed) {
          dropMono(clip.assetId);
          void db.deleteBlob(clip.assetId);
        }
      }
      if (get().selectedClipId === id) set({ selectedClipId: null });
    },

    renameClip: (id, name) =>
      touchProject((p) => ({
        ...p,
        clips: p.clips.map((c) => (c.id === id ? { ...c, name } : c)),
      })),

    // Trim the start: move startSec and offsetSec together so audio stays put.
    trimClipStart: (id, newStartSec) => {
      if (get().project.clips.find((c) => c.id === id)?.locked) {
        set({ statusMessage: "Clip is locked." });
        return;
      }
      touchProject(
        (p) => ({
          ...p,
          clips: p.clips.map((c) => {
            if (c.id !== id) return c;
            const clipEnd = c.startSec + c.durationSec;
            const ns = Math.max(0, Math.min(newStartSec, clipEnd - 0.02));
            const delta = ns - c.startSec;
            const newOffset = Math.max(0, c.offsetSec + delta);
            return {
              ...c,
              startSec: ns,
              offsetSec: c.kind === "midi" ? c.offsetSec : newOffset,
              durationSec: Math.max(0.02, c.durationSec - delta),
            };
          }),
        }),
        `trimL:${id}`
      );
    },

    trimClipEnd: (id, newEndSec) => {
      if (get().project.clips.find((c) => c.id === id)?.locked) {
        set({ statusMessage: "Clip is locked." });
        return;
      }
      touchProject(
        (p) => ({
          ...p,
          clips: p.clips.map((c) => {
            if (c.id !== id) return c;
            const minEnd = c.startSec + 0.02;
            let end = Math.max(minEnd, newEndSec);
            // For audio, don't extend past the source material.
            if (c.kind === "audio") {
              const asset = p.assets.find((a) => a.id === c.assetId);
              if (asset) {
                const maxDur = asset.durationSec - c.offsetSec;
                end = Math.min(end, c.startSec + maxDur);
              }
            }
            return { ...c, durationSec: Math.max(0.02, end - c.startSec) };
          }),
        }),
        `trimR:${id}`
      );
    },

    splitClipAtPlayhead: () => {
      const { project, positionSec, selectedClipId } = get();
      const pos = positionSec;
      // Split the selected clip if the playhead is inside it, else any clip under it.
      const target =
        project.clips.find(
          (c) => c.id === selectedClipId && pos > c.startSec && pos < c.startSec + c.durationSec
        ) ??
        project.clips.find((c) => pos > c.startSec && pos < c.startSec + c.durationSec);
      if (!target) {
        set({ statusMessage: "Place the playhead over a clip to split." });
        return;
      }
      const leftDur = pos - target.startSec;
      const rightDur = target.durationSec - leftDur;
      const rightId = uid();
      touchProject((p) => {
        const left: Clip = { ...target, durationSec: leftDur, fadeOutSec: 0 };
        const right: Clip = {
          ...target,
          id: rightId,
          startSec: pos,
          offsetSec: target.kind === "midi" ? target.offsetSec : target.offsetSec + leftDur,
          durationSec: rightDur,
          fadeInSec: 0,
          notes:
            target.kind === "midi"
              ? (target.notes ?? [])
                  .filter((n) => n.startSec >= leftDur)
                  .map((n) => ({ ...n, id: uid(), startSec: n.startSec - leftDur }))
              : undefined,
          name: target.name + " ·B",
        };
        // Trim left MIDI notes to its new length.
        if (left.kind === "midi") {
          left.notes = (target.notes ?? []).filter((n) => n.startSec < leftDur);
        }
        const clips = p.clips.flatMap((c) => (c.id === target.id ? [left, right] : [c]));
        return { ...p, clips };
      });
      set({ selectedClipId: rightId, statusMessage: "Clip split." });
    },

    duplicateClip: (id) => {
      const clip = get().project.clips.find((c) => c.id === id);
      if (!clip) return;
      const newId = uid();
      touchProject((p) => {
        const copy: Clip = {
          ...clip,
          id: newId,
          startSec: clip.startSec + clip.durationSec,
          take: clip.take + 1,
          name: clip.name + " copy",
          notes:
            clip.kind === "midi"
              ? (clip.notes ?? []).map((n) => ({ ...n, id: uid() }))
              : undefined,
        };
        return {
          ...p,
          clips: [...p.clips, copy],
          lengthSec: Math.max(p.lengthSec, copy.startSec + copy.durationSec + 10),
        };
      });
      set({ selectedClipId: newId });
    },

    setClipGain: (id, gain) =>
      touchProject(
        (p) => ({
          ...p,
          clips: p.clips.map((c) => (c.id === id ? { ...c, gain } : c)),
        }),
        `clipgain:${id}`
      ),

    setClipFade: (id, fadeInSec, fadeOutSec) =>
      touchProject(
        (p) => ({
          ...p,
          clips: p.clips.map((c) =>
            c.id === id
              ? {
                  ...c,
                  fadeInSec: Math.max(0, Math.min(fadeInSec, c.durationSec)),
                  fadeOutSec: Math.max(0, Math.min(fadeOutSec, c.durationSec)),
                }
              : c
          ),
        }),
        `clipfade:${id}`
      ),

    toggleClipMute: (id) =>
      touchProject((p) => ({
        ...p,
        clips: p.clips.map((c) => (c.id === id ? { ...c, muted: !c.muted } : c)),
      })),

    groupSelectedClips: () => {
      const selected = get().selectedClipId;
      if (!selected) {
        set({ statusMessage: "Select a clip to group nearby clips." });
        return;
      }
      const clip = get().project.clips.find((c) => c.id === selected);
      if (!clip) return;
      const groupId = clip.groupId ?? uid();
      const start = clip.startSec;
      const end = clip.startSec + clip.durationSec;
      touchProject((p) => ({
        ...p,
        clips: p.clips.map((c) =>
          c.trackId === clip.trackId && c.startSec < end + 0.2 && c.startSec + c.durationSec > start - 0.2
            ? { ...c, groupId }
            : c
        ),
      }));
      set({ statusMessage: "Grouped adjacent clips on the selected track." });
    },

    toggleClipLock: (id) =>
      touchProject((p) => ({
        ...p,
        clips: p.clips.map((c) => (c.id === id ? { ...c, locked: !c.locked } : c)),
      })),

    setClipColorLabel: (id, color) =>
      touchProject((p) => ({
        ...p,
        clips: p.clips.map((c) => (c.id === id ? { ...c, colorLabel: color } : c)),
      })),

    reverseClip: async (id) => {
      const clip = get().project.clips.find((c) => c.id === id);
      if (!clip || clip.kind !== "audio") return;
      set({ processing: true, statusMessage: "Reversing clip..." });
      try {
        const region = await renderClipRegion(clip);
        if (!region) throw new Error("Missing clip audio");
        const ctx = await audioEngine.ensure();
        const out = ctx.createBuffer(region.numberOfChannels, region.length, region.sampleRate);
        for (let ch = 0; ch < region.numberOfChannels; ch++) {
          const src = region.getChannelData(ch);
          const dst = out.getChannelData(ch);
          for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i];
        }
        const asset = await registerRenderedAsset(out, `${clip.name} (reverse)`);
        touchProject((p) => ({
          ...p,
          assets: [...p.assets, asset],
          clips: p.clips.map((c) =>
            c.id === id ? { ...c, assetId: asset.id, offsetSec: 0, durationSec: out.duration, reversed: !c.reversed, processedLabel: "Reversed" } : c
          ),
        }));
        set({ processing: false, statusMessage: "Clip reversed." });
        await get().saveNow();
      } catch (e) {
        set({ processing: false, statusMessage: "Reverse failed: " + String(e) });
      }
    },

    normalizeClipAudio: async (id) => {
      const clip = get().project.clips.find((c) => c.id === id);
      if (!clip || clip.kind !== "audio") return;
      set({ processing: true, statusMessage: "Normalizing clip..." });
      try {
        const region = await renderClipRegion(clip);
        if (!region) throw new Error("Missing clip audio");
        let peak = 0;
        for (let ch = 0; ch < region.numberOfChannels; ch++) {
          const data = region.getChannelData(ch);
          for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
        }
        const gain = peak > 0 ? Math.min(12, 0.92 / peak) : 1;
        const ctx = await audioEngine.ensure();
        const out = ctx.createBuffer(region.numberOfChannels, region.length, region.sampleRate);
        for (let ch = 0; ch < region.numberOfChannels; ch++) {
          const src = region.getChannelData(ch);
          const dst = out.getChannelData(ch);
          for (let i = 0; i < src.length; i++) dst[i] = Math.max(-1, Math.min(1, src[i] * gain));
        }
        const asset = await registerRenderedAsset(out, `${clip.name} (normalized)`);
        touchProject((p) => ({
          ...p,
          assets: [...p.assets, asset],
          clips: p.clips.map((c) =>
            c.id === id ? { ...c, assetId: asset.id, offsetSec: 0, durationSec: out.duration, normalized: true, processedLabel: "Normalized" } : c
          ),
        }));
        set({ processing: false, statusMessage: "Clip normalized to -0.7 dB peak." });
        await get().saveNow();
      } catch (e) {
        set({ processing: false, statusMessage: "Normalize failed: " + String(e) });
      }
    },

    bounceClip: async (id) => {
      const clip = get().project.clips.find((c) => c.id === id);
      if (!clip) return;
      set({ processing: true, statusMessage: "Bouncing clip..." });
      try {
        const buffer = clip.kind === "audio"
          ? await renderClipRegion(clip)
          : await renderRegion({ ...get().project, clips: [clip] }, (assetId) => audioEngine.getBuffer(assetId), clip.startSec, clip.startSec + clip.durationSec);
        if (!buffer) throw new Error("Nothing to bounce");
        const asset = await registerRenderedAsset(buffer, `${clip.name} (bounced)`);
        const bounced: Clip = {
          id: uid(),
          trackId: clip.trackId,
          assetId: asset.id,
          name: `${clip.name} (bounced)`,
          kind: "audio",
          startSec: clip.startSec,
          offsetSec: 0,
          durationSec: buffer.duration,
          take: clip.take,
          gain: 1,
          fadeInSec: 0,
          fadeOutSec: 0,
          muted: false,
          colorLabel: clip.colorLabel,
          bouncedFromClipIds: [clip.id],
        };
        touchProject((p) => ({
          ...p,
          assets: [...p.assets, asset],
          clips: p.clips.map((c) => (c.id === clip.id ? { ...c, muted: true, compRole: "muted" as const } : c)).concat(bounced),
        }));
        set({ selectedClipId: bounced.id, processing: false, statusMessage: "Clip bounced to audio." });
        await get().saveNow();
      } catch (e) {
        set({ processing: false, statusMessage: "Bounce failed: " + String(e) });
      }
    },

    consolidateSelection: async () => {
      const selected = get().selectedClipId;
      const clip = selected ? get().project.clips.find((c) => c.id === selected) : null;
      if (!clip) {
        set({ statusMessage: "Select a clip to consolidate its group or loop region." });
        return;
      }
      const groupClips = get().project.clips.filter((c) => (clip.groupId ? c.groupId === clip.groupId : c.id === clip.id));
      const start = Math.min(...groupClips.map((c) => c.startSec));
      const end = Math.max(...groupClips.map((c) => c.startSec + c.durationSec));
      set({ processing: true, statusMessage: "Consolidating selection..." });
      try {
        const buffer = await renderRegion({ ...get().project, clips: groupClips }, (id) => audioEngine.getBuffer(id), start, end);
        const asset = await registerRenderedAsset(buffer, `${clip.name} (consolidated)`);
        const consolidated: Clip = {
          id: uid(),
          trackId: clip.trackId,
          assetId: asset.id,
          name: `${clip.name} (consolidated)`,
          kind: "audio",
          startSec: start,
          offsetSec: 0,
          durationSec: buffer.duration,
          take: 1,
          gain: 1,
          fadeInSec: 0,
          fadeOutSec: 0,
          muted: false,
          groupId: clip.groupId,
          bouncedFromClipIds: groupClips.map((c) => c.id),
        };
        touchProject((p) => ({
          ...p,
          assets: [...p.assets, asset],
          clips: p.clips.map((c) => (groupClips.some((g) => g.id === c.id) ? { ...c, muted: true, compRole: "muted" as const } : c)).concat(consolidated),
        }));
        set({ selectedClipId: consolidated.id, processing: false, statusMessage: "Selection consolidated." });
        await get().saveNow();
      } catch (e) {
        set({ processing: false, statusMessage: "Consolidate failed: " + String(e) });
      }
    },

    promoteTake: (clipId) => {
      const clip = get().project.clips.find((c) => c.id === clipId);
      if (!clip) return;
      touchProject((p) => ({
        ...p,
        clips: p.clips.map((c) =>
          c.trackId === clip.trackId && Math.abs(c.startSec - clip.startSec) < 0.05
            ? { ...c, muted: c.id !== clipId, compRole: c.id === clipId ? "chosen" : "muted" }
            : c
        ),
      }));
      set({ statusMessage: "Take promoted for comp playback." });
    },

    setClipTakeLane: (clipId, lane) => {
      const nextLane = Math.max(1, Math.min(16, Math.round(lane)));
      touchProject((p) => ({
        ...p,
        clips: p.clips.map((c) => (c.id === clipId ? { ...c, takeLane: nextLane, take: nextLane } : c)),
      }));
    },

    setClipCompRole: (clipId, role) => {
      touchProject((p) => ({
        ...p,
        clips: p.clips.map((c) => (c.id === clipId ? { ...c, compRole: role, muted: role === "muted" } : c)),
      }));
    },

    detectClipTempo: async (clipId) => {
      const clip = get().project.clips.find((c) => c.id === clipId);
      if (!clip || clip.kind !== "audio") {
        set({ statusMessage: "Select an audio clip for BPM detection." });
        return;
      }
      set({ analyzing: true, statusMessage: "Detecting clip BPM..." });
      try {
        const region = await renderClipRegion(clip);
        if (!region) throw new Error("Missing clip audio");
        const analysis = runBeatIntelligence(region, { clip, assetId: clip.assetId, name: clip.name });
        touchProject((p) => ({
          ...p,
          beatIntelligence: analysis,
          clips: p.clips.map((c) => (c.id === clipId ? { ...c, sourceBpm: analysis.bpm } : c)),
        }));
        set({ analyzing: false, statusMessage: `Detected ${analysis.bpm} BPM (${Math.round(analysis.confidence * 100)}% confidence).` });
      } catch (e) {
        set({ analyzing: false, statusMessage: "BPM detection failed: " + String(e) });
      }
    },

    setClipSourceBpm: (clipId, bpm) => {
      const clean = bpm && Number.isFinite(bpm) ? Math.max(40, Math.min(240, Math.round(bpm))) : null;
      touchProject((p) => ({
        ...p,
        clips: p.clips.map((c) => (c.id === clipId ? { ...c, sourceBpm: clean } : c)),
      }));
    },

    timeStretchClip: async (clipId, ratio) => {
      const clip = get().project.clips.find((c) => c.id === clipId);
      if (!clip || clip.kind !== "audio") return;
      const stretch = Math.max(0.35, Math.min(3, ratio));
      set({ processing: true, statusMessage: `Time-stretching clip ${Math.round(stretch * 100)}%...` });
      try {
        const region = await renderClipRegion(clip);
        if (!region) throw new Error("Missing clip audio");
        const stretched = timeStretchConstant(region, stretch);
        const asset = await registerRenderedAsset(stretched, `${clip.name} (stretched)`);
        touchProject((p) => ({
          ...p,
          assets: [...p.assets, asset],
          clips: p.clips.map((c) =>
            c.id === clipId
              ? { ...c, assetId: asset.id, dryAssetId: c.dryAssetId ?? c.assetId, offsetSec: 0, durationSec: stretched.duration, stretchRatio: stretch, processedLabel: "Stretched" }
              : c
          ),
          lengthSec: Math.max(p.lengthSec, clip.startSec + stretched.duration + 10),
        }));
        set({ processing: false, statusMessage: "Clip time-stretched with pitch preserved." });
        await get().saveNow();
      } catch (e) {
        set({ processing: false, statusMessage: "Time-stretch failed: " + String(e) });
      }
    },

    matchClipToProjectTempo: async (clipId) => {
      let clip = get().project.clips.find((c) => c.id === clipId);
      if (!clip || clip.kind !== "audio") return;
      if (!clip.sourceBpm) {
        await get().detectClipTempo(clipId);
        clip = get().project.clips.find((c) => c.id === clipId);
      }
      if (!clip?.sourceBpm) {
        set({ statusMessage: "Set or detect source BPM before matching tempo." });
        return;
      }
      const ratio = clip.sourceBpm / Math.max(40, get().project.tempo);
      await get().timeStretchClip(clipId, ratio);
    },

    pitchShiftClip: async (clipId, semitones) => {
      const clip = get().project.clips.find((c) => c.id === clipId);
      if (!clip || clip.kind !== "audio") return;
      const shift = Math.max(-24, Math.min(24, semitones));
      set({ processing: true, statusMessage: `Pitch-shifting clip ${shift > 0 ? "+" : ""}${shift} semitones...` });
      try {
        const region = await renderClipRegion(clip);
        if (!region) throw new Error("Missing clip audio");
        const shifted = pitchShiftConstant(region, shift);
        const asset = await registerRenderedAsset(shifted, `${clip.name} (${shift > 0 ? "+" : ""}${shift}st)`);
        touchProject((p) => ({
          ...p,
          assets: [...p.assets, asset],
          clips: p.clips.map((c) =>
            c.id === clipId
              ? { ...c, assetId: asset.id, dryAssetId: c.dryAssetId ?? c.assetId, offsetSec: 0, durationSec: shifted.duration, pitchShiftSemitones: (c.pitchShiftSemitones ?? 0) + shift, processedLabel: "Pitch-shifted" }
              : c
          ),
        }));
        set({ processing: false, statusMessage: "Clip pitch-shifted without changing length." });
        await get().saveNow();
      } catch (e) {
        set({ processing: false, statusMessage: "Pitch shift failed: " + String(e) });
      }
    },

    addAutomationLane: (target, trackId) => {
      const track = get().project.tracks.find((t) => t.id === trackId);
      const color = target.startsWith("master") ? "#e8b341" : track?.color ?? "#7c5cff";
      const name = `${track ? track.name + " " : ""}${target.replace(/\./g, " ")}`;
      touchProject((p) => ({
        ...p,
        automation: [...(p.automation ?? []), makeAutomationLane(target, name, color, trackId)],
      }));
      set({ statusMessage: "Automation lane added." });
    },

    addAutomationPoint: (laneId, timeSec, value) =>
      touchProject((p) => ({
        ...p,
        automation: (p.automation ?? []).map((lane) =>
          lane.id === laneId
            ? {
                ...lane,
                points: [...lane.points, { id: uid(), timeSec: Math.max(0, timeSec), value: Math.max(lane.min, Math.min(lane.max, value)) }]
                  .sort((a, b) => a.timeSec - b.timeSec),
              }
            : lane
        ),
      })),

    moveAutomationPoint: (laneId, pointId, timeSec, value) =>
      touchProject(
        (p) => ({
          ...p,
          automation: (p.automation ?? []).map((lane) =>
            lane.id === laneId
              ? {
                  ...lane,
                  points: lane.points
                    .map((pt) => pt.id === pointId ? { ...pt, timeSec: Math.max(0, timeSec), value: Math.max(lane.min, Math.min(lane.max, value)) } : pt)
                    .sort((a, b) => a.timeSec - b.timeSec),
                }
              : lane
          ),
        }),
        `automation:${laneId}:${pointId}`
      ),

    deleteAutomationPoint: (laneId, pointId) =>
      touchProject((p) => ({
        ...p,
        automation: (p.automation ?? []).map((lane) =>
          lane.id === laneId ? { ...lane, points: lane.points.filter((pt) => pt.id !== pointId) } : lane
        ),
      })),

    toggleAutomationLane: (laneId) =>
      touchProject((p) => ({
        ...p,
        automation: (p.automation ?? []).map((lane) => lane.id === laneId ? { ...lane, enabled: !lane.enabled } : lane),
      })),

    deleteSelected: () => {
      const { selectedClipId } = get();
      if (selectedClipId) get().deleteClip(selectedClipId);
    },

    // ---- Import ----
    importFiles: async (files, opts) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      await audioEngine.ensure();
      const state = get();
      let targetTrackId = state.selectedTrackId ?? state.project.tracks[0]?.id ?? null;

      // For a beat import, drop it on a dedicated track at the start.
      if (opts?.asBeat) {
        const beatTrack = newTrack(state.project.tracks.length);
        beatTrack.name = "Beat";
        beatTrack.armed = false;
        beatTrack.color = "#4d8dff";
        touchProject((p) => ({ ...p, tracks: [...p.tracks, beatTrack] }));
        audioEngine.ensureTrack(beatTrack.id);
        audioEngine.applyEffects(beatTrack.id, beatTrack.effects);
        targetTrackId = beatTrack.id;
      }
      if (!targetTrackId) {
        set({ statusMessage: "Add a track before importing." });
        return;
      }

      let placeAt = opts?.asBeat ? 0 : get().positionSec;
      let imported = 0;
      for (const file of list) {
        try {
          const buf = await file.arrayBuffer();
          // decodeAudioData detaches the buffer; copy for the blob first.
          const blob = new Blob([buf.slice(0)], { type: file.type || "audio/wav" });
          const buffer = await audioEngine.decodeBlob(blob);
          if (!buffer || buffer.duration <= 0) {
            set({ statusMessage: `Could not decode ${file.name}.` });
            continue;
          }
          const assetId = uid();
          audioEngine.registerBuffer(assetId, buffer);
          mixToMono(assetId, buffer);
          const asset: AudioAsset = {
            id: assetId,
            name: file.name,
            mime: blob.type,
            durationSec: buffer.duration,
            sampleRate: buffer.sampleRate,
            numChannels: buffer.numberOfChannels,
            length: buffer.length,
            createdAt: Date.now(),
          };
          await db.saveBlob(assetId, get().project.id, blob);
          const clipId = uid();
          const ttid = targetTrackId;
          const startAt = placeAt;
          touchProject((p) => {
            const clip: Clip = {
              id: clipId,
              trackId: ttid,
              assetId,
              name: file.name.replace(/\.[^.]+$/, ""),
              kind: "audio",
              startSec: startAt,
              offsetSec: 0,
              durationSec: buffer.duration,
              take: 1,
              gain: 1,
              fadeInSec: 0,
              fadeOutSec: 0,
              muted: false,
            };
            return {
              ...p,
              assets: [...p.assets, asset],
              clips: [...p.clips, clip],
              lengthSec: Math.max(p.lengthSec, startAt + buffer.duration + 10),
            };
          });
          placeAt += buffer.duration;
          imported++;
        } catch (e) {
          set({ statusMessage: `Import failed for ${file.name}: ${String(e)}` });
        }
      }
      if (imported > 0) {
        set({ statusMessage: `Imported ${imported} file${imported > 1 ? "s" : ""}.` });
        await get().saveNow();
      }
    },

    // ---- Sample pads ----
    addPadFromFile: async (file) => {
      await audioEngine.ensure();
      try {
        const buf = await file.arrayBuffer();
        const blob = new Blob([buf.slice(0)], { type: file.type || "audio/wav" });
        const buffer = await audioEngine.decodeBlob(blob);
        if (!buffer) {
          set({ statusMessage: `Could not decode ${file.name}.` });
          return;
        }
        const assetId = uid();
        audioEngine.registerBuffer(assetId, buffer);
        mixToMono(assetId, buffer);
        const asset: AudioAsset = {
          id: assetId,
          name: file.name,
          mime: blob.type,
          durationSec: buffer.duration,
          sampleRate: buffer.sampleRate,
          numChannels: buffer.numberOfChannels,
          length: buffer.length,
          createdAt: Date.now(),
        };
        await db.saveBlob(assetId, get().project.id, blob);
        const padKeys = "1234567890qwertyuiop";
        touchProject((p) => {
          const used = new Set(p.pads.map((pd) => pd.key));
          const key = [...padKeys].find((k) => !used.has(k)) ?? "";
          const pad: Pad = {
            id: uid(),
            name: file.name.replace(/\.[^.]+$/, "").slice(0, 14),
            assetId,
            key,
            gain: 1,
            color: TRACK_COLORS[p.pads.length % TRACK_COLORS.length].hex,
          };
          return { ...p, assets: [...p.assets, asset], pads: [...p.pads, pad] };
        });
        set({ statusMessage: `Pad added: ${file.name}` });
        await get().saveNow();
      } catch (e) {
        set({ statusMessage: `Pad import failed: ${String(e)}` });
      }
    },

    triggerPad: (padId) => {
      const pad = get().project.pads.find((p) => p.id === padId);
      if (!pad) return;
      const buffer = audioEngine.getBuffer(pad.assetId);
      if (!buffer) return;
      void audioEngine.ensure().then(() => audioEngine.playSample(buffer, pad.gain));
    },

    removePad: (padId) => {
      const pad = get().project.pads.find((p) => p.id === padId);
      touchProject((p) => {
        const pads = p.pads.filter((pd) => pd.id !== padId);
        const stillUsed =
          pad &&
          (pads.some((pd) => pd.assetId === pad.assetId) ||
            p.clips.some((c) => c.assetId === pad.assetId));
        const assets = stillUsed ? p.assets : p.assets.filter((a) => a.id !== pad?.assetId);
        return { ...p, pads, assets };
      });
      if (pad) {
        const stillUsed =
          get().project.pads.some((pd) => pd.assetId === pad.assetId) ||
          get().project.clips.some((c) => c.assetId === pad.assetId);
        if (!stillUsed) {
          dropMono(pad.assetId);
          void db.deleteBlob(pad.assetId);
        }
      }
    },

    setPadGain: (padId, gain) =>
      touchProject(
        (p) => ({
          ...p,
          pads: p.pads.map((pd) => (pd.id === padId ? { ...pd, gain } : pd)),
        }),
        `padgain:${padId}`
      ),

    renamePad: (padId, name) =>
      touchProject((p) => ({
        ...p,
        pads: p.pads.map((pd) => (pd.id === padId ? { ...pd, name } : pd)),
      })),

    setPadBankOpen: (open) => set({ padBankOpen: open }),

    // ---- MIDI ----
    addMidiClip: (trackId, startSec) => {
      const clipId = uid();
      const snapped = get().snapEnabled
        ? Math.round(startSec / get().snapSec) * get().snapSec
        : startSec;
      touchProject((p) => {
        const clip: Clip = {
          id: clipId,
          trackId,
          assetId: "",
          name: "MIDI",
          kind: "midi",
          startSec: Math.max(0, snapped),
          offsetSec: 0,
          durationSec: 4,
          take: 1,
          gain: 1,
          fadeInSec: 0,
          fadeOutSec: 0,
          muted: false,
          notes: [],
        };
        return {
          ...p,
          clips: [...p.clips, clip],
          lengthSec: Math.max(p.lengthSec, clip.startSec + clip.durationSec + 10),
        };
      });
      set({ selectedClipId: clipId, editingMidiClipId: clipId });
    },

    openPianoRoll: (clipId) => set({ editingMidiClipId: clipId }),

    addNote: (clipId, note) => {
      const noteId = uid();
      touchProject((p) => ({
        ...p,
        clips: p.clips.map((c) =>
          c.id === clipId
            ? { ...c, notes: [...(c.notes ?? []), { ...note, id: noteId }] }
            : c
        ),
      }));
    },

    deleteNote: (clipId, noteId) =>
      touchProject((p) => ({
        ...p,
        clips: p.clips.map((c) =>
          c.id === clipId
            ? { ...c, notes: (c.notes ?? []).filter((n) => n.id !== noteId) }
            : c
        ),
      })),

    moveNote: (clipId, noteId, startSec, pitch) =>
      touchProject(
        (p) => ({
          ...p,
          clips: p.clips.map((c) =>
            c.id === clipId
              ? {
                  ...c,
                  notes: (c.notes ?? []).map((n) =>
                    n.id === noteId
                      ? {
                          ...n,
                          startSec: Math.max(0, startSec),
                          pitch: Math.max(0, Math.min(127, Math.round(pitch))),
                        }
                      : n
                  ),
                }
              : c
          ),
        }),
        `note:${noteId}`
      ),

    resizeNote: (clipId, noteId, durationSec) =>
      touchProject(
        (p) => ({
          ...p,
          clips: p.clips.map((c) =>
            c.id === clipId
              ? {
                  ...c,
                  notes: (c.notes ?? []).map((n) =>
                    n.id === noteId ? { ...n, durationSec: Math.max(0.05, durationSec) } : n
                  ),
                }
              : c
          ),
        }),
        `noteres:${noteId}`
      ),

    setNoteVelocity: (clipId, noteId, velocity) =>
      touchProject(
        (p) => ({
          ...p,
          clips: p.clips.map((c) =>
            c.id === clipId
              ? {
                  ...c,
                  notes: (c.notes ?? []).map((n) =>
                    n.id === noteId
                      ? { ...n, velocity: Math.max(0, Math.min(1, velocity)) }
                      : n
                  ),
                }
              : c
          ),
        }),
        `notevel:${noteId}`
      ),

    quantizeClip: (clipId) => {
      const grid = (60 / get().project.tempo) * get().gridDivision;
      touchProject((p) => ({
        ...p,
        clips: p.clips.map((c) =>
          c.id === clipId
            ? {
                ...c,
                notes: (c.notes ?? []).map((n) => ({
                  ...n,
                  startSec: Math.round(n.startSec / grid) * grid,
                })),
              }
            : c
        ),
      }));
      set({ statusMessage: "Notes quantized." });
    },

    humanizeClip: (clipId) => {
      const grid = (60 / get().project.tempo) * get().gridDivision;
      const timeJit = grid * 0.06;
      touchProject((p) => ({
        ...p,
        clips: p.clips.map((c) =>
          c.id === clipId
            ? {
                ...c,
                notes: (c.notes ?? []).map((n) => ({
                  ...n,
                  startSec: Math.max(0, n.startSec + (Math.random() - 0.5) * 2 * timeJit),
                  velocity: Math.max(0.1, Math.min(1, n.velocity + (Math.random() - 0.5) * 0.2)),
                })),
              }
            : c
        ),
      }));
      set({ statusMessage: "Notes humanized (subtle timing & velocity)." });
    },

    exportClipMidi: async (clipId) => {
      const clip = get().project.clips.find((c) => c.id === clipId);
      if (!clip || clip.kind !== "midi" || !(clip.notes && clip.notes.length)) {
        set({ statusMessage: "Select a MIDI clip with notes to export." });
        return;
      }
      const { encodeMidiFile } = await import("../audio/smf");
      const blob = encodeMidiFile(clip.notes, get().project.tempo);
      const ok = await saveBlobFile(blob, `${safeName(clip.name)}.mid`);
      if (ok) recordExport("midi", `${safeName(clip.name)}.mid`);
      set({ statusMessage: ok ? "MIDI exported (.mid)." : "MIDI export canceled." });
    },

    // ---- Markers / sections ----
    addMarker: (kind) => {
      const time = get().positionSec;
      touchProject((p) => {
        const marker: Marker = {
          id: uid(),
          name: kind === "section" ? `Section ${p.markers.filter((m) => m.kind === "section").length + 1}` : `Marker ${p.markers.length + 1}`,
          timeSec: time,
          kind,
          color: kind === "section" ? "#e8b341" : "#39d3e0",
        };
        return { ...p, markers: [...p.markers, marker].sort((a, b) => a.timeSec - b.timeSec) };
      });
    },

    deleteMarker: (id) =>
      touchProject((p) => ({ ...p, markers: p.markers.filter((m) => m.id !== id) })),

    renameMarker: (id, name) =>
      touchProject((p) => ({
        ...p,
        markers: p.markers.map((m) => (m.id === id ? { ...m, name } : m)),
      })),

    jumpToMarker: (id) => {
      const m = get().project.markers.find((mk) => mk.id === id);
      if (m) get().seek(m.timeSec);
    },

    // ---- Loop / grid ----
    toggleLoop: () => {
      touchProject((p) => ({ ...p, loop: { ...p.loop, enabled: !p.loop.enabled } }));
      const loop = get().project.loop;
      audioEngine.setLoop(loop.enabled, loop.startSec, loop.endSec);
    },

    setLoopRegion: (startSec, endSec) => {
      const s = Math.max(0, Math.min(startSec, endSec));
      const e = Math.max(s + 0.1, endSec);
      touchProject((p) => ({ ...p, loop: { enabled: true, startSec: s, endSec: e } }));
      audioEngine.setLoop(true, s, e);
    },

    clearLoop: () => {
      touchProject((p) => ({ ...p, loop: { ...p.loop, enabled: false } }));
      audioEngine.setLoop(false, 0, 0);
    },

    setGridDivision: (beats) => {
      const snapSec = (60 / get().project.tempo) * beats;
      set({ gridDivision: beats, snapSec });
    },

    // ---- Undo / redo ----
    undo: () => {
      const { past } = get();
      if (past.length === 0) {
        set({ statusMessage: "Nothing to undo." });
        return;
      }
      set((s) => {
        const prev = s.past[s.past.length - 1];
        return {
          project: prev,
          past: s.past.slice(0, -1),
          future: [s.project, ...s.future].slice(0, 100),
          dirty: true,
          exportSettings: normalizeExportSettings(prev.exportSettings),
          selectedClipId: prev.clips.some((c) => c.id === s.selectedClipId)
            ? s.selectedClipId
            : null,
        };
      });
      lastCoalesceKey = null;
      reconcileEngine();
      scheduleAutosave();
    },

    redo: () => {
      const { future } = get();
      if (future.length === 0) {
        set({ statusMessage: "Nothing to redo." });
        return;
      }
      set((s) => {
        const next = s.future[0];
        return {
          project: next,
          future: s.future.slice(1),
          past: [...s.past, s.project].slice(-100),
          dirty: true,
          exportSettings: normalizeExportSettings(next.exportSettings),
        };
      });
      lastCoalesceKey = null;
      reconcileEngine();
      scheduleAutosave();
    },

    // ---- Master bus ----
    setMasterEffectEnabled: (key, enabled) => {
      touchProject((p) => ({
        ...p,
        master: { ...p.master, effects: patchEffect(p.master.effects, key, { enabled }) },
      }));
      audioEngine.setMasterChain(get().project.master.effects);
    },

    setMasterEffectParam: (key, param, value) => {
      touchProject(
        (p) => ({
          ...p,
          master: {
            ...p.master,
            effects: patchEffect(p.master.effects, key, { [param]: value }),
          },
        }),
        `master:${key}:${param}`
      );
      audioEngine.setMasterChain(get().project.master.effects);
    },

    setMasterBypass: (bypass) => {
      touchProject((p) => ({ ...p, master: { ...p.master, bypass } }));
      audioEngine.setMasterBypass(bypass);
    },

    applyMasterPreset: (presetId) => {
      const preset = getMasterPreset(presetId);
      if (!preset) return;
      const { effects, outputGain } = preset.build();
      touchProject((p) => ({
        ...p,
        master: { effects, bypass: false, presetName: preset.name },
        masterGain: outputGain,
      }));
      audioEngine.setMasterChain(effects);
      audioEngine.setMasterBypass(false);
      audioEngine.setMasterGain(outputGain);
      set({ statusMessage: `Master preset: ${preset.name}` });
    },

    clearMaster: () => {
      const effects = defaultEffects();
      touchProject((p) => ({ ...p, master: { effects, bypass: false, presetName: undefined } }));
      audioEngine.setMasterChain(effects);
      audioEngine.setMasterBypass(false);
      set({ statusMessage: "Master chain reset." });
    },

    // ---- Loudness ----
    analyzeLoudnessNow: async () => {
      const p = get().project;
      if (p.clips.filter((c) => c.kind === "audio" && !c.muted).length === 0) {
        set({ statusMessage: "Add some audio before analyzing loudness." });
        return;
      }
      set({ analyzing: true, statusMessage: "Analyzing loudness…" });
      try {
        const settings = normalizeExportSettings(p.exportSettings ?? get().exportSettings);
        const buffer = await renderProject(p, (id) => audioEngine.getBuffer(id), { includeMaster: settings.includeMaster, sampleRate: settings.sampleRate });
        const result = analyzeLoudness(buffer);
        set({ loudnessReport: result, analyzing: false, statusMessage: null });
      } catch (e) {
        set({ analyzing: false, statusMessage: "Analysis failed: " + String(e) });
      }
    },

    dismissLoudnessReport: () => set({ loudnessReport: null }),

    autoMaster: async (target) => {
      const p = get().project;
      if (p.clips.filter((c) => c.kind === "audio" && !c.muted).length === 0) {
        set({ statusMessage: "Add some audio before auto-mastering." });
        return;
      }
      set({ analyzing: true, statusMessage: "Auto Master: analyzing…" });
      try {
        // Measure the mix WITHOUT the master chain so the analysis is of the raw mix.
        const raw = await renderMixdown(
          { ...p, master: { ...p.master, bypass: true } },
          (id) => audioEngine.getBuffer(id)
        );
        const loud = analyzeLoudness(raw);
        const { effects, outputGain, changes } = deriveMaster(loud, p.masterGain, target);
        touchProject((pp) => ({
          ...pp,
          master: { effects, bypass: false, presetName: "Auto Master" },
          masterGain: outputGain,
        }));
        audioEngine.setMasterChain(effects);
        audioEngine.setMasterBypass(false);
        audioEngine.setMasterGain(outputGain);
        set({
          analyzing: false,
          masterReport: { changes, loud },
          statusMessage: "Auto Master applied.",
        });
        await get().saveNow();
      } catch (e) {
        set({ analyzing: false, statusMessage: "Auto Master failed: " + String(e) });
      }
    },

    dismissMasterReport: () => set({ masterReport: null }),

    // ---- Export ----
    exportFullSong: async () => {
      const p = get().project;
      if (p.clips.filter((c) => c.kind === "audio" && !c.muted).length === 0) {
        set({ statusMessage: "Nothing to export — record or import audio first." });
        return;
      }
      set({ exporting: true, exportProgress: "Rendering full song…" });
      const settings = normalizeExportSettings(p.exportSettings ?? get().exportSettings);
      try {
        const buffer = await renderProject(p, (id) => audioEngine.getBuffer(id), { includeMaster: settings.includeMaster, sampleRate: settings.sampleRate });
        if (!get().exporting) return;
        set({ exportProgress: `Encoding ${settings.format.toUpperCase()}...` });
        const encoded = exportBlobForSettings(buffer, settings);
        const fileName = `${safeName(p.name)}.${encoded.ext}`;
        const ok = await saveBlobFile(encoded.blob, fileName);
        if (ok) recordExport("song", fileName, encoded.label);
        set({
          exporting: false,
          exportProgress: null,
          statusMessage: ok ? `Song exported (${encoded.label}).` : "Export canceled.",
        });
      } catch (e) {
        set({ exporting: false, exportProgress: null, statusMessage: "Export failed: " + String(e) });
      }
    },

    exportLoopRegion: async () => {
      const p = get().project;
      if (!p.loop.enabled || p.loop.endSec <= p.loop.startSec) {
        set({ statusMessage: "Set a loop region first to export it." });
        return;
      }
      set({ exporting: true, exportProgress: "Rendering region…" });
      try {
        const settings = normalizeExportSettings(p.exportSettings ?? get().exportSettings);
        const buffer = await renderProject(p, (id) => audioEngine.getBuffer(id), {
          startSec: p.loop.startSec,
          endSec: p.loop.endSec,
          includeMaster: settings.includeMaster,
          sampleRate: settings.sampleRate,
        });
        if (!get().exporting) return;
        set({ exportProgress: `Encoding ${settings.format.toUpperCase()}...` });
        const encoded = exportBlobForSettings(buffer, settings);
        const fileName = `${safeName(p.name)}_region.${encoded.ext}`;
        const ok = await saveBlobFile(encoded.blob, fileName);
        if (ok) recordExport("region", fileName, encoded.label);
        set({
          exporting: false,
          exportProgress: null,
          statusMessage: ok ? `Region exported (${encoded.label}).` : "Export canceled.",
        });
      } catch (e) {
        set({ exporting: false, exportProgress: null, statusMessage: "Export failed: " + String(e) });
      }
    },

    exportStems: async () => {
      const p = get().project;
      const stemTracks = p.tracks.filter((t) =>
        p.clips.some((c) => c.trackId === t.id && c.kind === "audio")
      );
      if (stemTracks.length === 0) {
        set({ statusMessage: "No audio tracks to export as stems." });
        return;
      }
      set({ exporting: true, exportProgress: "Preparing stems…" });
      const settings = normalizeExportSettings(p.exportSettings ?? get().exportSettings);
      try {
        // Desktop: pick one folder and write all stems into it. Web: download each.
        const dir = isTauri() ? await pickDirectory() : null;
        if (isTauri() && !dir) {
          set({ exporting: false, exportProgress: null, statusMessage: "Stem export canceled." });
          return;
        }
        let count = 0;
        for (const track of stemTracks) {
          set({ exportProgress: `Rendering stem ${count + 1}/${stemTracks.length}: ${track.name}…` });
          const buffer = await renderStem(p, (id) => audioEngine.getBuffer(id), track.id, settings.sampleRate);
          if (!get().exporting) return;
          const encoded = exportBlobForSettings(buffer, settings);
          const fname = `${safeName(p.name)}_${safeName(track.name)}.${encoded.ext}`;
          await writeBlobToDir(dir, fname, encoded.blob);
          count++;
        }
        if (count > 0) recordExport("stem", `${count} stems`, `${settings.format.toUpperCase()} ${settings.format === "mp3" ? settings.mp3Kbps + " kbps" : settings.wavBitDepth + "-bit"}`);
        set({
          exporting: false,
          exportProgress: null,
          statusMessage: `Exported ${count} stem${count > 1 ? "s" : ""}.`,
        });
      } catch (e) {
        set({ exporting: false, exportProgress: null, statusMessage: "Stem export failed: " + String(e) });
      }
    },

    updateExportSettings: (patch) => {
      const next = normalizeExportSettings({ ...get().exportSettings, ...get().project.exportSettings, ...patch });
      set({ exportSettings: next });
      touchProject((p) => ({ ...p, exportSettings: next }), "export-settings");
    },

    cancelExport: () => {
      set({ exporting: false, exportProgress: null, statusMessage: "Export cancel requested. Current render will stop before saving if possible." });
    },

    // ---- Reference A/B ----
    importReference: async (file) => {
      await audioEngine.ensure();
      try {
        const buf = await file.arrayBuffer();
        const blob = new Blob([buf.slice(0)], { type: file.type || "audio/wav" });
        const buffer = await audioEngine.decodeBlob(blob);
        if (!buffer) {
          set({ statusMessage: `Could not decode ${file.name}.` });
          return;
        }
        const assetId = uid();
        audioEngine.registerBuffer(assetId, buffer);
        await db.saveBlob(assetId, get().project.id, blob);
        const ref: ReferenceTrack = { assetId, name: file.name, gain: 1 };
        touchProject((p) => ({ ...p, reference: ref }));
        set({ statusMessage: `Reference loaded: ${file.name}` });
        await get().saveNow();
      } catch (e) {
        set({ statusMessage: "Reference import failed: " + String(e) });
      }
    },

    removeReference: () => {
      const ref = get().project.reference;
      audioEngine.stopReference();
      touchProject((p) => ({ ...p, reference: null }));
      if (ref) void db.deleteBlob(ref.assetId);
      set({ referenceMode: "mix" });
      // Restore mix output in case we were in reference mode.
      audioEngine.setMasterGain(get().project.masterGain);
    },

    setReferenceGain: (gain) => {
      touchProject((p) => (p.reference ? { ...p, reference: { ...p.reference, gain } } : p), "refgain");
      audioEngine.setReferenceGain(gain);
    },

    setReferenceMode: (mode) => {
      const s = get();
      const ref = s.project.reference;
      if (mode === "ref" && !ref) return;
      set({ referenceMode: mode });
      if (mode === "ref") {
        // Silence the mix output and play the reference (post-master, direct out).
        audioEngine.setMasterGain(0);
        if (ref) {
          const buffer = audioEngine.getBuffer(ref.assetId);
          if (buffer && s.playing) {
            audioEngine.playReference(buffer, s.positionSec, ref.gain);
          }
        }
      } else {
        audioEngine.stopReference();
        audioEngine.setMasterGain(s.project.masterGain);
      }
    },

    togglePlay: async () => {
      if (get().playing) {
        get().stop();
      } else {
        await get().play();
      }
    },

    play: async () => {
      await audioEngine.ensure();
      const { project, positionSec, referenceMode } = get();
      audioEngine.setMetronome(get().metronomeEnabled, project.tempo);
      const anySolo = project.tracks.some((t) => t.soloed);
      await audioEngine.play(positionSec, project, (trackId) => {
        const t = project.tracks.find((x) => x.id === trackId);
        return t ? effectiveGain(t, anySolo, project.buses) : 0;
      });
      // Reference A/B: silence the mix and play the reference straight to output.
      if (referenceMode === "ref" && project.reference) {
        audioEngine.setMasterGain(0);
        const buffer = audioEngine.getBuffer(project.reference.assetId);
        if (buffer) audioEngine.playReference(buffer, positionSec, project.reference.gain);
      }
      set({ playing: true });
    },

    stop: () => {
      audioEngine.stop();
      const pos = audioEngine.currentPosition();
      audioEngine.setPlayheadAnchor(pos);
      set({ playing: false, recording: false });
    },

    seek: (sec) => {
      const clamped = Math.max(0, sec);
      audioEngine.setPlayheadAnchor(clamped);
      set({ positionSec: clamped });
      if (get().playing) void get().play();
    },

    toggleRecord: async () => {
      const state = get();
      if (state.recording) {
        // ---- Stop recording ----
        const result = await audioEngine.stopRecording();
        audioEngine.stop();
        const recStart = (recordAnchor.start ?? state.positionSec);
        set({ recording: false, playing: false });

        if (!result) {
          set({ statusMessage: "No audio captured." });
          return;
        }
        try {
          const buffer = await audioEngine.decodeBlob(result.blob);
          const assetId = uid();
          audioEngine.registerBuffer(assetId, buffer);
          mixToMono(assetId, buffer);

          const asset: AudioAsset = {
            id: assetId,
            name: `Take ${Date.now()}`,
            mime: result.mime,
            durationSec: buffer.duration,
            sampleRate: buffer.sampleRate,
            numChannels: buffer.numberOfChannels,
            length: buffer.length,
            createdAt: Date.now(),
          };

          const targetTrackId = recordAnchor.trackId ?? state.selectedTrackId;
          const track = state.project.tracks.find((t) => t.id === targetTrackId);
          const takeNum =
            state.project.clips.filter((c) => c.trackId === targetTrackId).length + 1;

          const clip: Clip = {
            id: uid(),
            trackId: targetTrackId!,
            assetId,
            name: `${track?.name ?? "Take"} ${takeNum}`,
            kind: "audio",
            startSec: recStart,
            offsetSec: 0,
            durationSec: buffer.duration,
            take: takeNum,
            gain: 1,
            fadeInSec: 0,
            fadeOutSec: 0,
            muted: false,
          };

          await db.saveBlob(assetId, state.project.id, result.blob);

          touchProject((p) => ({
            ...p,
            assets: [...p.assets, asset],
            clips: [...p.clips, clip],
            lengthSec: Math.max(p.lengthSec, clip.startSec + clip.durationSec + 10),
          }));
          set({ selectedClipId: clip.id, statusMessage: "Take recorded." });
          get().finalizeLiveDirectorTake(clip.name);
          await get().saveNow();
        } catch (e) {
          set({ statusMessage: "Failed to decode recording: " + String(e) });
        }
        recordAnchor.start = null;
        recordAnchor.trackId = null;
        return;
      }

      // ---- Start recording ----
      try {
        await audioEngine.ensure();
        if (!audioEngine.hasInput()) {
          await get().enableInput();
        }
        if (!audioEngine.hasInput()) {
          set({ statusMessage: "No microphone available.", micPanelOpen: true });
          return;
        }

        // Determine target track: first armed, else selected, else first.
        let target =
          state.project.tracks.find((t) => t.armed)?.id ??
          state.selectedTrackId ??
          state.project.tracks[0]?.id ??
          null;
        if (!target) {
          set({ statusMessage: "Add a track before recording." });
          return;
        }
        // Auto-arm the target so the UI reflects what is recording.
        if (!state.project.tracks.find((t) => t.id === target)?.armed) {
          get().toggleArm(target);
        }

        recordAnchor.start = state.positionSec;
        recordAnchor.trackId = target;

        // Optional count-in: play clicks before recording starts.
        if (state.countInBars > 0) {
          set({ statusMessage: `Count-in: ${state.countInBars} bar${state.countInBars > 1 ? "s" : ""}…` });
          await audioEngine.countIn(state.countInBars, state.project.tempo);
          if (!recordAnchor.trackId) return; // canceled during count-in
        }

        audioEngine.startRecording();
        // Overdub: play existing clips while recording.
        await get().play();
        previousLiveRms = 0;
        previousLivePitchHz = null;
        touchProject((p) => ({
          ...p,
          liveVocalDirector: {
            ...normalizeLiveVocalDirector(p.liveVocalDirector),
            active: true,
            floatingOpen: true,
            status: "listening",
            currentMessage: "Live Vocal Director is listening.",
            currentSeverity: "ok",
            currentScore: 0,
            markers: [],
            wordFeedback: [],
            workerLive: !!ensureLiveDirectorWorker(),
            lastFrameAt: Date.now(),
          },
        }));
        set({ recording: true, statusMessage: "Recording…" });
      } catch (e) {
        set({ statusMessage: "Recording failed: " + String(e) });
      }
    },

    setPixelsPerSecond: (pps) =>
      set({ pixelsPerSecond: Math.max(8, Math.min(400, pps)) }),
    zoomIn: () => set((s) => ({ pixelsPerSecond: Math.min(400, s.pixelsPerSecond * 1.3) })),
    zoomOut: () => set((s) => ({ pixelsPerSecond: Math.max(8, s.pixelsPerSecond / 1.3) })),
    toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),

    refreshDevices: async () => {
      try {
        const devices = await audioEngine.listInputDevices();
        set({ devices });
        if (!get().selectedDeviceId && devices[0]) {
          set({ selectedDeviceId: devices[0].deviceId });
        }
      } catch {
        /* enumeration may fail before permission */
      }
    },

    selectDevice: async (id) => {
      set({ selectedDeviceId: id });
      await persistSettings();
      if (audioEngine.hasInput()) {
        await audioEngine.openInput(id, get().inputGain);
        audioEngine.setMonitor(get().monitor);
      }
    },

    enableInput: async () => {
      try {
        await audioEngine.ensure();
        await audioEngine.openInput(get().selectedDeviceId, get().inputGain);
        audioEngine.setMonitorMode(get().monitorMode);
        updateMonitorRoute();
        audioEngine.setMonitor(get().monitor);
        set({ permission: "granted" });
        // Labels become available only after permission is granted.
        await get().refreshDevices();
        if (!get().selectedDeviceId) {
          const id = audioEngine.currentInputDeviceId();
          if (id) set({ selectedDeviceId: id });
        }
        await persistSettings();
      } catch (e) {
        set({
          permission: "denied",
          statusMessage: "Microphone access denied or unavailable: " + String(e),
        });
      }
    },

    setInputGain: (g) => {
      audioEngine.setInputGain(g);
      set({ inputGain: g });
      void persistSettings();
    },

    requestMonitor: (on) => {
      if (on && !get().monitorWarningAcknowledged) {
        set({ showMonitorWarning: true });
        return;
      }
      updateMonitorRoute();
      audioEngine.setMonitor(on);
      set({ monitor: on });
      void persistSettings();
    },

    confirmMonitor: () => {
      updateMonitorRoute();
      audioEngine.setMonitor(true);
      set({ monitor: true, monitorWarningAcknowledged: true, showMonitorWarning: false });
      void persistSettings();
    },

    cancelMonitor: () => set({ showMonitorWarning: false }),
    setMicPanelOpen: (open) => set({ micPanelOpen: open }),

    saveNow: async () => {
      set({ saving: true });
      const p = {
        ...get().project,
        schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
        savedWithVersion: "0.1.0",
        updatedAt: Date.now(),
      };
      try {
        await db.saveProject(p);
        set({ project: p, saving: false, lastSaved: Date.now(), dirty: false });
        maybeBackup();
      } catch (e) {
        set({ saving: false, statusMessage: "Save failed: " + String(e) });
      }
      void get().refreshProjectList();
    },

    markDirty: () => {
      set({ dirty: true });
      scheduleAutosave();
    },

    setStatus: (msg) => set({ statusMessage: msg }),

    // ---- Preferences / app shell ----
    setPrefsOpen: (open) => set({ prefsOpen: open }),
    setWizardOpen: (open) => set({ wizardOpen: open }),
    setHelpOpen: (open) => set({ helpOpen: open }),

    setAccent: (accent) => {
      set({ accent });
      applyAccent(accent);
      void persistSettings();
    },

    setAutosaveInterval: (sec) => {
      set({ autosaveIntervalSec: Math.max(5, Math.min(300, Math.round(sec))) });
      void persistSettings();
    },

    setAutoCheckUpdates: (on) => {
      set({ autoCheckUpdates: on });
      void persistSettings();
    },

    setReleaseChannel: (channel) => {
      set({ releaseChannel: channel });
      void persistSettings();
    },

    setAutoDownloadUpdates: (on) => {
      set({ autoDownloadUpdates: on });
      void persistSettings();
    },

    setInstallUpdatesOnClose: (on) => {
      set({ installUpdatesOnClose: on });
      void persistSettings();
    },

    setLowCpuMode: (on) => {
      set({ lowCpuMode: on });
      audioEngine.setLowCpu(on);
      void persistSettings();
    },

    setDisableVisualizers: (on) => {
      set({ disableVisualizers: on });
      void persistSettings();
    },

    setMetronomeEnabled: (on) => {
      set({ metronomeEnabled: on });
      audioEngine.setMetronome(on, get().project.tempo);
      void persistSettings();
    },

    setCountInBars: (bars) => {
      set({ countInBars: Math.max(0, Math.min(4, Math.round(bars))) });
      void persistSettings();
    },

    completeSetup: () => {
      set({ setupComplete: true, wizardOpen: false });
      void persistSettings({ setupComplete: true });
    },

    resetApp: async () => {
      audioEngine.stop();
      await db.resetAll();
      // Reload to a clean first-run state.
      if (typeof location !== "undefined") location.reload();
    },

    checkForUpdatesNow: async () => {
      set({ checkingUpdate: true, updateStatus: "Checking for updates..." });
      const info = await checkForAppUpdate(get().releaseChannel);
      set({ checkingUpdate: false, updateInfo: info, updateStatus: info.message });
      if (info.phase === "available" && get().autoDownloadUpdates && !info.blocked) {
        await get().downloadUpdateNow();
      }
    },

    downloadUpdateNow: async () => {
      set({ checkingUpdate: true, updateStatus: "Downloading update..." });
      const info = await downloadAppUpdate((message) => set({ updateStatus: message }));
      set({ checkingUpdate: false, updateInfo: info, updateStatus: info.message });
    },

    installUpdateNow: async () => {
      set({ checkingUpdate: true, updateStatus: "Installing update..." });
      const info = await installDownloadedUpdate();
      set({ checkingUpdate: false, updateInfo: info, updateStatus: info.message });
      if (info.phase === "installed") await restartIntoUpdate();
    },

    tapTempo: () => {
      const now = performance.now();
      tapTimes.push(now);
      // Keep only recent taps within 2.5s.
      while (tapTimes.length > 0 && now - tapTimes[0] > 2500) tapTimes.shift();
      if (tapTimes.length >= 2) {
        let sum = 0;
        for (let i = 1; i < tapTimes.length; i++) sum += tapTimes[i] - tapTimes[i - 1];
        const avgMs = sum / (tapTimes.length - 1);
        const bpm = Math.round(Math.max(40, Math.min(300, 60000 / avgMs)));
        get().setTempo(bpm);
        set({ statusMessage: `Tempo: ${bpm} BPM (${tapTimes.length} taps)` });
      } else {
        set({ statusMessage: "Tap again to set tempo…" });
      }
    },

    // ---- Project management ----
    renameProjectById: async (id, name) => {
      const proj = id === get().project.id ? get().project : await db.loadProject(id);
      if (!proj) return;
      const updated = { ...proj, name, updatedAt: Date.now() };
      await db.saveProject(updated);
      if (id === get().project.id) set({ project: updated });
      await get().refreshProjectList();
    },

    duplicateProjectById: async (id) => {
      const src = await db.loadProject(id);
      if (!src) return;
      set({ statusMessage: "Duplicating project…" });
      const newId = uid();
      // Remap every asset id so blobs are independent copies.
      const idMap = new Map<string, string>();
      for (const a of src.assets) idMap.set(a.id, uid());
      if (src.reference) idMap.set(src.reference.assetId, uid());

      const copy: Project = {
        ...JSON.parse(JSON.stringify(src)),
        id: newId,
        name: src.name + " copy",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      copy.assets = copy.assets.map((a) => ({ ...a, id: idMap.get(a.id) ?? a.id }));
      copy.clips = copy.clips.map((c) => ({ ...c, assetId: idMap.get(c.assetId) ?? c.assetId }));
      copy.pads = copy.pads.map((pd) => ({ ...pd, assetId: idMap.get(pd.assetId) ?? pd.assetId }));
      if (copy.reference) {
        copy.reference = { ...copy.reference, assetId: idMap.get(copy.reference.assetId) ?? copy.reference.assetId };
      }
      // Copy each referenced blob under the new id.
      for (const [oldId, dupId] of idMap) {
        const blob = await db.loadBlob(oldId);
        if (blob) await db.saveBlob(dupId, newId, blob);
      }
      await db.saveProject(copy);
      await get().refreshProjectList();
      set({ statusMessage: `Duplicated to "${copy.name}".` });
    },

    // ---- Recovery ----
    recoverSession: async () => {
      const rp = get().recoveryPrompt;
      if (!rp) return;
      set({ recoveryPrompt: null });
      // Prefer the live project; if it fails to load, fall back to the newest backup.
      let proj = await db.loadProject(rp.projectId);
      if (!proj) {
        const backup = await db.latestBackup(rp.projectId);
        if (backup) {
          proj = backup.project;
          await db.saveProject(proj); // restore it
          set({ statusMessage: "Recovered from backup snapshot." });
        }
      }
      if (proj) await get().openProject(proj.id);
    },

    dismissRecovery: () => set({ recoveryPrompt: null }),

    // ---- Autotune / pitch ----
    setTuneOpt: (patch) => {
      if (patch.key !== undefined) set({ tuneKey: patch.key });
      if (patch.scale !== undefined) set({ tuneScale: patch.scale });
      if (patch.strength !== undefined) set({ tuneStrength: patch.strength });
      if (patch.speed !== undefined) set({ tuneSpeed: patch.speed });
      if (patch.humanize !== undefined) set({ tuneHumanize: patch.humanize });
      if (patch.formant !== undefined) set({ tuneFormant: patch.formant });
    },

    analyzePitch: (clipId) => {
      const clip = get().project.clips.find((c) => c.id === clipId);
      if (!clip || clip.kind !== "audio") {
        set({ statusMessage: "Select an audio clip to analyze pitch." });
        return;
      }
      const buffer = audioEngine.getBuffer(clip.assetId);
      if (!buffer) {
        set({ statusMessage: "Audio is still loading." });
        return;
      }
      const s = get();
      const frames = detectPitchTrack(buffer, {
        key: s.tuneKey,
        scale: s.tuneScale,
        strength: s.tuneStrength,
        speed: s.tuneSpeed,
        humanize: s.tuneHumanize,
        formantPreserve: s.tuneFormant,
      });
      set({ pitchLane: { clipId, frames }, statusMessage: "Pitch analyzed." });
    },

    applyAutotune: async (clipId) => {
      const s = get();
      const clip = s.project.clips.find((c) => c.id === clipId);
      if (!clip || clip.kind !== "audio") {
        set({ statusMessage: "Select an audio clip to tune." });
        return;
      }
      set({ processing: true, statusMessage: "Applying pitch correction…" });
      try {
        const region = await renderClipRegion(clip);
        if (!region) {
          set({ processing: false, statusMessage: "Audio not ready." });
          return;
        }
        const { buffer, track } = correctPitch(region, {
          key: s.tuneKey,
          scale: s.tuneScale,
          strength: s.tuneStrength,
          speed: s.tuneSpeed,
          humanize: s.tuneHumanize,
          formantPreserve: s.tuneFormant,
        });
        const asset = await registerRenderedAsset(buffer, `${clip.name} (tuned)`);
        const dry = clip.dryAssetId ?? clip.assetId;
        touchProject((p) => ({
          ...p,
          assets: [...p.assets, asset],
          clips: p.clips.map((c) =>
            c.id === clipId
              ? { ...c, assetId: asset.id, dryAssetId: dry, offsetSec: 0, durationSec: buffer.duration, processedLabel: "Autotuned" }
              : c
          ),
        }));
        set({ processing: false, pitchLane: { clipId, frames: track }, statusMessage: "Autotune applied." });
        await get().saveNow();
      } catch (e) {
        set({ processing: false, statusMessage: "Autotune failed: " + String(e) });
      }
    },

    // ---- Vocal cleanup ----
    setCleanOpt: (patch) => set((st) => ({ cleanOpts: { ...st.cleanOpts, ...patch } })),

    applyCleanup: async (clipId, oneClick) => {
      const s = get();
      const clip = s.project.clips.find((c) => c.id === clipId);
      if (!clip || clip.kind !== "audio") {
        set({ statusMessage: "Select an audio clip to clean." });
        return;
      }
      set({ processing: true, statusMessage: oneClick ? "Cleaning vocal take…" : "Applying cleanup…" });
      try {
        const region = await renderClipRegion(clip);
        if (!region) {
          set({ processing: false, statusMessage: "Audio not ready." });
          return;
        }
        const opts: CleanOptions = oneClick
          ? { noiseReduction: 0.6, gate: true, breath: 0.5, declick: true, deEss: 0.55, harshness: 0.45, mud: 0.4, resonance: 0.35 }
          : s.cleanOpts;
        const cleaned = await cleanVocal(region, opts);
        const asset = await registerRenderedAsset(cleaned, `${clip.name} (clean)`);
        const dry = clip.dryAssetId ?? clip.assetId;
        touchProject((p) => ({
          ...p,
          assets: [...p.assets, asset],
          clips: p.clips.map((c) =>
            c.id === clipId
              ? { ...c, assetId: asset.id, dryAssetId: dry, offsetSec: 0, durationSec: cleaned.duration, processedLabel: "Cleaned" }
              : c
          ),
        }));
        set({ processing: false, statusMessage: "Vocal cleaned." });
        await get().saveNow();
      } catch (e) {
        set({ processing: false, statusMessage: "Cleanup failed: " + String(e) });
      }
    },

    toggleProcessBypass: (clipId) => {
      const clip = get().project.clips.find((c) => c.id === clipId);
      if (!clip || !clip.dryAssetId) {
        set({ statusMessage: "No processed version to compare." });
        return;
      }
      const dryBuf = audioEngine.getBuffer(clip.dryAssetId);
      const wetBuf = audioEngine.getBuffer(clip.assetId);
      const swapTo = clip.assetId; // current becomes the new dry
      touchProject((p) => ({
        ...p,
        clips: p.clips.map((c) =>
          c.id === clipId
            ? {
                ...c,
                assetId: c.dryAssetId!,
                dryAssetId: swapTo,
                durationSec: (audioEngine.getBuffer(c.dryAssetId!)?.duration) ?? c.durationSec,
              }
            : c
        ),
      }));
      set({ statusMessage: dryBuf && wetBuf ? "Toggled before/after." : "Toggled." });
    },

    // ---- Mix assistant ----
    analyzeMixNow: async () => {
      set({ analyzing: true, statusMessage: "Analyzing mix…" });
      try {
        const reports = await analyzeMix(get().project, (id) => audioEngine.getBuffer(id));
        set({ mixReports: reports, analyzing: false, statusMessage: "Mix analyzed." });
      } catch (e) {
        set({ analyzing: false, statusMessage: "Mix analysis failed: " + String(e) });
      }
    },

    applyMixFix: (trackId, kind) => {
      const track = get().project.tracks.find((t) => t.id === trackId);
      if (!track) return;
      const fx = JSON.parse(JSON.stringify(track.effects)) as EffectsState;
      let gain = track.gain;
      let msg = "";
      switch (kind) {
        case "raise":
          gain = Math.min(2, track.gain * 1.6);
          msg = "Raised track level.";
          break;
        case "lower":
          gain = Math.max(0.1, track.gain * 0.7);
          fx.limiter.enabled = true;
          fx.limiter.threshold = -1;
          msg = "Lowered level and engaged limiter.";
          break;
        case "demud":
          fx.eq.enabled = true;
          fx.eq.midFreq = 320;
          fx.eq.midGain = Math.min(fx.eq.midGain, -4);
          fx.eq.midQ = 1.1;
          msg = "Cut low-mid mud.";
          break;
        case "deboom":
          fx.eq.enabled = true;
          fx.eq.hpf = Math.max(fx.eq.hpf, 110);
          fx.eq.lowGain = Math.min(fx.eq.lowGain, -3);
          msg = "High-passed and cut boom.";
          break;
        case "deharsh":
          fx.eq.enabled = true;
          fx.eq.highGain = Math.min(fx.eq.highGain, -3);
          fx.deEsser.enabled = true;
          msg = "Tamed harsh highs + de-esser.";
          break;
        case "limiter":
          fx.limiter.enabled = true;
          fx.limiter.threshold = -1;
          msg = "Engaged limiter.";
          break;
        case "levelRide":
          void get().levelRideClip(
            get().project.clips.find((c) => c.trackId === trackId && c.kind === "audio")?.id ?? ""
          );
          return;
      }
      touchProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, effects: fx, gain } : t)),
      }));
      audioEngine.applyEffects(trackId, fx);
      applyAllTrackParams();
      set({ statusMessage: msg });
    },

    autoGainStage: async () => {
      set({ analyzing: true, statusMessage: "Auto gain staging…" });
      try {
        const p = get().project;
        const targetPeak = Math.pow(10, -6 / 20); // -6 dBFS headroom
        const updates: Record<string, number> = {};
        for (const track of p.tracks) {
          const hasAudio = p.clips.some((c) => c.trackId === track.id && c.kind === "audio");
          if (!hasAudio) continue;
          const stem = await renderStem(p, (id) => audioEngine.getBuffer(id), track.id);
          let peak = 0;
          for (let c = 0; c < stem.numberOfChannels; c++) {
            const d = stem.getChannelData(c);
            for (let i = 0; i < d.length; i++) {
              const a = Math.abs(d[i]);
              if (a > peak) peak = a;
            }
          }
          if (peak > 1e-4) {
            // stem already includes track.gain; compute the multiplier needed.
            const factor = targetPeak / peak;
            updates[track.id] = Math.max(0.05, Math.min(2, track.gain * factor));
          }
        }
        touchProject((pp) => ({
          ...pp,
          tracks: pp.tracks.map((t) => (updates[t.id] !== undefined ? { ...t, gain: updates[t.id] } : t)),
        }));
        applyAllTrackParams();
        set({ analyzing: false, statusMessage: "Gain staged to -6 dBFS per track." });
      } catch (e) {
        set({ analyzing: false, statusMessage: "Gain staging failed: " + String(e) });
      }
    },

    autoRouteBuses: () => {
      touchProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) => {
          const n = t.name.toLowerCase();
          let busId = "vocals";
          if (/(beat|music|instrument|inst|chord|bass|synth|pad|piano|keys|melody)/.test(n)) busId = "music";
          if (/(drum|kick|snare|hat|perc|808)/.test(n)) busId = "drums";
          return { ...t, busId };
        }),
      }));
      applyAllTrackParams();
      set({ statusMessage: "Tracks routed to Vocals / Music / Drums buses." });
    },

    levelRideClip: async (clipId) => {
      const clip = get().project.clips.find((c) => c.id === clipId);
      if (!clip || clip.kind !== "audio") {
        set({ statusMessage: "No audio clip to level-ride." });
        return;
      }
      set({ processing: true, statusMessage: "Riding vocal level…" });
      try {
        const region = await renderClipRegion(clip);
        if (!region) {
          set({ processing: false });
          return;
        }
        const ridden = levelRide(region);
        const asset = await registerRenderedAsset(ridden, `${clip.name} (rider)`);
        const dry = clip.dryAssetId ?? clip.assetId;
        touchProject((p) => ({
          ...p,
          assets: [...p.assets, asset],
          clips: p.clips.map((c) =>
            c.id === clipId
              ? { ...c, assetId: asset.id, dryAssetId: dry, offsetSec: 0, durationSec: ridden.duration, processedLabel: "Level-ridden" }
              : c
          ),
        }));
        set({ processing: false, statusMessage: "Vocal level-rider applied." });
        await get().saveNow();
      } catch (e) {
        set({ processing: false, statusMessage: "Level-ride failed: " + String(e) });
      }
    },

    // ---- Studio intelligence ----
    analyzeStudioIntelligence: async () => {
      set({ studioIntelligenceBusy: true, statusMessage: "Studio Intelligence: measuring project..." });
      try {
        const project = get().project;
        const snapshot = await runStudioIntelligence(
          project,
          (id) => audioEngine.getBuffer(id),
          project.studioIntelligence?.memory
        );
        touchProject((p) => ({
          ...p,
          studioIntelligence: {
            current: snapshot,
            history: [snapshot, ...(p.studioIntelligence?.history ?? [])].slice(0, 20),
            memory: normalizeStudioMemory(p.studioIntelligence?.memory),
          },
        }));
        set({
          studioIntelligenceReport: snapshot,
          studioIntelligenceBusy: false,
          statusMessage: `Studio Intelligence complete: ${snapshot.scores.overall}/100 overall, ${snapshot.recommendations.length} measured recommendation(s).`,
        });
        await get().saveNow();
      } catch (e) {
        set({ studioIntelligenceBusy: false, statusMessage: "Studio Intelligence failed: " + String(e) });
      }
    },

    applyFactoryFxPreset: (presetId, trackId) => {
      const preset = getFactoryPreset(presetId);
      if (!preset) {
        set({ statusMessage: "Preset not found." });
        return;
      }
      const effects = preset.build();
      if (preset.routing === "master") {
        touchProject((p) => ({
          ...p,
          master: { ...p.master, effects, bypass: false, presetName: preset.name },
          studioIntelligence: {
            current: p.studioIntelligence?.current ?? null,
            history: p.studioIntelligence?.history ?? [],
            memory: applyMemoryEvent(p.studioIntelligence?.memory, { kind: "preset", key: preset.id }),
          },
        }));
        audioEngine.setMasterChain(effects);
        audioEngine.setMasterBypass(false);
        set({ statusMessage: `Applied factory preset "${preset.name}" to master.` });
        return;
      }
      const tid = trackId ?? get().selectedTrackId;
      if (!tid) {
        set({ statusMessage: "Select a track first." });
        return;
      }
      touchProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === tid ? { ...t, effects, presetName: preset.name } : t)),
        studioIntelligence: {
          current: p.studioIntelligence?.current ?? null,
          history: p.studioIntelligence?.history ?? [],
          memory: applyMemoryEvent(p.studioIntelligence?.memory, {
            kind: "preset",
            key: preset.id,
            tone: {
              brightness: effects.eq.highGain > 2 ? 0.75 : effects.eq.highGain < 0 ? 0.35 : 0.55,
              dryness: (effects.reverb.enabled ? 0.45 : 0.75) - (effects.delay.enabled ? 0.12 : 0),
              saturation: effects.saturation.enabled ? Math.min(1, effects.saturation.drive / 10) : 0.2,
              width: effects.doubler.enabled ? effects.doubler.spread : 0.25,
            },
          }),
        },
      }));
      audioEngine.applyEffects(tid, effects);
      set({ statusMessage: `Applied factory preset "${preset.name}".` });
    },

    analyzeBeatIntelligence: async (clipId) => {
      const p = get().project;
      const target =
        (clipId ? p.clips.find((c) => c.id === clipId && c.kind === "audio") : null) ??
        (get().selectedClipId ? p.clips.find((c) => c.id === get().selectedClipId && c.kind === "audio") : null) ??
        [...p.clips]
          .filter((c) => c.kind === "audio")
          .sort((a, b) => b.durationSec - a.durationSec)[0];
      if (!target) {
        set({ statusMessage: "Import a beat or song first, then run Beat Intelligence." });
        return;
      }
      const buffer = audioEngine.getBuffer(target.assetId);
      if (!buffer) {
        set({ statusMessage: "Audio is still loading. Try again in a moment." });
        return;
      }
      set({ analyzing: true, statusMessage: "Beat Intelligence: detecting tempo, downbeats, sections, and key..." });
      try {
        const analysis = runBeatIntelligence(buffer, { clip: target, assetId: target.assetId, name: target.name });
        touchProject((project) => ({ ...project, beatIntelligence: analysis }));
        set({
          analyzing: false,
          statusMessage: `Beat Intelligence: ${analysis.bpm} BPM at ${Math.round(analysis.confidence * 100)}% confidence.`,
        });
        await get().saveNow();
      } catch (e) {
        set({ analyzing: false, statusMessage: "Beat Intelligence failed: " + String(e) });
      }
    },

    applyBeatTempoToProject: () => {
      const analysis = get().project.beatIntelligence;
      if (!analysis) {
        set({ statusMessage: "Run Beat Intelligence first." });
        return;
      }
      get().setTempo(analysis.bpm);
      touchProject((p) => {
        const existingAuto = p.markers.filter((m) => !m.name.startsWith("AI "));
        const sectionMarkers: Marker[] = analysis.breakdown.sections.map((section) => ({
          id: uid(),
          name: `AI ${section.name}`,
          timeSec: section.startSec,
          kind: "section",
          color: section.name === "Hook" ? "#3ddc97" : section.name === "Bridge" ? "#ff7ad9" : "#e8b341",
        }));
        return { ...p, markers: [...existingAuto, ...sectionMarkers].sort((a, b) => a.timeSec - b.timeSec) };
      });
      set({ statusMessage: `Project tempo set to ${analysis.bpm} BPM and AI section markers added.` });
    },

    autoAlignSelectedClipToGrid: () => {
      const clipId = get().selectedClipId;
      const analysis = get().project.beatIntelligence;
      if (!clipId || !analysis) {
        set({ statusMessage: "Select a clip and run Beat Intelligence first." });
        return;
      }
      const clip = get().project.clips.find((c) => c.id === clipId);
      if (!clip) return;
      const beatSec = 60 / analysis.bpm;
      const local = clip.startSec - analysis.downbeatSec;
      const aligned = Math.max(0, analysis.downbeatSec + Math.round(local / beatSec) * beatSec);
      touchProject((p) => ({
        ...p,
        clips: p.clips.map((c) => (c.id === clipId ? { ...c, startSec: aligned } : c)),
      }));
      set({ statusMessage: `Aligned "${clip.name}" to beat grid (${aligned.toFixed(2)}s).` });
    },

    analyzeTuneAssist: (clipId) => {
      const p = get().project;
      const clip =
        (clipId ? p.clips.find((c) => c.id === clipId && c.kind === "audio") : null) ??
        (get().selectedClipId ? p.clips.find((c) => c.id === get().selectedClipId && c.kind === "audio") : null);
      if (!clip) {
        set({ statusMessage: "Select a vocal audio clip for Tune Assist." });
        return;
      }
      const buffer = audioEngine.getBuffer(clip.assetId);
      if (!buffer) {
        set({ statusMessage: "Audio is still loading." });
        return;
      }
      const beatKey = p.beatIntelligence?.breakdown.keyEstimate;
      const keyIndex = beatKey ? Math.max(0, KEY_NAMES.indexOf(beatKey)) : get().tuneKey;
      const scale = p.beatIntelligence?.breakdown.scaleEstimate === "minor" ? "minor" : p.beatIntelligence?.breakdown.scaleEstimate === "major" ? "major" : get().tuneScale;
      const report = analyzeVocalTuneAssist(buffer, clip, {
        projectKey: beatKey,
        key: keyIndex < 0 ? get().tuneKey : keyIndex,
        scale,
        tempo: p.tempo,
      });
      touchProject((project) => ({ ...project, vocalTuneAssist: report }));
      set({ statusMessage: `Tune Assist: ${report.sharpFlat}, pitch ${report.pitchScore}/100.` });
    },

    applyTuneAssistSettings: () => {
      const report = get().project.vocalTuneAssist;
      if (!report) {
        set({ statusMessage: "Run Tune Assist first." });
        return;
      }
      set({
        tuneKey: report.suggestedKey,
        tuneScale: report.suggestedScale,
        tuneStrength: report.suggestedAutotuneStrength,
        tuneSpeed: report.suggestedRetuneSpeed,
        statusMessage: "Tune Assist settings loaded into Vocal Lab.",
      });
    },

    applyBedroomStudioCleaner: (trackId) => {
      const tid = trackId ?? get().selectedTrackId;
      if (!tid) {
        set({ statusMessage: "Select a vocal track first." });
        return;
      }
      const preset = getPreset("bedroom-studio-cleaner");
      if (!preset) {
        set({ statusMessage: "Bedroom Studio Cleaner preset is missing." });
        return;
      }
      const effects = preset.build();
      touchProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === tid ? { ...t, effects, presetName: preset.name } : t)),
      }));
      audioEngine.applyEffects(tid, effects);
      set({
        cleanOpts: {
          noiseReduction: 0.72,
          gate: true,
          breath: 0.55,
          declick: true,
          deEss: 0.62,
          harshness: 0.45,
          mud: 0.5,
          resonance: 0.42,
        },
        statusMessage: "Bedroom Studio Cleaner applied for condenser mics in untreated rooms.",
      });
    },

    completeWarmupDrill: (drillId) => {
      let feedback = "";
      touchProject((p) => {
        const warmups = normalizeVocalWarmups(p.vocalWarmups);
        const drills = warmups.drills.map((drill) => {
          if (drill.id !== drillId) return drill;
          feedback = warmupFeedback(drill, p.vocalTuneAssist);
          return { ...drill, completedAt: Date.now(), feedback };
        });
        return {
          ...p,
          vocalWarmups: {
            ...warmups,
            drills,
            lastFeedback: feedback ? [feedback, ...warmups.lastFeedback].slice(0, 12) : warmups.lastFeedback,
            updatedAt: Date.now(),
          },
        };
      });
      set({ statusMessage: feedback || "Warmup logged." });
    },

    setLiveDirectorEnabled: (enabled) =>
      touchProject((p) => ({
        ...p,
        liveVocalDirector: { ...normalizeLiveVocalDirector(p.liveVocalDirector), enabled },
      })),

    setLiveDirectorOpen: (open) =>
      touchProject((p) => ({
        ...p,
        liveVocalDirector: { ...normalizeLiveVocalDirector(p.liveVocalDirector), floatingOpen: open },
      })),

    setLiveDirectorMode: (mode) =>
      touchProject((p) => ({
        ...p,
        liveVocalDirector: { ...normalizeLiveVocalDirector(p.liveVocalDirector), mode },
      })),

    setLiveDirectorWarmupFocus: (focus) =>
      touchProject((p) => ({
        ...p,
        liveVocalDirector: { ...normalizeLiveVocalDirector(p.liveVocalDirector), warmupFocus: focus },
      })),

    completeLiveDirectorWarmup: (drillTitle) => {
      touchProject((p) => {
        const warmups = normalizeVocalWarmups(p.vocalWarmups);
        return {
          ...p,
          vocalWarmups: {
            ...warmups,
            lastFeedback: [`Live warmup done: ${drillTitle}.`, ...warmups.lastFeedback].slice(0, 12),
            updatedAt: Date.now(),
          },
        };
      });
      set({ statusMessage: `Warmup completed: ${drillTitle}` });
    },

    processLiveDirectorFrame: () => {
      const now = Date.now();
      if (now - lastLiveDirectorFrameAt < 360) return;
      lastLiveDirectorFrameAt = now;
      const p = get().project;
      const director = normalizeLiveVocalDirector(p.liveVocalDirector);
      if (!director.enabled || !get().recording) return;
      const raw = audioEngine.inputAnalysisFrame();
      if (!raw) return;
      const frame: LiveVocalFrame = {
        ...raw,
        tempo: p.tempo,
        mode: director.mode,
        targetKey: get().tuneKey,
        targetScale: get().tuneScale,
        lyricLines: p.lyricStudio?.lines ?? [],
        previousRms: previousLiveRms,
        previousPitchHz: previousLivePitchHz,
      };
      previousLiveRms = raw.rms;
      previousLivePitchHz = raw.pitchHz;
      const worker = ensureLiveDirectorWorker();
      if (worker) {
        touchProject((project) => ({
          ...project,
          liveVocalDirector: { ...normalizeLiveVocalDirector(project.liveVocalDirector), workerLive: true, status: "analyzing", lastFrameAt: now },
        }), "live-director-frame");
        worker.postMessage({ id: uid(), frame, frameTimeSec: raw.timeSec });
      } else {
        get().ingestLiveDirectorResult(analyzeLiveVocalFrame(frame), raw.timeSec);
      }
    },

    ingestLiveDirectorResult: (result, frameTimeSec) => {
      touchProject((p) => {
        const director = normalizeLiveVocalDirector(p.liveVocalDirector);
        const marker: LiveVocalMarker | null = result.marker
          ? { ...result.marker, id: uid(), createdAt: Date.now() }
          : null;
        const word: LiveWordFeedback | null = result.word
          ? { ...result.word, id: uid(), createdAt: Date.now() }
          : null;
        const tooClose = marker && director.markers.some((m) => Math.abs(m.timeSec - marker.timeSec) < 0.55 && m.kind === marker.kind);
        const markers = marker && !tooClose ? [...director.markers, marker].slice(-80) : director.markers;
        const wordFeedback = word ? [...director.wordFeedback, word].slice(-40) : director.wordFeedback;
        const coachNote = marker && !tooClose
          ? {
              id: uid(),
              clipId: null,
              trackId: get().selectedTrackId,
              timeSec: marker.timeSec,
              text: `${marker.message} ${marker.fix}`,
              kind: marker.severity === "ok" ? "note" as const : "issue" as const,
              severity: marker.severity,
              status: "open" as const,
              createdAt: Date.now(),
            }
          : null;
        return {
          ...p,
          coachNotes: coachNote ? [...(p.coachNotes ?? []), coachNote].slice(-160) : p.coachNotes,
          liveVocalDirector: {
            ...director,
            active: get().recording,
            status: get().recording ? "listening" : "summary-ready",
            currentScore: result.score,
            currentMessage: result.message,
            currentSeverity: result.severity,
            markers,
            wordFeedback,
            workerLive: !!liveDirectorWorker,
            lastFrameAt: Date.now(),
          },
        };
      }, `live-director:${Math.floor(frameTimeSec * 2)}`);
    },

    finalizeLiveDirectorTake: (takeName) => {
      touchProject((p) => {
        const director = normalizeLiveVocalDirector(p.liveVocalDirector);
        const recent = director.markers;
        const avg = recent.length ? Math.round(recent.reduce((sum, marker) => sum + marker.score, 0) / recent.length) : 82;
        const result = summarizeLiveTake(takeName ?? "Latest take", recent, avg, p.name);
        result.summary.id = uid();
        result.progress.id = uid();
        return {
          ...p,
          liveVocalDirector: {
            ...director,
            active: false,
            status: "summary-ready",
            currentScore: avg,
            currentMessage: avg >= 82 ? "Good take." : "Take captured. Review the redo zones.",
            currentSeverity: avg >= 82 ? "ok" : avg >= 65 ? "warn" : "bad",
            takeSummaries: [result.summary, ...director.takeSummaries].slice(0, 20),
            progress: [result.progress, ...director.progress].slice(0, 40),
            weeklySummary: result.weekly,
          },
        };
      });
    },

    replayLiveDirectorMarker: (markerId) => {
      const marker = normalizeLiveVocalDirector(get().project.liveVocalDirector).markers.find((m) => m.id === markerId);
      if (!marker) return;
      get().setLoopRegion(marker.timeSec, Math.max(marker.timeSec + 0.5, marker.endSec));
      get().seek(marker.timeSec);
      set({ statusMessage: `Replay zone: ${marker.message}` });
    },

    retakeLiveDirectorMarker: (markerId) => {
      const marker = normalizeLiveVocalDirector(get().project.liveVocalDirector).markers.find((m) => m.id === markerId);
      if (!marker) return;
      get().setLoopRegion(marker.timeSec, Math.max(marker.timeSec + 0.5, marker.endSec));
      get().seek(marker.timeSec);
      set({ statusMessage: `Retake loop ready: ${marker.fix}` });
    },

    clearLiveDirectorSession: () => {
      touchProject((p) => ({
        ...p,
        liveVocalDirector: {
          ...normalizeLiveVocalDirector(p.liveVocalDirector),
          markers: [],
          wordFeedback: [],
          currentScore: 0,
          currentMessage: "Live session cleared.",
          currentSeverity: "ok",
          status: "idle",
        },
      }));
    },

    updateBeatSearchFilters: (patch) => {
      touchProject(
        (p) => {
          const browser = normalizeBeatBrowser(p.beatBrowser);
          return { ...p, beatBrowser: { ...browser, filters: { ...browser.filters, ...patch } } };
        },
        "beat-search-filters"
      );
    },

    searchBeats: async () => {
      set({ statusMessage: "Searching beat library..." });
      touchProject((p) => {
        const browser = normalizeBeatBrowser(p.beatBrowser);
        return { ...p, beatBrowser: { ...browser, searchBusy: true } };
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      const project = get().project;
      const browser = normalizeBeatBrowser(project.beatBrowser);
      const results = searchBeatIndex(project, browser.filters).map((result) => ({
        ...result,
        favorite: browser.favorites.includes(result.id),
        pinnedProjectId: browser.pinnedBeatIds.includes(result.id) ? project.id : null,
        recentlyPlayedAt: browser.recentlyPlayed.includes(result.id) ? Date.now() : null,
      }));
      const queued = connectorSummary(browser.filters);
      touchProject((p) => ({
        ...p,
        beatBrowser: {
          ...normalizeBeatBrowser(p.beatBrowser),
          results,
          lastSearchAt: Date.now(),
          searchBusy: false,
          analysisQueue: results.map((r) => ({ id: uid(), resultId: r.id, kind: "waveform", status: "done" as const })),
        },
      }));
      set({ statusMessage: results.length ? `Found ${results.length} local beat result(s). ${queued}`.trim() : `No local beat matches yet. ${queued}`.trim() });
    },

    previewBeatResult: async (resultId) => {
      const browser = normalizeBeatBrowser(get().project.beatBrowser);
      const result = browser.results.find((r) => r.id === resultId);
      if (!result?.assetId) {
        set({ statusMessage: "This provider is queued. Add an official connector or import owned audio first." });
        return;
      }
      const buffer = audioEngine.getBuffer(result.assetId);
      if (!buffer) {
        set({ statusMessage: "Preview audio is still loading." });
        return;
      }
      await audioEngine.ensure();
      audioEngine.playSample(buffer, 0.82);
      touchProject((p) => {
        const b = normalizeBeatBrowser(p.beatBrowser);
        return {
          ...p,
          beatBrowser: {
            ...b,
            selectedResultId: resultId,
            recentlyPlayed: [resultId, ...b.recentlyPlayed.filter((id) => id !== resultId)].slice(0, 20),
            results: b.results.map((r) => (r.id === resultId ? { ...r, recentlyPlayedAt: Date.now() } : r)),
          },
        };
      });
      set({ statusMessage: `Previewing "${result.title}".` });
    },

    importBeatResultToTimeline: async (resultId, startSec = 0) => {
      const p = get().project;
      const browser = normalizeBeatBrowser(p.beatBrowser);
      const result = browser.results.find((r) => r.id === resultId);
      if (!result?.assetId) {
        set({ statusMessage: "Import requires local/owned audio. External connectors are scaffolded, not downloader-backed." });
        return;
      }
      const asset = p.assets.find((a) => a.id === result.assetId);
      const buffer = audioEngine.getBuffer(result.assetId);
      if (!asset || !buffer) {
        set({ statusMessage: "Beat asset is not ready." });
        return;
      }
      let beatTrack = p.tracks.find((t) => t.name.toLowerCase().includes("beat")) ?? null;
      if (!beatTrack) {
        const trackId = get().addTrack({ name: "Beat", busId: "music" });
        beatTrack = get().project.tracks.find((t) => t.id === trackId) ?? null;
      }
      if (!beatTrack) return;
      const clip: Clip = {
        id: uid(),
        trackId: beatTrack.id,
        assetId: asset.id,
        name: result.title,
        kind: "audio",
        startSec: Math.max(0, startSec),
        offsetSec: 0,
        durationSec: asset.durationSec,
        take: 1,
        gain: 1,
        fadeInSec: 0,
        fadeOutSec: 0,
        muted: false,
      };
      touchProject((project) => ({
        ...project,
        clips: [...project.clips, clip],
        lengthSec: Math.max(project.lengthSec, clip.startSec + asset.durationSec + 10),
        beatBrowser: { ...normalizeBeatBrowser(project.beatBrowser), selectedResultId: resultId },
      }));
      set({ selectedClipId: clip.id, selectedTrackId: beatTrack.id, statusMessage: `Imported "${result.title}" to the timeline.` });
      await get().analyzeBeatIntelligence(clip.id);
    },

    toggleBeatFavorite: (resultId) => {
      touchProject((p) => {
        const b = normalizeBeatBrowser(p.beatBrowser);
        const favorites = b.favorites.includes(resultId) ? b.favorites.filter((id) => id !== resultId) : [resultId, ...b.favorites];
        return {
          ...p,
          beatBrowser: {
            ...b,
            favorites,
            results: b.results.map((r) => (r.id === resultId ? { ...r, favorite: favorites.includes(resultId) } : r)),
          },
        };
      });
    },

    pinBeatToProject: (resultId) => {
      touchProject((p) => {
        const b = normalizeBeatBrowser(p.beatBrowser);
        const pinned = b.pinnedBeatIds.includes(resultId) ? b.pinnedBeatIds.filter((id) => id !== resultId) : [resultId, ...b.pinnedBeatIds];
        return {
          ...p,
          beatBrowser: {
            ...b,
            pinnedBeatIds: pinned,
            results: b.results.map((r) => (r.id === resultId ? { ...r, pinnedProjectId: pinned.includes(resultId) ? p.id : null } : r)),
          },
        };
      });
      set({ statusMessage: "Beat pin updated for this project." });
    },

    addBeatCrate: (name, mood = "custom") => {
      const clean = name.trim();
      if (!clean) return;
      touchProject((p) => {
        const b = normalizeBeatBrowser(p.beatBrowser);
        const crate = { id: uid(), name: clean, mood, resultIds: [], createdAt: Date.now(), updatedAt: Date.now() };
        return { ...p, beatBrowser: { ...b, crates: [crate, ...b.crates] } };
      });
    },

    addBeatToCrate: (crateId, resultId) => {
      touchProject((p) => {
        const b = normalizeBeatBrowser(p.beatBrowser);
        return {
          ...p,
          beatBrowser: {
            ...b,
            crates: b.crates.map((crate) =>
              crate.id === crateId
                ? { ...crate, resultIds: [resultId, ...crate.resultIds.filter((id) => id !== resultId)], updatedAt: Date.now() }
                : crate
            ),
          },
        };
      });
      set({ statusMessage: "Beat added to crate." });
    },

    setYouTubeImportUrl: (url) => {
      const clean = url.trim();
      const valid = !clean || /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(clean);
      touchProject((p) => {
        const b = normalizeBeatBrowser(p.beatBrowser);
        return {
          ...p,
          beatBrowser: {
            ...b,
            youtubeImport: {
              ...b.youtubeImport,
              url: clean,
              status: valid && clean ? "metadata-ready" : clean ? "blocked" : "idle",
              note: valid
                ? "URL saved for attribution. Attach audio you own or are licensed to use; Panther will analyze and place that file."
                : "Only YouTube URLs are accepted here. Panther will not download or bypass platform restrictions.",
            },
          },
        };
      }, "youtube-import-url");
    },

    importYouTubeOwnedAudio: async (file) => {
      const browser = normalizeBeatBrowser(get().project.beatBrowser);
      if (!browser.youtubeImport.url || browser.youtubeImport.status === "blocked") {
        set({ statusMessage: "Paste a valid YouTube URL first so Panther can track the source metadata." });
        return;
      }
      await audioEngine.ensure();
      try {
        const raw = await file.arrayBuffer();
        const blob = new Blob([raw.slice(0)], { type: file.type || "audio/wav" });
        const buffer = await audioEngine.decodeBlob(blob);
        const assetId = uid();
        await db.saveBlob(assetId, get().project.id, blob);
        audioEngine.registerBuffer(assetId, buffer);
        mixToMono(assetId, buffer);
        const asset: AudioAsset = {
          id: assetId,
          name: file.name,
          mime: blob.type,
          durationSec: buffer.duration,
          sampleRate: buffer.sampleRate,
          numChannels: buffer.numberOfChannels,
          length: buffer.length,
          createdAt: Date.now(),
        };
        let beatTrack = get().project.tracks.find((t) => t.name.toLowerCase().includes("beat")) ?? null;
        if (!beatTrack) {
          const trackId = get().addTrack({ name: "Beat", busId: "music" });
          beatTrack = get().project.tracks.find((t) => t.id === trackId) ?? null;
        }
        if (!beatTrack) return;
        const clip: Clip = {
          id: uid(),
          trackId: beatTrack.id,
          assetId,
          name: file.name.replace(/\.[^.]+$/, ""),
          kind: "audio",
          startSec: 0,
          offsetSec: 0,
          durationSec: buffer.duration,
          take: 1,
          gain: 1,
          fadeInSec: 0,
          fadeOutSec: 0,
          muted: false,
        };
        touchProject((p) => ({
          ...p,
          assets: [...p.assets, asset],
          clips: [...p.clips, clip],
          lengthSec: Math.max(p.lengthSec, buffer.duration + 10),
          beatBrowser: {
            ...normalizeBeatBrowser(p.beatBrowser),
            youtubeImport: { ...normalizeBeatBrowser(p.beatBrowser).youtubeImport, status: "imported", importedAssetId: assetId },
          },
        }));
        set({ selectedClipId: clip.id, selectedTrackId: beatTrack.id, statusMessage: "Imported owned audio with YouTube source metadata." });
        await get().analyzeBeatIntelligence(clip.id);
        await get().searchBeats();
      } catch (e) {
        set({ statusMessage: "YouTube-safe import failed: " + String(e) });
      }
    },

    enableArtistMode: async () => {
      const trackId = get().selectedTrackId ?? get().project.tracks[0]?.id ?? null;
      if (trackId) {
        get().applyBedroomStudioCleaner(trackId);
        touchProject((p) => ({
          ...p,
          tracks: p.tracks.map((t) => ({ ...t, armed: t.id === trackId, monitor: t.id === trackId })),
          vocalSession: { ...defaultVocalSession(), ...(p.vocalSession ?? {}), punchIn: true, loopRecord: true, stackMode: "lead" },
        }));
      }
      set({ lowCpuMode: true, monitorMode: "wet", statusMessage: "Artist Mode armed: wet monitor route, cleanup chain, low-latency focus, and vocal session loop tools." });
      audioEngine.setLowCpu(true);
      audioEngine.setMonitorMode("wet");
      updateMonitorRoute();
      await persistSettings({ lowCpuMode: true, monitorMode: "wet" });
    },

    runSessionAI: async () => {
      set({ statusMessage: "Session AI is listening to project state: mix, beat grid, arrangement, clipping, and vocal stack opportunities." });
      await get().analyzeStudioIntelligence();
      await get().analyzeMixNow();
      const audioClip = get().project.clips.find((c) => c.kind === "audio");
      if (audioClip) await get().analyzeBeatIntelligence(audioClip.id);
      get().runPerformanceGuardian("Session AI");
      set({ statusMessage: "Session AI updated EQ, loudness, clipping, vocal layering, arrangement, and performance suggestions." });
    },

    applyStudioRecommendation: async (recommendationId) => {
      const rec = get().project.studioIntelligence?.current?.recommendations.find((r) => r.id === recommendationId);
      if (!rec) {
        set({ statusMessage: "Recommendation no longer exists. Re-analyze the project." });
        return;
      }
      const markAccepted = (p: Project) => ({
        ...p,
        studioIntelligence: {
          current: p.studioIntelligence?.current
            ? {
                ...p.studioIntelligence.current,
                recommendations: p.studioIntelligence.current.recommendations.filter((r) => r.id !== recommendationId),
              }
            : null,
          history: p.studioIntelligence?.history ?? [],
          memory: applyMemoryEvent(p.studioIntelligence?.memory, { kind: "accepted", key: rec.action?.kind ?? rec.domain }),
        },
      });
      if (!rec.action) {
        touchProject(markAccepted);
        set({ statusMessage: "Recommendation acknowledged." });
        return;
      }
      const action = rec.action;
      switch (action.kind) {
        case "cleanup-vocal":
          touchProject(markAccepted);
          await get().applyCleanup(action.clipId, true);
          break;
        case "autotune":
          touchProject(markAccepted);
          await get().applyAutotune(action.clipId);
          break;
        case "level-ride":
          touchProject(markAccepted);
          await get().levelRideClip(action.clipId);
          break;
        case "track-preset":
          get().applyFactoryFxPreset(action.presetId, action.trackId);
          touchProject(markAccepted);
          break;
        case "master-target": {
          const target =
            action.target === "youtube" ? "youtube" :
            action.target === "tiktok" ? "tiktok" :
            action.target === "podcast" ? "quiet-podcast" :
            action.target === "loud-demo" ? "loud" :
            action.target === "dynamic" ? "clean-pop" :
            "streaming";
          touchProject(markAccepted);
          await get().autoMaster(target);
          break;
        }
        case "auto-gain-stage":
          touchProject(markAccepted);
          await get().autoGainStage();
          break;
        case "stereo-width":
          touchProject((p) => markAccepted({ ...p, stereoWidth: action.value, monoBelowHz: action.monoBelowHz ?? p.monoBelowHz }));
          set({ statusMessage: "Stereo/mono translation settings updated." });
          break;
        case "add-marker":
          touchProject((p) => markAccepted({
            ...p,
            markers: [...p.markers, { id: uid(), name: action.name, timeSec: action.timeSec, kind: "marker", color: "#39d3e0" }],
          }));
          set({ statusMessage: "Analysis marker added." });
          break;
        case "double-vocal":
          touchProject(markAccepted);
          get().addDoubleTrack(action.clipId);
          break;
        case "harmony-draft":
          touchProject(markAccepted);
          await get().addHarmonyDraft(action.clipId);
          break;
        case "notes":
          touchProject(markAccepted);
          get().addIdeaToNotes(action.text);
          break;
      }
      set({ studioIntelligenceReport: get().project.studioIntelligence?.current ?? null });
      await get().saveNow();
    },

    rejectStudioRecommendation: (recommendationId) => {
      const rec = get().project.studioIntelligence?.current?.recommendations.find((r) => r.id === recommendationId);
      if (!rec) return;
      touchProject((p) => ({
        ...p,
        studioIntelligence: {
          current: p.studioIntelligence?.current
            ? {
                ...p.studioIntelligence.current,
                recommendations: p.studioIntelligence.current.recommendations.filter((r) => r.id !== recommendationId),
              }
            : null,
          history: p.studioIntelligence?.history ?? [],
          memory: applyMemoryEvent(p.studioIntelligence?.memory, { kind: "rejected", key: rec.action?.kind ?? rec.domain }),
        },
      }));
      set({ studioIntelligenceReport: get().project.studioIntelligence?.current ?? null, statusMessage: "Recommendation rejected and learned locally." });
    },

    updateMoodBoard: (patch) => {
      touchProject((p) => ({
        ...p,
        moodBoard: { ...defaultMoodBoard(), ...(p.moodBoard ?? {}), ...patch },
      }), "moodboard");
    },

    setProducerNotes: (text) => {
      touchProject((p) => ({ ...p, producerNotes: text }), "producer-notes");
    },

    smartStartProject: async (intent) => {
      const names = {
        record: "Vocal Session",
        beat: "Beat Sketch",
        mix: "Mix Session",
        master: "Master Prep",
        idea: "Quick Idea",
      };
      await get().newProject(`${names[intent]} ${new Date().toLocaleDateString()}`);
      if (intent === "record") {
        get().addSongSection("Intro");
        set({ micPanelOpen: true, statusMessage: "Record a Song: choose a mic, arm the vocal track, then press Record." });
      } else if (intent === "beat") {
        set({ builderOpen: true, statusMessage: "Make a Beat: pick a mood or type a prompt in Instrumental Builder." });
      } else if (intent === "mix") {
        set({ libraryOpen: true, statusMessage: "Mix a Song: import audio or a bundle, then run Mix Assist and Intelligence." });
      } else if (intent === "master") {
        set({ statusMessage: "Master/export: import a finished mix, run loudness analysis, then export WAV." });
      } else {
        await get().quickIdeaCapture();
        return;
      }
      recordSmartHistory("Smart Start session created", `Started from the ${intent} workflow.`, "creative");
      await get().saveNow();
    },

    quickIdeaCapture: async () => {
      if (get().view !== "studio") {
        await get().newProject(`Idea ${new Date().toLocaleString()}`);
      }
      recordSmartHistory("Quick Idea Capture armed", "Created an autosaved idea project and prepared the mic recorder.", "recording");
      await get().saveNow();
      try {
        if (!audioEngine.hasInput()) await get().enableInput();
        if (audioEngine.hasInput() && !get().recording) {
          await get().toggleRecord();
          set({ statusMessage: "Quick Idea Capture recording. Press Record again to stop and keep the take." });
        } else {
          set({ micPanelOpen: true, statusMessage: "Quick Idea Capture is ready. Enable a mic to start recording." });
        }
      } catch (e) {
        set({ micPanelOpen: true, statusMessage: "Quick Idea Capture needs a microphone: " + String(e) });
      }
    },

    saveIdeaSnapshot: async (name) => {
      const source = get().project;
      const snapshotProject = JSON.parse(JSON.stringify({ ...source, ideaSnapshots: undefined })) as Omit<Project, "ideaSnapshots">;
      const summary = `${source.tracks.length} tracks, ${source.clips.length} clips, ${source.markers.length} markers`;
      const snap: IdeaSnapshot = {
        id: uid(),
        name: name?.trim() || `Snapshot ${new Date().toLocaleTimeString()}`,
        createdAt: Date.now(),
        project: snapshotProject,
        summary,
      };
      touchProject((p) => ({ ...p, ideaSnapshots: [snap, ...(p.ideaSnapshots ?? [])].slice(0, 12) }));
      recordSmartHistory("Idea snapshot saved", `${snap.name}: ${summary}.`, "recovery");
      await get().saveNow();
      set({ statusMessage: `Saved idea snapshot "${snap.name}".` });
    },

    restoreIdeaSnapshot: async (id) => {
      const snap = get().project.ideaSnapshots?.find((s) => s.id === id);
      if (!snap) return;
      const keepSnapshots = get().project.ideaSnapshots ?? [];
      const restored = normalizeProject({
        ...JSON.parse(JSON.stringify(snap.project)),
        id: get().project.id,
        profileId: get().currentProfileId,
        ideaSnapshots: keepSnapshots,
        smartHistory: get().project.smartHistory ?? [],
        updatedAt: Date.now(),
      } as Project);
      set({
        project: restored,
        selectedTrackId: restored.tracks[0]?.id ?? null,
        selectedClipId: null,
        dirty: true,
        studioIntelligenceReport: restored.studioIntelligence?.current ?? null,
      });
      reconcileEngine();
      recordSmartHistory("Idea snapshot restored", `Restored "${snap.name}" for comparison.`, "recovery");
      await get().saveNow();
      set({ statusMessage: `Restored snapshot "${snap.name}".` });
    },

    makeItHit: async () => {
      const tid = get().selectedTrackId;
      if (tid) {
        get().applyFactoryFxPreset("bring-vocal-forward", tid);
      }
      touchProject((p) => ({
        ...p,
        masterGain: Math.min(1.2, Math.max(p.masterGain, 1.03)),
        stereoWidth: Math.max(p.stereoWidth ?? 1, 1.08),
        monoBelowHz: p.monoBelowHz || 110,
      }));
      audioEngine.setMasterGain(get().project.masterGain);
      recordSmartHistory("Make It Hit applied", "Added safe punch, vocal forwardness, width, and mono-safe low-end settings.", "mix");
      set({ statusMessage: "Make It Hit applied: punch, vocal forwardness, width, and mono-safe low end." });
      await get().saveNow();
    },

    makeItEmotional: async () => {
      const tid = get().selectedTrackId;
      if (tid) {
        get().applyFactoryFxPreset("intimate-verse", tid);
      }
      touchProject((p) => ({
        ...p,
        stereoWidth: Math.max(p.stereoWidth ?? 1, 1.12),
        markers: p.markers.some((m) => m.name === "Delay throw moment")
          ? p.markers
          : [...p.markers, { id: uid(), name: "Delay throw moment", timeSec: get().positionSec, kind: "marker", color: "#ff7ad9" }],
      }));
      recordSmartHistory("Make It Emotional applied", "Softened the selected vocal chain, widened the moment, and marked a delay-throw idea.", "creative");
      set({ statusMessage: "Make It Emotional applied: intimate vocal tone, width, and a delay-throw marker." });
      await get().saveNow();
    },

    creativePanic: async (kind) => {
      const selectedTrack = get().selectedTrackId;
      const selectedClip = get().selectedClipId;
      const actions: Record<typeof kind, { title: string; detail: string; preset?: string; width?: number; master?: LoudnessTarget; stack?: boolean; emotional?: boolean }> = {
        harder: { title: "Make This Hit Harder", detail: "Added punch, controlled saturation, and safer loudness pressure.", preset: "bring-vocal-forward", width: 1.08, master: "loud" },
        hook: { title: "Make Hook Bigger", detail: "Widened the moment and prepared a doubled hook treatment.", preset: "wide-hook-double", width: 1.18, stack: true },
        emotional: { title: "Make It More Emotional", detail: "Softened the vocal, added space, and marked an emotional delay-throw idea.", preset: "intimate-verse", width: 1.12, emotional: true },
        space: { title: "More Space", detail: "Opened stereo width and chose a roomier time-FX direction.", preset: "adlib-space", width: 1.2 },
        clean: { title: "Cleaner Vocals", detail: "Applied a clear vocal preset and prepared cleanup-safe settings.", preset: "bring-vocal-forward", width: 1.02 },
        aggressive: { title: "More Aggressive", detail: "Pushed presence, compression, saturation, and forward vocal energy.", preset: "bring-vocal-forward", width: 1.05, master: "loud" },
        intimate: { title: "More Intimate", detail: "Reduced size, made the vocal closer, and kept width controlled.", preset: "intimate-verse", width: 0.92 },
        cinematic: { title: "More Cinematic", detail: "Widened the scene and pushed lush depth without burying the vocal.", preset: "cinematic-pad-space", width: 1.24, emotional: true },
      };
      const action = actions[kind];
      if (selectedTrack && action.preset) get().applyFactoryFxPreset(action.preset, selectedTrack);
      if (action.stack && selectedClip) get().createVocalStack(selectedClip);
      if (action.emotional) await get().makeItEmotional();
      if (action.width) touchProject((p) => ({ ...p, stereoWidth: action.width, monoBelowHz: p.monoBelowHz || 110 }));
      if (action.master) await get().autoMaster(action.master);
      recordSmartHistory(action.title, `${action.detail} Why this works: it changes level, tone, width, and movement together instead of one isolated knob.`, "creative");
      get().learnCurrentSession(`panic:${kind}`);
      set({ statusMessage: action.title });
      await get().saveNow();
    },

    runPerformanceGuardian: (reason) => {
      const health = projectComplexityHealth(reason);
      set((s) => ({
        performanceHealth: health,
        project: { ...s.project, performanceHealth: health },
        statusMessage:
          health.risk === "low"
            ? "Performance Guardian: project is healthy."
            : `Performance Guardian: ${health.risk} risk. ${health.suggestions[0]}`,
      }));
      if (health.risk === "high" && !get().lowCpuMode) {
        get().setLowCpuMode(true);
        recordSmartHistory("Performance Guardian enabled Low-CPU mode", health.suggestions.join(" "), "performance");
      }
      if (health.risk === "emergency") {
        get().enableEmergencySafeMode();
      }
    },

    enableEmergencySafeMode: () => {
      audioEngine.stop();
      audioEngine.setLowCpu(true);
      set({
        playing: false,
        recording: false,
        lowCpuMode: true,
        disableVisualizers: true,
        studioMode: false,
        liveSessionMode: false,
        statusMessage: "Emergency Safe Mode: playback stopped, analyzers disabled, Low-CPU mode enabled.",
      });
      void persistSettings({ lowCpuMode: true, disableVisualizers: true });
      recordSmartHistory("Emergency Safe Mode enabled", "Stopped playback and disabled costly visuals to rescue the project.", "performance");
    },

    generateStressTestProject: async () => {
      await get().applySessionTemplate("beatmaking");
      const prompts = [
        "trap drum groove in C minor 8 bar hook",
        "808 bass line in C minor 8 bar hook",
        "minor piano chord progression in C minor 8 bars",
        "lead melody in C minor 8 bar hook",
      ];
      for (let i = 0; i < 3; i++) {
        for (const prompt of prompts) get().composeFromPrompt(prompt);
      }
      touchProject((p) => ({
        ...p,
        tracks: p.tracks.map((t, i) => ({
          ...t,
          effects: i % 2 === 0
            ? { ...t.effects, eq: { ...t.effects.eq, enabled: true, midGain: 1.5 }, compressor: { ...t.effects.compressor, enabled: true }, reverb: { ...t.effects.reverb, enabled: true, mix: 0.08 } }
            : t.effects,
        })),
      }));
      reconcileEngine();
      get().runPerformanceGuardian("stress-test");
      set({ statusMessage: "Stress test project generated with dense MIDI tracks and live FX." });
    },

    setStudioMode: (on) => {
      set({ studioMode: on });
      if (on) set({ disableVisualizers: false });
    },

    setLiveSessionMode: (on) => {
      set({ liveSessionMode: on });
      if (on) {
        get().setLowCpuMode(true);
        set({ disableVisualizers: true });
      }
    },

    // ---- Optimization ----
    freezeTrack: async (trackId) => {
      const p = get().project;
      const track = p.tracks.find((t) => t.id === trackId);
      if (!track || track.frozen) return;
      const trackClips = p.clips.filter((c) => c.trackId === trackId && !c.muted);
      if (trackClips.length === 0) {
        set({ statusMessage: "Nothing to freeze on this track." });
        return;
      }
      set({ processing: true, statusMessage: `Freezing ${track.name}…` });
      try {
        const stem = await renderStem(p, (id) => audioEngine.getBuffer(id), trackId);
        const asset = await registerRenderedAsset(stem, `${track.name} (frozen)`);
        const frozenClipId = uid();
        const mutedClipIds = trackClips.map((c) => c.id);
        const prevEffects = JSON.parse(JSON.stringify(track.effects)) as EffectsState;
        const frozenClip: Clip = {
          id: frozenClipId,
          trackId,
          assetId: asset.id,
          name: `${track.name} ❄`,
          kind: "audio",
          startSec: 0,
          offsetSec: 0,
          durationSec: stem.duration,
          take: 1,
          gain: 1,
          fadeInSec: 0,
          fadeOutSec: 0,
          muted: false,
        };
        const neutral = defaultEffects();
        touchProject((pp) => ({
          ...pp,
          assets: [...pp.assets, asset],
          clips: [
            ...pp.clips.map((c) => (mutedClipIds.includes(c.id) ? { ...c, muted: true } : c)),
            frozenClip,
          ],
          tracks: pp.tracks.map((t) =>
            t.id === trackId
              ? { ...t, effects: neutral, frozen: { assetId: asset.id, clipId: frozenClipId, effects: prevEffects, mutedClipIds } }
              : t
          ),
        }));
        audioEngine.applyEffects(trackId, neutral);
        set({ processing: false, statusMessage: `${track.name} frozen (FX rendered, CPU freed).` });
        await get().saveNow();
      } catch (e) {
        set({ processing: false, statusMessage: "Freeze failed: " + String(e) });
      }
    },

    unfreezeTrack: (trackId) => {
      const track = get().project.tracks.find((t) => t.id === trackId);
      if (!track || !track.frozen) return;
      const { clipId, effects, mutedClipIds, assetId } = track.frozen;
      touchProject((p) => ({
        ...p,
        clips: p.clips
          .filter((c) => c.id !== clipId)
          .map((c) => (mutedClipIds.includes(c.id) ? { ...c, muted: false } : c)),
        assets: p.assets.filter((a) => a.id !== assetId),
        tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, effects, frozen: null } : t)),
      }));
      dropMono(assetId);
      void db.deleteBlob(assetId);
      audioEngine.applyEffects(trackId, effects);
      set({ statusMessage: `${track.name} unfrozen.` });
    },

    bounceTrack: async (trackId) => {
      const p = get().project;
      const track = p.tracks.find((t) => t.id === trackId);
      if (!track) return;
      set({ processing: true, statusMessage: `Bouncing ${track.name}…` });
      try {
        const stem = await renderStem(p, (id) => audioEngine.getBuffer(id), trackId);
        const asset = await registerRenderedAsset(stem, `${track.name} (bounce)`);
        const tid = get().addTrack({ name: `${track.name} Bounce`, busId: track.busId ?? undefined });
        const clip: Clip = {
          id: uid(), trackId: tid, assetId: asset.id, name: `${track.name} (bounce)`,
          kind: "audio", startSec: 0, offsetSec: 0, durationSec: stem.duration,
          take: 1, gain: 1, fadeInSec: 0, fadeOutSec: 0, muted: false,
        };
        touchProject((pp) => ({ ...pp, assets: [...pp.assets, asset], clips: [...pp.clips, clip] }));
        applyAllTrackParams();
        set({ processing: false, statusMessage: `${track.name} bounced to a new audio track.` });
        await get().saveNow();
      } catch (e) {
        set({ processing: false, statusMessage: "Bounce failed: " + String(e) });
      }
    },

    clearUnusedAudio: async () => {
      const p = get().project;
      // Asset ids referenced by clips, pads, reference, frozen, or dryAssetId.
      const keep = new Set<string>();
      for (const c of p.clips) {
        if (c.assetId) keep.add(c.assetId);
        if (c.dryAssetId) keep.add(c.dryAssetId);
      }
      for (const pad of p.pads) keep.add(pad.assetId);
      if (p.reference) keep.add(p.reference.assetId);
      for (const t of p.tracks) if (t.frozen) keep.add(t.frozen.assetId);
      // Drop asset metadata not in keep, and prune their blobs.
      const before = p.assets.length;
      const removed = p.assets.filter((a) => !keep.has(a.id));
      touchProject((pp) => ({ ...pp, assets: pp.assets.filter((a) => keep.has(a.id)) }));
      for (const a of removed) {
        dropMono(a.id);
      }
      await db.pruneBlobs(p.id, keep);
      await get().saveNow();
      set({ statusMessage: `Cleared ${before - get().project.assets.length} unused audio file(s).` });
    },

    projectCleanup: async () => {
      // Remove empty tracks (no clips), then clear unused audio.
      const p = get().project;
      const usedTrackIds = new Set(p.clips.map((c) => c.trackId));
      const emptyRemovable = p.tracks.filter((t) => !usedTrackIds.has(t.id) && p.tracks.length > 1);
      if (emptyRemovable.length > 0) {
        touchProject((pp) => ({
          ...pp,
          tracks: pp.tracks.filter((t) => usedTrackIds.has(t.id) || pp.tracks.length === 1),
        }));
        for (const t of emptyRemovable) audioEngine.removeTrack(t.id);
      }
      await get().clearUnusedAudio();
      set({ statusMessage: `Cleanup done — removed ${emptyRemovable.length} empty track(s) and unused audio.` });
    },

    // ---- Vocal Coach ----
    analyzeTake: (clipId) => {
      const s = get();
      const clip = s.project.clips.find((c) => c.id === clipId);
      if (!clip || clip.kind !== "audio") {
        set({ statusMessage: "Select a recorded vocal clip to analyze." });
        return;
      }
      const buffer = audioEngine.getBuffer(clip.assetId);
      if (!buffer) {
        set({ statusMessage: "Audio is still loading." });
        return;
      }
      const result = analyzeTake(buffer, {
        tempo: s.project.tempo,
        key: s.tuneKey,
        scale: s.tuneScale,
        clipStartSec: clip.startSec,
      });
      // Persist markers (absolute time) and a score history entry.
      const notes: CoachNote[] = result.markers.map((m) => ({
        id: uid(),
        clipId,
        trackId: clip.trackId,
        timeSec: clip.startSec + m.timeSec,
        text: m.text,
        kind: m.kind,
        severity: m.severity,
        status: "open" as const,
        createdAt: Date.now(),
      }));
      const entry: CoachScoreEntry = {
        id: uid(),
        clipId,
        clipName: clip.name,
        when: Date.now(),
        scores: result.scores,
      };
      touchProject((p) => ({
        ...p,
        coachNotes: [...(p.coachNotes ?? []).filter((n) => n.clipId !== clipId), ...notes],
        coachHistory: [entry, ...(p.coachHistory ?? [])].slice(0, 100),
      }));
      set({ coachResult: { clipId, result }, statusMessage: `Take analyzed — overall ${result.scores.overall}/100.` });
    },

    createPunchIn: (clipId) => {
      const r = get().coachResult;
      const clip = get().project.clips.find((c) => c.id === clipId);
      if (!r || r.clipId !== clipId || !r.result.punchIn || !clip) {
        set({ statusMessage: "Analyze the take first to find a punch-in region." });
        return;
      }
      const start = clip.startSec + r.result.punchIn.startSec;
      const end = clip.startSec + r.result.punchIn.endSec;
      get().setLoopRegion(start, Math.max(start + 0.3, end));
      set({ statusMessage: "Punch-in loop region set around the flagged phrase." });
    },

    applySafeFixes: async (clipId) => {
      const clip = get().project.clips.find((c) => c.id === clipId);
      if (!clip || clip.kind !== "audio") return;
      set({ processing: true, statusMessage: "Applying safe vocal fixes…" });
      try {
        const region = await renderClipRegion(clip);
        if (!region) {
          set({ processing: false });
          return;
        }
        // Conservative cleanup that won't damage a good take.
        const cleaned = await cleanVocal(region, {
          noiseReduction: 0.4, gate: false, breath: 0.3, declick: true,
          deEss: 0.4, harshness: 0.3, mud: 0.25, resonance: 0.2,
        });
        const asset = await registerRenderedAsset(cleaned, `${clip.name} (safe-fix)`);
        const dry = clip.dryAssetId ?? clip.assetId;
        // Add a gentle presence lift on the track EQ.
        const track = get().project.tracks.find((t) => t.id === clip.trackId);
        const fx = track ? (JSON.parse(JSON.stringify(track.effects)) as EffectsState) : null;
        if (fx) {
          fx.eq.enabled = true;
          fx.eq.midGain = Math.max(fx.eq.midGain, 2);
          fx.eq.midFreq = 2600;
        }
        touchProject((p) => ({
          ...p,
          assets: [...p.assets, asset],
          clips: p.clips.map((c) =>
            c.id === clipId ? { ...c, assetId: asset.id, dryAssetId: dry, offsetSec: 0, durationSec: cleaned.duration, processedLabel: "Safe-fixed" } : c
          ),
          tracks: fx ? p.tracks.map((t) => (t.id === clip.trackId ? { ...t, effects: fx } : t)) : p.tracks,
        }));
        if (fx && track) audioEngine.applyEffects(track.id, fx);
        set({ processing: false, statusMessage: "Safe fixes applied (de-ess, harshness, breath, presence)." });
        await get().saveNow();
      } catch (e) {
        set({ processing: false, statusMessage: "Safe fixes failed: " + String(e) });
      }
    },

    addDoubleTrack: (clipId) => {
      const clip = get().project.clips.find((c) => c.id === clipId);
      if (!clip) return;
      const tid = get().addTrack({ name: `${clip.name} Double`, busId: "vocals" });
      const newClip: Clip = {
        ...JSON.parse(JSON.stringify(clip)),
        id: uid(),
        trackId: tid,
        name: `${clip.name} (double)`,
        take: 1,
        gain: 0.8,
        dryAssetId: undefined,
        processedLabel: undefined,
      };
      touchProject((p) => ({
        ...p,
        clips: [...p.clips, newClip],
        tracks: p.tracks.map((t) => (t.id === tid ? { ...t, pan: 0.25 } : t)),
      }));
      applyAllTrackParams();
      set({ statusMessage: "Doubled vocal added on a new track (panned). Pan the original opposite for width." });
    },

    addHarmonyDraft: async (clipId) => {
      const clip = get().project.clips.find((c) => c.id === clipId);
      if (!clip || clip.kind !== "audio") return;
      set({ processing: true, statusMessage: "Rendering harmony draft (+3 semitones)…" });
      try {
        const region = await renderClipRegion(clip);
        if (!region) {
          set({ processing: false });
          return;
        }
        const shifted = pitchShiftConstant(region, 3);
        const asset = await registerRenderedAsset(shifted, `${clip.name} (harmony)`);
        const tid = get().addTrack({ name: `${clip.name} Harmony`, busId: "vocals" });
        const newClip: Clip = {
          id: uid(),
          trackId: tid,
          assetId: asset.id,
          name: `${clip.name} (harmony +3)`,
          kind: "audio",
          startSec: clip.startSec,
          offsetSec: 0,
          durationSec: shifted.duration,
          take: 1,
          gain: 0.7,
          fadeInSec: 0,
          fadeOutSec: 0,
          muted: false,
        };
        touchProject((p) => ({ ...p, assets: [...p.assets, asset], clips: [...p.clips, newClip] }));
        applyAllTrackParams();
        set({ processing: false, statusMessage: "Harmony draft added (+3 semitones). Adjust to taste." });
        await get().saveNow();
      } catch (e) {
        set({ processing: false, statusMessage: "Harmony draft failed: " + String(e) });
      }
    },

    addIdeaToNotes: (text) => {
      const stamp = new Date().toLocaleString();
      touchProject((p) => ({
        ...p,
        lyrics: `${p.lyrics ?? ""}${p.lyrics ? "\n" : ""}• [${stamp}] ${text}`.trim(),
      }));
      set({ statusMessage: "Idea saved to project notes." });
    },

    clearCoachNotes: () => {
      touchProject((p) => ({ ...p, coachNotes: [] }));
      set({ coachResult: null, statusMessage: "Coach markers cleared." });
    },

    createVocalStack: (clipId) => {
      const source =
        (clipId ? get().project.clips.find((c) => c.id === clipId) : null) ??
        (get().selectedClipId ? get().project.clips.find((c) => c.id === get().selectedClipId) : null) ??
        get().project.clips.find((c) => c.kind === "audio");
      if (!source) {
        set({ statusMessage: "Record or select a vocal clip first." });
        return;
      }
      const roles: Array<{ name: string; pan: number; gain: number; preset: string; shift?: number }> = [
        { name: "Lead", pan: 0, gain: 1, preset: "bring-vocal-forward" },
        { name: "Double L", pan: -0.26, gain: 0.72, preset: "double-wide" },
        { name: "Double R", pan: 0.26, gain: 0.72, preset: "double-wide" },
        { name: "Ad-Lib", pan: 0.12, gain: 0.58, preset: "adlib-space" },
      ];
      const newTracks: Track[] = [];
      const newClips: Clip[] = [];
      for (const role of roles) {
        const tr = newTrack(get().project.tracks.length + newTracks.length);
        tr.name = `${source.name} ${role.name}`;
        tr.busId = "vocals";
        tr.pan = role.pan;
        tr.armed = false;
        const preset = getFactoryPreset(role.preset);
        if (preset) {
          tr.effects = preset.build();
          tr.presetName = preset.name;
        }
        newTracks.push(tr);
        newClips.push({
          ...JSON.parse(JSON.stringify(source)),
          id: uid(),
          trackId: tr.id,
          name: `${source.name} ${role.name}`,
          gain: role.gain,
          take: 1,
          compRole: role.name === "Lead" ? "chosen" : "candidate",
          dryAssetId: undefined,
          processedLabel: undefined,
        });
      }
      touchProject((p) => ({
        ...p,
        tracks: [...p.tracks, ...newTracks],
        clips: [...p.clips, ...newClips],
        vocalSession: { ...defaultVocalSession(), ...(p.vocalSession ?? {}), stackMode: "double" },
      }));
      for (const tr of newTracks) {
        audioEngine.ensureTrack(tr.id);
        audioEngine.applyEffects(tr.id, tr.effects);
      }
      applyAllTrackParams();
      set({ statusMessage: "One-click vocal stack created: lead, doubles, and ad-lib routing." });
    },

    setVocalCompareSlot: (slot) => {
      touchProject((p) => ({
        ...p,
        vocalSession: { ...defaultVocalSession(), ...(p.vocalSession ?? {}), compareSlot: slot },
      }));
    },

    runVocalRecordingWizard: async () => {
      set({ micPanelOpen: true, coachOpen: true });
      const diagnostics: string[] = [];
      try {
        await audioEngine.ensure();
        if (!audioEngine.hasInput()) await get().enableInput();
        diagnostics.push(audioEngine.hasInput() ? "Mic input is open" : "Mic input still needs permission");
        diagnostics.push(get().monitor ? `Monitoring ${get().monitorMode}` : "Monitoring is off");
        diagnostics.push(get().project.tracks.some((t) => t.armed) ? "A vocal track is armed" : "No armed track yet");
      } catch (e) {
        diagnostics.push("Mic check failed: " + String(e));
      }
      touchProject((p) => ({
        ...p,
        vocalSession: {
          ...defaultVocalSession(),
          ...(p.vocalSession ?? {}),
          monitoringDiagnostics: diagnostics,
        },
      }));
      set({ statusMessage: diagnostics.join(". ") });
    },

    runMagicMicChain: async () => {
      set({ processing: true, statusMessage: "Magic Mic: listening to the room..." });
      try {
        await audioEngine.ensure();
        if (!audioEngine.hasInput()) await get().enableInput();
        await new Promise((resolve) => setTimeout(resolve, 650));
        const rms = audioEngine.inputRms();
        const peak = audioEngine.inputPeak();
        const roomNoise = rms > 0.055 ? "noisy" : rms > 0.022 ? "moderate" : "quiet";
        const loudness = peak > 0.82 ? "hot" : peak < 0.12 ? "low" : "good";
        const harshnessRisk = peak > 0.72 || rms > 0.06 ? "high" : peak > 0.5 ? "medium" : "low";
        const recommendedInputGain = loudness === "hot" ? Math.max(0.35, get().inputGain * 0.72) : loudness === "low" ? Math.min(1.8, get().inputGain * 1.22) : get().inputGain;
        const recommendedPresetId = roomNoise === "noisy" ? "podcast-clean" : harshnessRisk === "high" ? "intimate-verse" : "bring-vocal-forward";
        const reasons = [
          roomNoise === "quiet" ? "Room floor is controlled enough for open vocal tone." : `Detected ${roomNoise} room floor, so the chain leans on gate/cleanup.`,
          loudness === "good" ? "Mic level is in a workable range." : loudness === "hot" ? "Input peak is hot; lower gain protects takes." : "Input is low; a small gain lift improves signal before compression.",
          harshnessRisk === "high" ? "Peak behavior suggests harshness risk, so de-essing and softer presence are safer." : "Harshness risk is manageable.",
        ];
        const trackId = get().project.tracks.find((t) => t.armed)?.id ?? get().selectedTrackId ?? get().project.tracks[0]?.id;
        if (trackId) get().applyFactoryFxPreset(recommendedPresetId, trackId);
        get().setInputGain(recommendedInputGain);
        touchProject((p) => ({
          ...p,
          magicMicReport: {
            id: uid(),
            createdAt: Date.now(),
            inputRms: rms,
            inputPeak: peak,
            roomNoise,
            loudness,
            harshnessRisk,
            recommendedInputGain,
            recommendedPresetId,
            reasons,
          },
          vocalSession: {
            ...defaultVocalSession(),
            ...(p.vocalSession ?? {}),
            monitoringDiagnostics: reasons,
          },
        }));
        recordSmartHistory("Magic Mic Chain built", `${reasons.join(" ")} Applied ${recommendedPresetId} and set input gain to ${recommendedInputGain.toFixed(2)}.`, "recording");
        set({ processing: false, statusMessage: "Magic Mic Chain built: mic gain and vocal chain are studio-ready." });
        await get().saveNow();
      } catch (e) {
        set({ processing: false, micPanelOpen: true, statusMessage: "Magic Mic needs microphone access: " + String(e) });
      }
    },

    setVibeMode: (mode) => {
      touchProject((p) => ({ ...p, vibeMode: mode }));
      set({ studioMode: mode !== "off" });
      const workspaceMap: Record<VibeModeId, string> = {
        off: "normal",
        "late-night": "minimal low-light writing",
        "recording-session": "vocal tracking focus",
        beatmaking: "pattern and groove focus",
        "emotional-writing": "lyrics and capture focus",
        performance: "performance-safe focus",
      };
      recordSmartHistory("Vibe Mode changed", `Switched to ${workspaceMap[mode]}. Panther hides friction and prioritizes the matching workflow.`, "creative");
    },

    updateProjectStory: (patch) => {
      touchProject((p) => ({
        ...p,
        projectStory: { ...defaultProjectStory(), ...(p.projectStory ?? {}), ...patch },
      }), "project-story");
    },

    captureInspiration: async (kind, text) => {
      if (kind === "voice" || kind === "melody") {
        await get().quickIdeaCapture();
      }
      const title = kind === "voice" ? "Voice memo" : kind === "melody" ? "Melody hum" : kind === "lyric" ? "Lyric note" : kind === "beat" ? "Beat idea" : "Rhythm tap";
      const capture = {
        id: uid(),
        kind,
        title,
        text: text?.trim() || `${title} captured at ${new Date().toLocaleTimeString()}`,
        timeSec: get().positionSec,
        createdAt: Date.now(),
      };
      touchProject((p) => ({ ...p, inspirationCaptures: [capture, ...(p.inspirationCaptures ?? [])].slice(0, 80) }));
      recordSmartHistory("Inspiration captured", `${title}: ${capture.text}`, "creative");
      await get().saveNow();
      set({ statusMessage: `${title} autosaved.` });
    },

    learnCurrentSession: (intent) => {
      touchProject((p) => {
        const memory = normalizeStudioMemory(p.studioIntelligence?.memory);
        const bpmBand = `${Math.round(p.tempo / 10) * 10}s`;
        memory.favoriteBpmRanges[bpmBand] = (memory.favoriteBpmRanges[bpmBand] ?? 0) + 1;
        memory.favoriteArrangementStructures[p.markers.filter((m) => m.kind === "section").map((m) => m.name).join(" > ") || "freeform"] =
          (memory.favoriteArrangementStructures[p.markers.filter((m) => m.kind === "section").map((m) => m.name).join(" > ") || "freeform"] ?? 0) + 1;
        for (const track of p.tracks) {
          if (track.presetName) memory.favoriteVocalChains[track.presetName] = (memory.favoriteVocalChains[track.presetName] ?? 0) + 1;
          for (const [fx, state] of Object.entries(track.effects)) {
            if ((state as { enabled?: boolean }).enabled) memory.favoriteFxUsage[fx] = (memory.favoriteFxUsage[fx] ?? 0) + 1;
          }
        }
        memory.workflowHabits[intent] = (memory.workflowHabits[intent] ?? 0) + 1;
        memory.lastWorkflowIntent = intent;
        memory.updatedAt = Date.now();
        return {
          ...p,
          studioIntelligence: {
            current: p.studioIntelligence?.current ?? null,
            history: p.studioIntelligence?.history ?? [],
            memory,
          },
        };
      });
    },

    // ---- Local composer ----
    addInstrumentTrack: (instrument, name) => {
      return get().addTrack({
        name: name ?? instrument.charAt(0).toUpperCase() + instrument.slice(1),
        instrument,
        busId: "music",
      });
    },

    composeFromPrompt: (prompt) => {
      const comp = compose(prompt);
      // Build instrument tracks + MIDI clips for each generated part.
      const newTracks: Track[] = [];
      const newClips: Clip[] = [];
      let maxEnd = 0;
      for (const part of comp.parts) {
        const tr = newTrack(get().project.tracks.length + newTracks.length);
        tr.name = part.name;
        tr.instrument = part.instrument;
        tr.busId = part.busId;
        tr.armed = false;
        const barSec = (60 / comp.tempo) * 4;
        const dur = comp.bars * barSec;
        maxEnd = Math.max(maxEnd, dur);
        const clip: Clip = {
          id: uid(),
          trackId: tr.id,
          assetId: "",
          name: `${part.name} (${comp.bars} bars)`,
          kind: "midi",
          startSec: 0,
          offsetSec: 0,
          durationSec: dur,
          take: 1,
          gain: 1,
          fadeInSec: 0,
          fadeOutSec: 0,
          muted: false,
          notes: part.notes.map((n) => ({ id: uid(), ...n })),
        };
        newTracks.push(tr);
        newClips.push(clip);
      }
      touchProject((p) => ({
        ...p,
        tempo: comp.tempo,
        tracks: [...p.tracks, ...newTracks],
        clips: [...p.clips, ...newClips],
        lengthSec: Math.max(p.lengthSec, maxEnd + 10),
        lastComposerPrompt: prompt,
      }));
      // Hook up engine nodes for the new tracks.
      for (const tr of newTracks) {
        audioEngine.ensureTrack(tr.id);
        audioEngine.applyEffects(tr.id, tr.effects);
      }
      applyAllTrackParams();
      set({ snapSec: (60 / comp.tempo) * get().gridDivision, statusMessage: comp.summary });
      void get().saveNow();
      return comp.summary;
    },

    addBeatClip: ({ name, instrument, busId, durationSec, notes }) => {
      const tr = newTrack(get().project.tracks.length);
      tr.name = name;
      tr.instrument = instrument;
      tr.busId = busId;
      tr.armed = false;
      const clip: Clip = {
        id: uid(),
        trackId: tr.id,
        assetId: "",
        name,
        kind: "midi",
        startSec: 0,
        offsetSec: 0,
        durationSec,
        take: 1,
        gain: 1,
        fadeInSec: 0,
        fadeOutSec: 0,
        muted: false,
        notes: notes.map((n) => ({ id: uid(), ...n })),
      };
      touchProject((p) => ({
        ...p,
        tracks: [...p.tracks, tr],
        clips: [...p.clips, clip],
        lengthSec: Math.max(p.lengthSec, durationSec + 10),
      }));
      audioEngine.ensureTrack(tr.id);
      audioEngine.applyEffects(tr.id, tr.effects);
      applyAllTrackParams();
      set({ selectedClipId: clip.id });
      return clip.id;
    },

    createPatternFromGrid: (name, grid, swing = 0) => {
      const tempo = get().project.tempo;
      const beatSec = 60 / tempo;
      const stepSec = beatSec / 4;
      const notes: MidiNote[] = [];
      for (const lane of DRUM_LANES) {
        const steps = grid[lane.id] ?? [];
        for (let i = 0; i < steps.length; i++) {
          if (!steps[i]) continue;
          const swingOffset = i % 2 === 1 ? stepSec * Math.max(0, Math.min(0.55, swing)) : 0;
          notes.push({
            id: uid(),
            pitch: lane.pitch,
            startSec: i * stepSec + swingOffset,
            durationSec: stepSec,
            velocity: i % 4 === 0 ? 0.95 : 0.78,
          });
        }
      }
      if (!notes.length) {
        set({ statusMessage: "Create a drum pattern first." });
        return null;
      }
      const pattern: PatternClip = {
        id: uid(),
        name,
        instrument: "drumkit",
        color: "#39d3e0",
        bars: Math.max(1, Math.ceil((Math.max(...notes.map((n) => n.startSec)) + stepSec) / (beatSec * 4))),
        swing,
        groove: 0,
        scaleLock: false,
        key: get().tuneKey,
        scale: get().tuneScale,
        notes,
        tags: ["drums", "pattern"],
        createdAt: Date.now(),
      };
      touchProject((p) => ({ ...p, patterns: [pattern, ...(p.patterns ?? [])].slice(0, 64) }));
      set({ statusMessage: `Pattern saved: ${name}` });
      return pattern.id;
    },

    duplicatePattern: (patternId, mutate) => {
      const pattern = get().project.patterns?.find((p) => p.id === patternId);
      if (!pattern) return null;
      const copy: PatternClip = {
        ...JSON.parse(JSON.stringify(pattern)),
        id: uid(),
        name: mutate ? `${pattern.name} mutate` : `${pattern.name} copy`,
        notes: pattern.notes.map((n) => ({
          ...n,
          id: uid(),
          velocity: mutate ? Math.max(0.25, Math.min(1, n.velocity + (Math.random() - 0.5) * 0.18)) : n.velocity,
          startSec: mutate && Math.random() > 0.82 ? n.startSec + (Math.random() - 0.5) * 0.035 : n.startSec,
        })),
        createdAt: Date.now(),
      };
      touchProject((p) => ({ ...p, patterns: [copy, ...(p.patterns ?? [])] }));
      set({ statusMessage: mutate ? "Pattern duplicated with a light humanized mutation." : "Pattern duplicated." });
      return copy.id;
    },

    placePattern: (patternId, startSec) => {
      const pattern = get().project.patterns?.find((p) => p.id === patternId);
      if (!pattern) return null;
      const trackId = get().addInstrumentTrack(pattern.instrument, pattern.name);
      const durationSec = pattern.bars * (60 / get().project.tempo) * 4;
      const clip: Clip = {
        id: uid(),
        trackId,
        assetId: "",
        name: pattern.name,
        kind: "midi",
        startSec: Math.max(0, startSec ?? get().positionSec),
        offsetSec: 0,
        durationSec,
        take: 1,
        gain: 1,
        fadeInSec: 0,
        fadeOutSec: 0,
        muted: false,
        colorLabel: pattern.color,
        notes: pattern.notes.map((n) => ({ ...n, id: uid() })),
      };
      touchProject((p) => ({ ...p, clips: [...p.clips, clip], lengthSec: Math.max(p.lengthSec, clip.startSec + durationSec + 8) }));
      set({ selectedClipId: clip.id, statusMessage: "Pattern placed on the playlist." });
      return clip.id;
    },

    convertMidiToAudio: async (clipId) => {
      const clip = get().project.clips.find((c) => c.id === clipId);
      if (!clip || clip.kind !== "midi") return;
      await get().bounceClip(clipId);
    },

    addSongSection: (name) => {
      const time = get().positionSec;
      touchProject((p) => ({
        ...p,
        markers: [
          ...p.markers,
          { id: uid(), name, timeSec: time, kind: "section" as const, color: "#e8b341" },
        ].sort((a, b) => a.timeSec - b.timeSec),
      }));
    },

    buildSongStructure: () => {
      // Lay out a standard song-structure section map across the timeline using
      // the current tempo (8-bar sections).
      const tempo = get().project.tempo;
      const barSec = (60 / tempo) * 4;
      const layout: [string, number][] = [
        ["Intro", 4],
        ["Verse 1", 8],
        ["Hook", 8],
        ["Verse 2", 8],
        ["Hook", 8],
        ["Bridge", 4],
        ["Hook", 8],
        ["Outro", 4],
      ];
      let at = 0;
      const markers = layout.map(([name, bars]) => {
        const m = { id: uid(), name, timeSec: at, kind: "section" as const, color: "#e8b341" };
        at += bars * barSec;
        return m;
      });
      touchProject((p) => ({
        ...p,
        markers: [...p.markers.filter((m) => m.kind !== "section"), ...markers].sort((a, b) => a.timeSec - b.timeSec),
        lengthSec: Math.max(p.lengthSec, at + 10),
      }));
      set({ statusMessage: "Song structure laid out (Intro to Outro)." });
    },

    applySessionTemplate: async (templateId) => {
      const templates: Record<string, { name: string; tempo: number; tracks: Array<{ name: string; instrument?: InstrumentId; busId?: string | null; preset?: string; armed?: boolean }>; sections?: string[] }> = {
        "rap-recording": {
          name: "Rap Recording",
          tempo: 140,
          tracks: [
            { name: "Lead Vocal", busId: "vocals", preset: "rap-lead", armed: true },
            { name: "Double", busId: "vocals", preset: "double-wide" },
            { name: "Ad-Libs", busId: "vocals", preset: "adlib-space" },
            { name: "Beat", instrument: "drumkit", busId: "music" },
          ],
          sections: ["Intro", "Verse", "Hook", "Verse 2", "Hook", "Outro"],
        },
        "pop-vocal": {
          name: "Pop Vocal",
          tempo: 118,
          tracks: [
            { name: "Lead Vocal", busId: "vocals", preset: "pop-vocal", armed: true },
            { name: "Harmony Low", busId: "vocals", preset: "harmony-glue" },
            { name: "Harmony High", busId: "vocals", preset: "harmony-glue" },
            { name: "Music", instrument: "piano", busId: "music" },
          ],
          sections: ["Intro", "Verse", "Pre-Hook", "Hook", "Bridge", "Hook"],
        },
        podcast: {
          name: "Podcast",
          tempo: 100,
          tracks: [
            { name: "Host", busId: "vocals", preset: "podcast-clean", armed: true },
            { name: "Guest", busId: "vocals", preset: "podcast-clean" },
            { name: "Music Bed", instrument: "pad", busId: "music" },
          ],
        },
        beatmaking: {
          name: "Beatmaking",
          tempo: 140,
          tracks: [
            { name: "Drums", instrument: "drumkit", busId: "drums" },
            { name: "808", instrument: "bass", busId: "music" },
            { name: "Chords", instrument: "piano", busId: "music" },
            { name: "Melody", instrument: "lead", busId: "music" },
          ],
        },
        mixing: {
          name: "Mixing",
          tempo: 120,
          tracks: [
            { name: "Vocals", busId: "vocals", preset: "bring-vocal-forward" },
            { name: "Drums", instrument: "drumkit", busId: "drums" },
            { name: "Bass", instrument: "bass", busId: "music" },
            { name: "Music", instrument: "pad", busId: "music" },
          ],
        },
        mastering: {
          name: "Mastering",
          tempo: 120,
          tracks: [{ name: "Premaster Mix", busId: null, armed: false }],
        },
        "blank-advanced": {
          name: "Blank Advanced",
          tempo: 120,
          tracks: [{ name: "Audio 1", busId: "vocals", armed: true }],
        },
      };
      const tmpl = templates[templateId] ?? templates["blank-advanced"];
      const next = createEmptyProject(`${tmpl.name} ${new Date().toLocaleDateString()}`, get().currentProfileId);
      next.tempo = tmpl.tempo;
      next.sessionTemplateId = templateId;
      next.tracks = tmpl.tracks.map((spec, i) => {
        const tr = newTrack(i);
        tr.name = spec.name;
        tr.instrument = spec.instrument ?? tr.instrument;
        tr.busId = spec.busId === undefined ? tr.busId : spec.busId;
        tr.armed = !!spec.armed;
        if (spec.preset) {
          const preset = getFactoryPreset(spec.preset) ?? getPreset(spec.preset);
          if (preset) {
            tr.effects = preset.build();
            tr.presetName = preset.name;
          }
        }
        return tr;
      });
      if (tmpl.sections?.length) {
        const barSec = (60 / tmpl.tempo) * 4;
        next.markers = tmpl.sections.map((name, i) => ({
          id: uid(),
          name,
          timeSec: i * 8 * barSec,
          kind: "section" as const,
          color: "#e8b341",
        }));
        next.lengthSec = Math.max(next.lengthSec, tmpl.sections.length * 8 * barSec + 8);
      }
      set({
        project: normalizeProject(next),
        selectedTrackId: next.tracks[0]?.id ?? null,
        selectedClipId: null,
        view: "studio",
        dirty: true,
        exportSettings: normalizeExportSettings(next.exportSettings),
        statusMessage: `${tmpl.name} template loaded.`,
      });
      reconcileEngine();
      await get().saveNow();
    },

    // ---- Profiles / accounts ----
    refreshProfiles: async () => {
      set({ profiles: await db.listProfiles() });
    },

    createProfile: async (name, avatar, color) => {
      const palette = ["#7c5cff", "#39d3e0", "#3ddc97", "#e8b341", "#ff7ad9", "#4d8dff"];
      const profile: Profile = {
        id: uid(),
        name: name.trim() || "New Profile",
        avatar: avatar || (name.trim()[0] || "P").toUpperCase(),
        color: color || palette[Math.floor(Math.random() * palette.length)],
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        preferredInputId: get().selectedDeviceId,
        preferredOutputId: get().outputDeviceId,
        inputGain: get().inputGain,
        accent: get().accent,
        syncId: null,
      };
      await db.saveProfile(profile);
      await get().refreshProfiles();
      await get().selectProfile(profile.id);
    },

    selectProfile: async (id) => {
      const profile = get().profiles.find((p) => p.id === id);
      if (!profile) return;
      const updated = { ...profile, lastUsedAt: Date.now() };
      await db.saveProfile(updated);
      set({
        currentProfileId: id,
        accent: profile.accent || get().accent,
        selectedDeviceId: profile.preferredInputId ?? get().selectedDeviceId,
        outputDeviceId: profile.preferredOutputId ?? get().outputDeviceId,
        inputGain: profile.inputGain ?? get().inputGain,
      });
      applyAccent(profile.accent || get().accent);
      audioEngine.setInputGain(profile.inputGain ?? get().inputGain);
      await persistSettings({ currentProfileId: id });
      await get().refreshProfiles();
      await get().refreshPresets();
      await get().refreshProjectList();
      // Land on the dashboard for this profile.
      set({ view: "dashboard", project: createEmptyProject("Untitled Project", id) });
      set({ selectedTrackId: get().project.tracks[0]?.id ?? null });
    },

    updateCurrentProfile: async (patch) => {
      const id = get().currentProfileId;
      const profile = get().profiles.find((p) => p.id === id);
      if (!profile) return;
      const updated = { ...profile, ...patch };
      await db.saveProfile(updated);
      if (patch.accent) {
        set({ accent: patch.accent });
        applyAccent(patch.accent);
      }
      await get().refreshProfiles();
    },

    deleteProfileById: async (id) => {
      await db.deleteProfile(id);
      if (get().currentProfileId === id) {
        set({ currentProfileId: null, view: "dashboard" });
        await persistSettings({ currentProfileId: null });
      }
      await get().refreshProfiles();
      await get().refreshProjectList();
    },

    signOutProfile: () => {
      audioEngine.stop();
      set({ currentProfileId: null, view: "dashboard", presets: [], projectList: [] });
      void persistSettings({ currentProfileId: null });
      void get().refreshProjectList();
    },

    // ---- Preset library ----
    refreshPresets: async () => {
      const pid = get().currentProfileId;
      if (!pid) {
        set({ presets: [] });
        return;
      }
      set({ presets: await db.listPresets(pid) });
    },

    savePresetToLibrary: async (kind, name, data) => {
      const pid = get().currentProfileId;
      if (!pid) {
        set({ statusMessage: "Select a profile to save presets." });
        return;
      }
      const preset: SavedPreset = {
        id: uid(),
        profileId: pid,
        kind,
        name: name.trim() || "Preset",
        createdAt: Date.now(),
        data,
      };
      await db.savePreset(preset);
      await get().refreshPresets();
      set({ statusMessage: `Saved ${kind} preset "${preset.name}".` });
    },

    deletePresetFromLibrary: async (id) => {
      await db.deletePreset(id);
      await get().refreshPresets();
    },

    duplicatePresetInLibrary: async (id) => {
      const source = get().presets.find((p) => p.id === id);
      const pid = get().currentProfileId;
      if (!source || !pid) return;
      const copy: SavedPreset = {
        ...source,
        id: uid(),
        profileId: pid,
        name: `${source.name} Copy`,
        createdAt: Date.now(),
        favorite: false,
        source: "user",
      };
      await db.savePreset(copy);
      await get().refreshPresets();
      set({ statusMessage: `Duplicated preset "${source.name}".` });
    },

    togglePresetFavorite: async (id) => {
      const source = get().presets.find((p) => p.id === id);
      if (!source) return;
      await db.savePreset({ ...source, favorite: !source.favorite });
      await get().refreshPresets();
    },

    applyLibraryPreset: (preset, trackId) => {
      const tid = trackId ?? get().selectedTrackId;
      if (preset.kind === "vocalChain" && tid) {
        const effects = normalizeEffects(preset.data as Partial<EffectsState>);
        touchProject((p) => ({
          ...p,
          tracks: p.tracks.map((t) => (t.id === tid ? { ...t, effects, presetName: preset.name } : t)),
        }));
        audioEngine.applyEffects(tid, effects);
        set({ statusMessage: `Applied chain "${preset.name}".` });
      } else if (preset.kind === "master") {
        const d = preset.data as { effects: EffectsState; outputGain: number };
        const effects = normalizeEffects(d.effects);
        touchProject((p) => ({ ...p, master: { effects, bypass: false, presetName: preset.name }, masterGain: d.outputGain ?? 1 }));
        audioEngine.setMasterChain(effects);
        audioEngine.setMasterBypass(false);
        audioEngine.setMasterGain(d.outputGain ?? 1);
        set({ statusMessage: `Applied master "${preset.name}".` });
      } else if (preset.kind === "instrument" && tid) {
        get().setTrackInstrument(tid, preset.data as InstrumentId);
        set({ statusMessage: `Set instrument "${preset.name}".` });
      }
    },

    // ---- Panels ----
    setAudioSetupOpen: (open) => set({ audioSetupOpen: open }),
    setBuilderOpen: (open) => set({ builderOpen: open }),
    setCoachOpen: (open) => set({ coachOpen: open }),
    setLibraryOpen: (open) => set({ libraryOpen: open }),
    setBeatBrowserOpen: (open) => {
      if (open && !get().project.beatBrowser) {
        touchProject((p) => ({ ...p, beatBrowser: defaultBeatDiscovery() }));
      }
      set({ beatBrowserOpen: open });
    },

    refreshOutputDevices: async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        set({ outputDevices: all.filter((d) => d.kind === "audiooutput") });
      } catch {
        /* enumeration may fail before permission */
      }
    },

    setOutputDevice: async (id) => {
      set({ outputDeviceId: id });
      await audioEngine.setOutputDevice(id);
      await persistSettings({ preferredOutputId: id });
      const pid = get().currentProfileId;
      if (pid) await get().updateCurrentProfile({ preferredOutputId: id });
    },

    // ---- Save As / bundles / favorites ----
    saveProjectAs: async (name) => {
      const src = get().project;
      const newId = uid();
      const idMap = new Map<string, string>();
      for (const a of src.assets) idMap.set(a.id, uid());
      if (src.reference) idMap.set(src.reference.assetId, uid());
      const copy: Project = {
        ...JSON.parse(JSON.stringify(src)),
        id: newId,
        name: name.trim() || src.name + " copy",
        profileId: get().currentProfileId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      copy.assets = copy.assets.map((a) => ({ ...a, id: idMap.get(a.id) ?? a.id }));
      copy.clips = copy.clips.map((c) => ({ ...c, assetId: idMap.get(c.assetId) ?? c.assetId }));
      copy.pads = copy.pads.map((pd) => ({ ...pd, assetId: idMap.get(pd.assetId) ?? pd.assetId }));
      copy.tracks = copy.tracks.map((t) =>
        t.frozen ? { ...t, frozen: { ...t.frozen, assetId: idMap.get(t.frozen.assetId) ?? t.frozen.assetId } } : t
      );
      if (copy.reference) copy.reference = { ...copy.reference, assetId: idMap.get(copy.reference.assetId) ?? copy.reference.assetId };
      for (const [oldId, dupId] of idMap) {
        const blob = await db.loadBlob(oldId);
        if (blob) await db.saveBlob(dupId, newId, blob);
      }
      await db.saveProject(copy);
      set({ project: copy, exportSettings: normalizeExportSettings(copy.exportSettings), lastSaved: Date.now(), dirty: false, past: [], future: [] });
      await get().refreshProjectList();
      set({ statusMessage: `Saved as "${copy.name}".` });
    },

    exportBundle: async () => {
      const p = get().project;
      set({ statusMessage: "Building project bundle…", exporting: true });
      try {
        const assets: Record<string, string> = {};
        const assetIds = new Set<string>(p.assets.map((a) => a.id));
        if (p.reference) assetIds.add(p.reference.assetId);
        for (const t of p.tracks) if (t.frozen) assetIds.add(t.frozen.assetId);
        for (const id of assetIds) {
          const blob = await db.loadBlob(id);
          if (blob) assets[id] = await blobToBase64(blob);
        }
        const bundle = { format: "panther-bundle", version: 1, project: p, assets };
        const json = JSON.stringify(bundle);
        const blob = new Blob([json], { type: "application/json" });
        const ok = await saveBlobFile(blob, `${safeName(p.name)}.panther`);
        recordExport("bundle", `${safeName(p.name)}.panther`);
        set({ exporting: false, statusMessage: ok ? "Project bundle exported (.panther)." : "Bundle export canceled." });
      } catch (e) {
        set({ exporting: false, statusMessage: "Bundle export failed: " + String(e) });
      }
    },

    importBundle: async (file) => {
      set({ statusMessage: "Opening project bundle…" });
      try {
        const text = await file.text();
        const bundle = JSON.parse(text) as { format?: string; project: Project; assets: Record<string, string> };
        if (bundle.format !== "panther-bundle" || !bundle.project) {
          set({ statusMessage: "Not a valid Panther project bundle." });
          return;
        }
        const newId = uid();
        const idMap = new Map<string, string>();
        const migrated = migrateProjectForOpen(bundle.project);
        const proj = normalizeProject(migrated.project);
        for (const a of proj.assets) idMap.set(a.id, uid());
        if (proj.reference) idMap.set(proj.reference.assetId, uid());
        for (const t of proj.tracks) if (t.frozen) idMap.set(t.frozen.assetId, uid());
        const remapped: Project = {
          ...proj,
          id: newId,
          profileId: get().currentProfileId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        remapped.assets = remapped.assets.map((a) => ({ ...a, id: idMap.get(a.id) ?? a.id }));
        remapped.clips = remapped.clips.map((c) => ({ ...c, assetId: idMap.get(c.assetId) ?? c.assetId }));
        remapped.pads = remapped.pads.map((pd) => ({ ...pd, assetId: idMap.get(pd.assetId) ?? pd.assetId }));
        remapped.tracks = remapped.tracks.map((t) => (t.frozen ? { ...t, frozen: { ...t.frozen, assetId: idMap.get(t.frozen.assetId) ?? t.frozen.assetId } } : t));
        if (remapped.reference) remapped.reference = { ...remapped.reference, assetId: idMap.get(remapped.reference.assetId) ?? remapped.reference.assetId };
        for (const [oldId, dupId] of idMap) {
          const b64 = bundle.assets[oldId];
          if (b64) await db.saveBlob(dupId, newId, base64ToBlob(b64));
        }
        await db.saveProject(remapped);
        await get().refreshProjectList();
        await get().openProject(newId);
        set({ statusMessage: `Imported "${remapped.name}".` });
      } catch (e) {
        set({ statusMessage: "Bundle import failed: " + String(e) });
      }
    },

    toggleFavorite: async (id) => {
      if (id === get().project.id) {
        touchProject((p) => ({ ...p, favorite: !p.favorite }));
        await get().saveNow();
      } else {
        const proj = await db.loadProject(id);
        if (proj) {
          proj.favorite = !proj.favorite;
          await db.saveProject(proj);
        }
      }
      await get().refreshProjectList();
    },
  };
});

// ---- bundle helpers (base64 <-> Blob) ----
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `${blob.type};base64,${btoa(binary)}`;
}

function base64ToBlob(s: string): Blob {
  const [meta, data] = s.split(";base64,");
  const bin = atob(data ?? s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: meta || "audio/wav" });
}

// Tap-tempo timestamps live outside reactive state.
const tapTimes: number[] = [];

// Recording anchor lives outside reactive state (mutated synchronously).
const recordAnchor: { start: number | null; trackId: ID | null } = {
  start: null,
  trackId: null,
};
