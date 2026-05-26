import { defaultBuses, type ExportSettings, type LiveVocalDirectorState, type Project } from "../state/types";
import { normalizeStudioMemory } from "../audio/studioIntelligence";
import { defaultBeatBrowser } from "../audio/beatDiscovery";
import { createDefaultWarmups } from "../audio/beatIntelligence";

export const CURRENT_PROJECT_SCHEMA_VERSION = 7;
export const MIN_SUPPORTED_PROJECT_SCHEMA_VERSION = 0;

export interface MigrationResult {
  project: Project;
  fromVersion: number;
  toVersion: number;
  migrations: string[];
}

const appVersion = () => import.meta.env.VITE_APP_VERSION || "0.1.0";

function migration0to1(project: Project): Project {
  return {
    ...project,
    buses: project.buses && project.buses.length ? project.buses : defaultBuses(),
    exportHistory: project.exportHistory ?? [],
    coachNotes: project.coachNotes ?? [],
    coachHistory: project.coachHistory ?? [],
    schemaVersion: 1,
  };
}

function migration1to2(project: Project): Project {
  return {
    ...project,
    studioIntelligence: {
      current: project.studioIntelligence?.current ?? null,
      history: project.studioIntelligence?.history ?? [],
      memory: normalizeStudioMemory(project.studioIntelligence?.memory),
    },
    schemaVersion: 2,
  };
}

function migration2to3(project: Project): Project {
  return {
    ...project,
    automation: project.automation ?? [],
    libraryItems: project.libraryItems ?? [],
    patterns: project.patterns ?? [],
    sessionTemplateId: project.sessionTemplateId ?? "blank-advanced",
    vocalSession: project.vocalSession ?? {
      punchIn: false,
      loopRecord: false,
      stackMode: "lead",
      monitoringDiagnostics: [],
      compareSlot: "A",
    },
    vibeMode: project.vibeMode ?? "off",
    projectStory: project.projectStory ?? {
      vibe: "",
      inspiration: "",
      concept: "",
      references: [],
      artworkPrompt: "",
      worldNotes: "",
    },
    inspirationCaptures: project.inspirationCaptures ?? [],
    magicMicReport: project.magicMicReport ?? null,
    tracks: project.tracks.map((t) => ({ ...t, sends: t.sends ?? {} })),
    clips: project.clips.map((c) => ({
      ...c,
      groupId: c.groupId ?? null,
      locked: c.locked ?? false,
      takeLane: c.takeLane ?? c.take ?? 1,
      compRole: c.compRole ?? "candidate",
    })),
    schemaVersion: 3,
  };
}

function migration3to4(project: Project): Project {
  return {
    ...project,
    lyricStudio: project.lyricStudio ?? {
      lines: [],
      activeSection: "verse",
      conceptNotes: "",
      hookIdeas: [],
      unusedLines: [],
      freestyleCaptures: [],
      updatedAt: Date.now(),
    },
    producerTeam: project.producerTeam ?? {
      notes: [],
      dismissedIds: [],
      savedIds: [],
      updatedAt: Date.now(),
    },
    schemaVersion: 4,
  };
}

function migration4to5(project: Project): Project {
  return {
    ...project,
    beatIntelligence: project.beatIntelligence ?? null,
    vocalTuneAssist: project.vocalTuneAssist ?? null,
    vocalWarmups: project.vocalWarmups ?? createDefaultWarmups(),
    beatBrowser: project.beatBrowser ?? defaultBeatBrowser(),
    schemaVersion: 5,
  };
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

function migration5to6(project: Project): Project {
  return {
    ...project,
    exportSettings: project.exportSettings ?? defaultExportSettings(),
    clips: project.clips.map((c) => ({
      ...c,
      sourceBpm: c.sourceBpm ?? null,
      stretchRatio: c.stretchRatio ?? 1,
      pitchShiftSemitones: c.pitchShiftSemitones ?? 0,
    })),
    schemaVersion: 6,
  };
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

function migration6to7(project: Project): Project {
  return {
    ...project,
    liveVocalDirector: project.liveVocalDirector ?? defaultLiveVocalDirector(),
    schemaVersion: 7,
  };
}

/**
 * Runs before a project is opened or imported. Migrations only touch project
 * JSON metadata and never delete blobs, presets, settings, or user projects.
 */
export function migrateProjectForOpen(input: Project): MigrationResult {
  let project = JSON.parse(JSON.stringify(input)) as Project;
  const fromVersion = project.schemaVersion ?? 0;
  const migrations: string[] = [];

  if (fromVersion < MIN_SUPPORTED_PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Project schema ${fromVersion} is no longer supported by this version of Panther Studio.`
    );
  }

  let version = fromVersion;
  if (version < 1) {
    project = migration0to1(project);
    version = 1;
    migrations.push("0->1 project buses, export history, coach history");
  }
  if (version < 2) {
    project = migration1to2(project);
    version = 2;
    migrations.push("1->2 studio intelligence persistence");
  }
  if (version < 3) {
    project = migration2to3(project);
    version = 3;
    migrations.push("2->3 automation, patterns, vocal sessions, clip workflow metadata");
  }
  if (version < 4) {
    project = migration3to4(project);
    version = 4;
    migrations.push("3->4 lyric studio and producer team notes");
  }
  if (version < 5) {
    project = migration4to5(project);
    version = 5;
    migrations.push("4->5 beat intelligence, tune assist, warmups, and beat browser");
  }
  if (version < 6) {
    project = migration5to6(project);
    version = 6;
    migrations.push("5->6 MP3 export settings, clip BPM, stretch, and pitch metadata");
  }
  if (version < 7) {
    project = migration6to7(project);
    version = 7;
    migrations.push("6->7 live AI vocal director state and progression tracking");
  }

  project.schemaVersion = CURRENT_PROJECT_SCHEMA_VERSION;
  project.savedWithVersion = project.savedWithVersion ?? appVersion();

  return {
    project,
    fromVersion,
    toVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    migrations,
  };
}
