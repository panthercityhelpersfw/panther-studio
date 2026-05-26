import type { EffectsState } from "../audio/effects/types";
import type {
  StudioIntelligenceMemory,
  StudioIntelligenceSnapshot,
} from "../audio/studioIntelligence";

export type ID = string;

export interface TrackColor {
  name: string;
  hex: string;
}

export const TRACK_COLORS: TrackColor[] = [
  { name: "Violet", hex: "#7c5cff" },
  { name: "Gold", hex: "#e8b341" },
  { name: "Cyan", hex: "#39d3e0" },
  { name: "Green", hex: "#3ddc97" },
  { name: "Red", hex: "#ff5d6c" },
  { name: "Blue", hex: "#4d8dff" },
  { name: "Pink", hex: "#ff7ad9" },
  { name: "Orange", hex: "#ff9f43" },
];

/**
 * Metadata describing a decoded audio asset. The raw audio bytes live in
 * IndexedDB (object store "blobs") keyed by `id`; the decoded peaks are cached
 * in memory by the audio engine. This split keeps the project JSON small and
 * the binary data crash-safe on disk (IndexedDB lives in the app data folder).
 */
export interface AudioAsset {
  id: ID;
  name: string;
  mime: string;
  durationSec: number;
  sampleRate: number;
  numChannels: number;
  /** Number of samples (per channel) in the source buffer. */
  length: number;
  createdAt: number;
}

export type ClipKind = "audio" | "midi";

/** Playable software instruments for MIDI tracks (Web Audio synthesis). */
export type InstrumentId =
  | "synth"
  | "piano"
  | "epiano"
  | "bass"
  | "lead"
  | "pad"
  | "pluck"
  | "drumkit";

export const INSTRUMENT_LABELS: Record<InstrumentId, string> = {
  synth: "Synth",
  piano: "Grand Piano",
  epiano: "Electric Piano",
  bass: "Bass",
  lead: "Synth Lead",
  pad: "Warm Pad",
  pluck: "Pluck",
  drumkit: "Drum Kit",
};

export interface MidiNote {
  id: ID;
  /** MIDI pitch 0..127 (60 = middle C). */
  pitch: number;
  /** Start, in seconds, relative to the clip start. */
  startSec: number;
  /** Duration in seconds. */
  durationSec: number;
  /** Velocity 0..1. */
  velocity: number;
}

export type AutomationTarget =
  | "track.volume"
  | "track.pan"
  | "track.send.vocal"
  | "track.send.drum"
  | "track.send.music"
  | "master.volume"
  | "master.width"
  | "effect.eq.lowGain"
  | "effect.eq.midGain"
  | "effect.eq.highGain"
  | "effect.compressor.threshold"
  | "effect.reverb.mix"
  | "effect.delay.mix"
  | "effect.doubler.mix";

export interface AutomationPoint {
  id: ID;
  timeSec: number;
  value: number;
}

export interface AutomationLane {
  id: ID;
  target: AutomationTarget;
  trackId?: ID | null;
  effectKey?: string;
  param?: string;
  name: string;
  color: string;
  enabled: boolean;
  min: number;
  max: number;
  points: AutomationPoint[];
}

export interface Clip {
  id: ID;
  trackId: ID;
  /** Empty for MIDI clips. */
  assetId: ID;
  name: string;
  kind: ClipKind;
  /** Position on the timeline, in seconds. */
  startSec: number;
  /** Trim offset into the asset, in seconds (audio clips). */
  offsetSec: number;
  /** Played duration, in seconds. */
  durationSec: number;
  /** Take number for comping multiple recordings. */
  take: number;
  /** Per-clip linear gain (1 = unity). */
  gain: number;
  /** Fade in / out in seconds. */
  fadeInSec: number;
  fadeOutSec: number;
  /** Clip-level mute (mute an individual take). */
  muted: boolean;
  /** MIDI notes (only for kind === "midi"). */
  notes?: MidiNote[];
  /** Original (dry) asset before a destructive process (autotune/clean), kept so
   *  the user can A/B or revert. The live asset is always `assetId`. */
  dryAssetId?: ID;
  /** Label for what processing produced the current asset (e.g. "Autotuned"). */
  processedLabel?: string;
  groupId?: ID | null;
  locked?: boolean;
  colorLabel?: string;
  reversed?: boolean;
  normalized?: boolean;
  takeLane?: number;
  compRole?: "candidate" | "chosen" | "muted";
  bouncedFromClipIds?: ID[];
  sourceBpm?: number | null;
  stretchRatio?: number;
  pitchShiftSemitones?: number;
}

export interface Marker {
  id: ID;
  name: string;
  timeSec: number;
  /** "marker" = point; "section" = labeled region start. */
  kind: "marker" | "section";
  color: string;
}

export interface Pad {
  id: ID;
  name: string;
  /** Audio asset to trigger (one-shot). */
  assetId: ID;
  /** Keyboard key that triggers the pad (single char, lowercase). */
  key: string;
  gain: number;
  color: string;
}

export interface LoopRegion {
  enabled: boolean;
  startSec: number;
  endSec: number;
}

/** Master bus processing chain (reuses the per-track EffectsState shape; only
 *  eq/compressor/saturation/limiter are used on the master). */
export interface MasterState {
  effects: EffectsState;
  bypass: boolean;
  presetName?: string;
}

/** Reference track for A/B comparison; bypasses the master chain on playback. */
export interface ReferenceTrack {
  assetId: ID;
  name: string;
  gain: number;
}

/** A mix group/bus. Tracks routed to a bus get its gain/mute applied on top of
 *  their own. Applied in effectiveGain and the offline renderer (real routing,
 *  computed in the gain stage rather than via extra graph nodes). */
export interface Bus {
  id: string;
  name: string;
  gain: number;
  muted: boolean;
  returnGain?: number;
  preFader?: boolean;
}

export function defaultBuses(): Bus[] {
  return [
    { id: "vocals", name: "Vocal Bus", gain: 1, muted: false, returnGain: 1, preFader: false },
    { id: "music", name: "Music Bus", gain: 1, muted: false, returnGain: 1, preFader: false },
    { id: "drums", name: "Drum Bus", gain: 1, muted: false, returnGain: 1, preFader: false },
  ];
}

export interface Track {
  id: ID;
  name: string;
  color: string;
  /** Linear gain, 0..2 (1 = unity). */
  gain: number;
  /** Pan, -1 (L) .. 1 (R). */
  pan: number;
  muted: boolean;
  soloed: boolean;
  armed: boolean;
  /** Input monitoring through speakers/headphones. */
  monitor: boolean;
  height: number;
  /** Per-track effect chain settings (serialized with the project). */
  effects: EffectsState;
  /** Name of the last applied preset, for UI display. */
  presetName?: string;
  /** Software instrument used to render this track's MIDI clips. */
  instrument?: InstrumentId;
  /** Mix bus id this track is routed to (null = straight to master). */
  busId?: string | null;
  sends?: Record<string, { gain: number; pre: boolean }>;
  /** When frozen, the track's clips+effects are rendered to a single audio asset
   *  (played dry) so the live FX/MIDI are bypassed for CPU savings. Stores enough
   *  to fully reverse on unfreeze. Cleared on unfreeze. */
  frozen?: {
    assetId: ID;
    clipId: ID;
    effects: EffectsState;
    mutedClipIds: ID[];
  } | null;
}

/** A coach analysis note attached to the project (timeline marker + advice). */
export interface CoachNote {
  id: ID;
  clipId: ID | null;
  trackId: ID | null;
  timeSec: number;
  text: string;
  kind: "issue" | "idea" | "tip" | "note";
  severity: "ok" | "warn" | "bad";
  status: "open" | "applied" | "rejected";
  createdAt: number;
}

/** A snapshot of a take's vocal scores, kept for trend tracking. */
export interface CoachScoreEntry {
  id: ID;
  clipId: ID;
  clipName: string;
  when: number;
  scores: {
    pitch: number;
    timing: number;
    clarity: number;
    energy: number;
    consistency: number;
    mixReady: number;
    overall: number;
  };
}

export interface ExportEntry {
  id: ID;
  name: string;
  kind: "song" | "region" | "stem" | "midi" | "bundle";
  target?: string;
  when: number;
}

export type ExportFormat = "wav" | "mp3";

export interface ExportSettings {
  format: ExportFormat;
  sampleRate: 44100 | 48000;
  wavBitDepth: 16 | 24;
  mp3Kbps: 128 | 192 | 256 | 320;
  includeMaster: boolean;
  normalizePeak: boolean;
}

export interface SongMoodBoard {
  mood: string;
  genre: string;
  bpm: string;
  songKey: string;
  targetStyle: string;
  emotionTags: string[];
  notes: string;
}

export interface LibraryItem {
  id: ID;
  kind: "loop" | "oneShot" | "preset" | "project" | "export";
  name: string;
  tags: string[];
  favorite: boolean;
  assetId?: ID;
  presetId?: string;
  durationSec?: number;
  createdAt: number;
}

export type BeatSearchSource =
  | "local"
  | "project"
  | "user-library"
  | "beatstars"
  | "youtube"
  | "splice"
  | "soundcloud";

export interface BeatProviderStatus {
  source: BeatSearchSource;
  label: string;
  live: boolean;
  supportsPreview: boolean;
  supportsImport: boolean;
  legalNote: string;
}

export interface BeatSearchFilters {
  query: string;
  genre: string;
  bpmMin: number | null;
  bpmMax: number | null;
  key: string;
  mood: string;
  artistStyle: string;
  energy: "any" | "low" | "medium" | "high";
  tags: string[];
  sources: BeatSearchSource[];
}

export interface BeatSearchResult {
  id: ID;
  source: BeatSearchSource;
  title: string;
  producer: string;
  bpm: number | null;
  key: string | null;
  mood: string[];
  genre: string[];
  energy: number;
  tags: string[];
  durationSec: number | null;
  assetId?: ID | null;
  clipId?: ID | null;
  previewUrl?: string | null;
  externalUrl?: string | null;
  waveform: number[];
  favorite: boolean;
  recentlyPlayedAt?: number | null;
  pinnedProjectId?: ID | null;
  license: {
    kind: "owned" | "royalty-free" | "lease" | "unknown";
    commercialUse: boolean;
    needsVerification: boolean;
  };
  ai: {
    vocalPreset: string;
    micChain: string;
    autotune: string;
    vocalStyle: string;
    effects: string;
    flowPacing: string;
  };
}

export interface BeatCrate {
  id: ID;
  name: string;
  mood: string;
  resultIds: ID[];
  createdAt: number;
  updatedAt: number;
}

export interface ProducerProfileScaffold {
  id: ID;
  displayName: string;
  favorite: boolean;
  profileUrl?: string;
  tags: string[];
  createdAt: number;
}

export interface MarketplaceArchitectureState {
  enabled: false;
  capabilities: Array<
    | "sell-beats"
    | "lease-beats"
    | "upload-user-beats"
    | "producer-profiles"
    | "collaboration-requests"
    | "revenue-splits"
    | "comments-reviews"
  >;
  dataModelsReady: boolean;
  paymentProvider: "queued";
  rightsVerification: "required";
}

export interface YouTubeSafeImportState {
  url: string;
  status: "idle" | "metadata-ready" | "imported" | "blocked";
  note: string;
  importedAssetId?: ID | null;
}

export interface BeatBrowserState {
  filters: BeatSearchFilters;
  results: BeatSearchResult[];
  providerStatuses: BeatProviderStatus[];
  crates: BeatCrate[];
  favorites: ID[];
  recentlyPlayed: ID[];
  pinnedBeatIds: ID[];
  favoriteProducers: ProducerProfileScaffold[];
  youtubeImport: YouTubeSafeImportState;
  marketplace: MarketplaceArchitectureState;
  lastSearchAt: number | null;
  selectedResultId: ID | null;
  searchBusy: boolean;
  analysisQueue: Array<{ id: ID; resultId: ID; kind: "waveform" | "bpm-key" | "breakdown"; status: "queued" | "done" }>;
}

export interface PatternClip {
  id: ID;
  name: string;
  instrument: InstrumentId;
  color: string;
  bars: number;
  swing: number;
  groove: number;
  scaleLock: boolean;
  key: number;
  scale: string;
  notes: MidiNote[];
  tags: string[];
  createdAt: number;
}

export interface VocalSessionSettings {
  punchIn: boolean;
  loopRecord: boolean;
  stackMode: "lead" | "double" | "adlib" | "harmony";
  monitoringDiagnostics: string[];
  activeChainA?: string;
  activeChainB?: string;
  compareSlot: "A" | "B";
}

export type VibeModeId =
  | "off"
  | "late-night"
  | "recording-session"
  | "beatmaking"
  | "emotional-writing"
  | "performance";

export interface ProjectStory {
  vibe: string;
  inspiration: string;
  concept: string;
  references: string[];
  artworkPrompt: string;
  worldNotes: string;
}

export interface InspirationCapture {
  id: ID;
  kind: "voice" | "melody" | "lyric" | "beat" | "rhythm";
  title: string;
  text: string;
  timeSec: number;
  createdAt: number;
  assetId?: ID;
}

export interface MagicMicReport {
  id: ID;
  createdAt: number;
  inputRms: number;
  inputPeak: number;
  roomNoise: "quiet" | "moderate" | "noisy";
  loudness: "low" | "good" | "hot";
  harshnessRisk: "low" | "medium" | "high";
  recommendedInputGain: number;
  recommendedPresetId: string;
  reasons: string[];
}

export type LyricSectionId = "intro" | "verse" | "pre-hook" | "hook" | "bridge" | "outro";

export interface LyricPerformanceMarks {
  punchIn: boolean;
  adlib: boolean;
  harmony: boolean;
  double: boolean;
  breathAfter: boolean;
  emphasisWords: string[];
}

export interface LyricLine {
  id: ID;
  section: LyricSectionId;
  text: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  timeSec?: number | null;
  regionStartSec?: number | null;
  regionEndSec?: number | null;
  clipId?: ID | null;
  moodTags: string[];
  themeTags: string[];
  performance: LyricPerformanceMarks;
}

export interface LyricStudio {
  lines: LyricLine[];
  activeSection: LyricSectionId;
  conceptNotes: string;
  hookIdeas: string[];
  unusedLines: string[];
  freestyleCaptures: InspirationCapture[];
  updatedAt: number;
}

export interface ProducerTeamNote {
  id: ID;
  role: "vocal" | "producer" | "mix" | "master" | "songwriter" | "performance";
  title: string;
  detail: string;
  why: string;
  confidence: number;
  severity: "info" | "low" | "medium" | "high";
  lineId?: ID | null;
  trackId?: ID | null;
  clipId?: ID | null;
  timeSec?: number | null;
  action?: "mark-punch" | "mark-adlib" | "mark-double" | "mark-breath" | "save-note";
  status: "open" | "applied" | "dismissed" | "saved";
  createdAt: number;
}

export interface ProducerTeamState {
  notes: ProducerTeamNote[];
  dismissedIds: ID[];
  savedIds: ID[];
  updatedAt: number;
}

export interface BeatGridMarker {
  id: ID;
  timeSec: number;
  beat: number;
  bar: number;
  downbeat: boolean;
  confidence: number;
}

export interface SongSectionAnalysis {
  id: ID;
  name: "Intro" | "Verse" | "Hook" | "Bridge" | "Outro";
  startSec: number;
  endSec: number;
  energy: number;
  vocalSpace: number;
  notes: string[];
}

export interface SongBreakdownAnalysis {
  sections: SongSectionAnalysis[];
  energyCurve: Array<{ timeSec: number; energy: number }>;
  keyEstimate: string;
  scaleEstimate: "major" | "minor" | "unknown";
  chordMood: string;
  producerNotes: string[];
  limitations: string[];
}

export interface BeatIntelligenceAnalysis {
  id: ID;
  createdAt: number;
  sourceClipId: ID | null;
  sourceAssetId: ID | null;
  sourceName: string;
  durationSec: number;
  bpm: number;
  confidence: number;
  downbeatSec: number;
  beatGrid: BeatGridMarker[];
  detectedOnsets: number[];
  breakdown: SongBreakdownAnalysis;
  live: string[];
  queued: string[];
}

export interface VocalTuneAssistReport {
  id: ID;
  createdAt: number;
  clipId: ID;
  clipName: string;
  detectedKey: string;
  suggestedKey: number;
  suggestedScale: "major" | "minor" | "chromatic";
  averageCents: number;
  sharpFlat: "sharp" | "flat" | "centered";
  pitchScore: number;
  timingScore: number;
  breathScore: number;
  deliveryScore: number;
  emotionScore: number;
  suggestedAutotuneStrength: number;
  suggestedRetuneSpeed: number;
  retakeNotes: string[];
  live: string[];
  queued: string[];
}

export interface VocalWarmupDrill {
  id: ID;
  title: string;
  category: "breathing" | "pitch" | "rapTiming" | "singingScale" | "checklist";
  durationMin: number;
  instruction: string;
  completedAt?: number | null;
  feedback?: string;
}

export interface VocalWarmupStudioState {
  drills: VocalWarmupDrill[];
  lastFeedback: string[];
  streakDays: number;
  updatedAt: number;
}

export type LiveDirectorMode = "engineer" | "producer" | "vocalCoach" | "artistDevelopment";

export type LiveVocalIssueKind =
  | "strong"
  | "level"
  | "clipping"
  | "pitch"
  | "timing"
  | "energy"
  | "breath"
  | "plosive"
  | "sibilance"
  | "mud"
  | "harsh"
  | "noise"
  | "pronunciation";

export interface LiveVocalMarker {
  id: ID;
  timeSec: number;
  endSec: number;
  severity: "ok" | "warn" | "bad";
  kind: LiveVocalIssueKind;
  message: string;
  why: string;
  fix: string;
  score: number;
  createdAt: number;
}

export interface LiveWordFeedback {
  id: ID;
  timeSec: number;
  word: string;
  lineId?: ID | null;
  severity: "ok" | "warn" | "bad";
  suggestion: string;
  pronunciation: string;
  emphasis: string;
  createdAt: number;
}

export interface LiveTakeDirectorSummary {
  id: ID;
  takeName: string;
  createdAt: number;
  score: number;
  redoZones: LiveVocalMarker[];
  bestSegments: Array<{ startSec: number; endSec: number; reason: string }>;
  compSuggestions: string[];
  alternateFlows: string[];
  alternateCadences: string[];
}

export interface ArtistProgressSnapshot {
  id: ID;
  createdAt: number;
  sessionName: string;
  score: number;
  pitchConsistency: number;
  timingConsistency: number;
  breathControl: number;
  endurance: number;
  deliveryStrength: number;
  notes: string[];
}

export interface LiveVocalDirectorState {
  enabled: boolean;
  floatingOpen: boolean;
  mode: LiveDirectorMode;
  active: boolean;
  status: "idle" | "listening" | "analyzing" | "summary-ready";
  currentScore: number;
  currentMessage: string;
  currentSeverity: "ok" | "warn" | "bad";
  markers: LiveVocalMarker[];
  wordFeedback: LiveWordFeedback[];
  takeSummaries: LiveTakeDirectorSummary[];
  progress: ArtistProgressSnapshot[];
  weeklySummary: string[];
  warmupFocus: "singing" | "rap" | "melodicRap" | "aggressive" | "soft";
  workerLive: boolean;
  lastFrameAt: number | null;
}

export interface IdeaSnapshot {
  id: ID;
  name: string;
  createdAt: number;
  project: Omit<Project, "ideaSnapshots">;
  summary: string;
}

export interface SmartHistoryEvent {
  id: ID;
  at: number;
  title: string;
  detail: string;
  category:
    | "recording"
    | "arrangement"
    | "vocal"
    | "mix"
    | "master"
    | "performance"
    | "export"
    | "recovery"
    | "creative";
}

export interface PerformanceHealth {
  score: number;
  risk: "low" | "medium" | "high" | "emergency";
  cpuLoad: number;
  memoryLoad: number;
  activeVoices: number;
  liveEffectSlots: number;
  analyzerLoad: number;
  heavyTrackIds: ID[];
  suggestions: string[];
  checkedAt: number;
}

export interface Project {
  id: ID;
  /** Versioned Panther project schema. Migrated before opening. */
  schemaVersion?: number;
  /** App version that last saved this project. */
  savedWithVersion?: string;
  name: string;
  tempo: number;
  createdAt: number;
  updatedAt: number;
  tracks: Track[];
  clips: Clip[];
  assets: AudioAsset[];
  markers: Marker[];
  pads: Pad[];
  loop: LoopRegion;
  master: MasterState;
  reference: ReferenceTrack | null;
  /** Master bus output (linear) gain. */
  masterGain: number;
  /** Timeline length in seconds (grows as clips are added). */
  lengthSec: number;
  /** Owning local profile (null for legacy/global projects). */
  profileId?: ID | null;
  /** Mix groups. */
  buses?: Bus[];
  /** Free-form lyrics / session notes. */
  lyrics?: string;
  /** Starred in the library. */
  favorite?: boolean;
  /** Recent exports for this project. */
  exportHistory?: ExportEntry[];
  exportSettings?: ExportSettings;
  /** Vocal Coach markers + advice. */
  coachNotes?: CoachNote[];
  /** Vocal Coach score history (trend tracking). */
  coachHistory?: CoachScoreEntry[];
  /** Last command typed into the local composer (for re-use / display). */
  lastComposerPrompt?: string;
  /** Master stereo width 0..2 (1 = unchanged); applied at render/playback. */
  stereoWidth?: number;
  /** Mono-below frequency for low-end mono (0 = off). */
  monoBelowHz?: number;
  /** Persisted project intelligence: analysis snapshots, markers, recommendations, and local learning. */
  studioIntelligence?: {
    current: StudioIntelligenceSnapshot | null;
    history: StudioIntelligenceSnapshot[];
    memory: StudioIntelligenceMemory;
  };
  automation?: AutomationLane[];
  libraryItems?: LibraryItem[];
  patterns?: PatternClip[];
  sessionTemplateId?: string;
  vocalSession?: VocalSessionSettings;
  vibeMode?: VibeModeId;
  projectStory?: ProjectStory;
  inspirationCaptures?: InspirationCapture[];
  magicMicReport?: MagicMicReport | null;
  lyricStudio?: LyricStudio;
  producerTeam?: ProducerTeamState;
  beatIntelligence?: BeatIntelligenceAnalysis | null;
  vocalTuneAssist?: VocalTuneAssistReport | null;
  vocalWarmups?: VocalWarmupStudioState;
  liveVocalDirector?: LiveVocalDirectorState;
  beatBrowser?: BeatBrowserState;
  /** Creator planning, snapshots, education, and project-health metadata. */
  moodBoard?: SongMoodBoard;
  producerNotes?: string;
  ideaSnapshots?: IdeaSnapshot[];
  smartHistory?: SmartHistoryEvent[];
  performanceHealth?: PerformanceHealth | null;
}

/** A local user profile. Everything is stored on-disk in IndexedDB; no network,
 *  no real authentication — selecting a profile scopes projects/presets/settings.
 *  The cloud-sync hook (syncId) is reserved for a future optional sync layer. */
export interface Profile {
  id: ID;
  name: string;
  /** Emoji or single-letter avatar. */
  avatar: string;
  color: string;
  createdAt: number;
  lastUsedAt: number;
  /** Preferred devices remembered per profile. */
  preferredInputId: string | null;
  preferredOutputId: string | null;
  inputGain: number;
  accent: string;
  /** Reserved for an optional future cloud-sync layer (unused today). */
  syncId?: string | null;
}

export interface MicState {
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  permission: "unknown" | "granted" | "denied" | "prompt";
  /** Live input level 0..1 (post-input-gain), for the input meter. */
  level: number;
  monitor: boolean;
  /** Input gain applied before recording/monitoring, 0..2. */
  inputGain: number;
  monitorWarningAcknowledged: boolean;
}

export interface TransportState {
  playing: boolean;
  recording: boolean;
  positionSec: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
}

export interface MeterLevels {
  master: { l: number; r: number };
  tracks: Record<ID, number>;
  /** Gain reduction (dB, <= 0) per track from compressor + limiter. */
  reduction: Record<ID, { comp: number; limiter: number }>;
  /** Master chain gain reduction (dB, <= 0). */
  masterReduction: { comp: number; limiter: number };
}

export interface AppSettings {
  selectedDeviceId: string | null;
  inputGain: number;
  monitor: boolean;
  monitorMode: "dry" | "wet";
  monitorWarningAcknowledged: boolean;
  lastProjectId: ID | null;
  // Preferences (Step 5)
  accent?: string;
  autosaveIntervalSec?: number;
  autoCheckUpdates?: boolean;
  releaseChannel?: "stable" | "beta";
  autoDownloadUpdates?: boolean;
  installUpdatesOnClose?: boolean;
  lowCpuMode?: boolean;
  disableVisualizers?: boolean;
  metronomeEnabled?: boolean;
  countInBars?: number;
  setupComplete?: boolean;
  /** Heartbeat: true while the app is open; a stale true on launch = crash. */
  sessionOpen?: boolean;
  /** The active local profile. */
  currentProfileId?: ID | null;
  /** Preferred output (playback) device, where setSinkId is supported. */
  preferredOutputId?: string | null;
}

/** A user-saved preset in the per-profile preset library. */
export interface SavedPreset {
  id: ID;
  profileId: ID;
  /** Which library this belongs to. */
  kind: "vocalChain" | "master" | "instrument";
  name: string;
  createdAt: number;
  /** Payload depends on kind: EffectsState, {effects,outputGain}, or InstrumentId. */
  data: unknown;
  tags?: string[];
  favorite?: boolean;
  source?: "factory" | "user" | "intelligence";
}
