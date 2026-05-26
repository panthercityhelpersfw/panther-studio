import type {
  BeatBrowserState,
  BeatProviderStatus,
  BeatSearchFilters,
  BeatSearchResult,
  BeatSearchSource,
  Project,
} from "../state/types";

const DEFAULT_SOURCES: BeatSearchSource[] = ["local", "project", "user-library", "beatstars", "youtube", "splice", "soundcloud"];

export const BEAT_PROVIDER_STATUSES: BeatProviderStatus[] = [
  {
    source: "local",
    label: "Local files",
    live: true,
    supportsPreview: true,
    supportsImport: true,
    legalNote: "Live: previews and imports user-owned audio already stored in Panther.",
  },
  {
    source: "project",
    label: "Current project",
    live: true,
    supportsPreview: true,
    supportsImport: true,
    legalNote: "Live: searches decoded project assets and clips.",
  },
  {
    source: "user-library",
    label: "User beat libraries",
    live: true,
    supportsPreview: true,
    supportsImport: true,
    legalNote: "Live for imported assets; folder-wide indexing is queued for desktop file permissions.",
  },
  {
    source: "beatstars",
    label: "BeatStars",
    live: false,
    supportsPreview: false,
    supportsImport: false,
    legalNote: "Connector queued: requires official API, account auth, and license verification.",
  },
  {
    source: "youtube",
    label: "YouTube",
    live: false,
    supportsPreview: false,
    supportsImport: false,
    legalNote: "Import-safe flow only: paste URL for attribution, attach audio you own or are licensed to use.",
  },
  {
    source: "splice",
    label: "Splice",
    live: false,
    supportsPreview: false,
    supportsImport: false,
    legalNote: "Future provider interface ready; requires official integration and user library authorization.",
  },
  {
    source: "soundcloud",
    label: "SoundCloud",
    live: false,
    supportsPreview: false,
    supportsImport: false,
    legalNote: "Future provider interface ready; stream/import governed by track rights and API terms.",
  },
];

export function defaultBeatFilters(): BeatSearchFilters {
  return {
    query: "",
    genre: "",
    bpmMin: null,
    bpmMax: null,
    key: "",
    mood: "",
    artistStyle: "",
    energy: "any",
    tags: [],
    sources: DEFAULT_SOURCES,
  };
}

export function defaultBeatBrowser(): BeatBrowserState {
  return {
    filters: defaultBeatFilters(),
    results: [],
    providerStatuses: BEAT_PROVIDER_STATUSES,
    crates: [
      { id: "crate-session-picks", name: "Session Picks", mood: "ready", resultIds: [], createdAt: Date.now(), updatedAt: Date.now() },
      { id: "crate-hooks", name: "Hook Ideas", mood: "catchy", resultIds: [], createdAt: Date.now(), updatedAt: Date.now() },
    ],
    favorites: [],
    recentlyPlayed: [],
    pinnedBeatIds: [],
    favoriteProducers: [],
    youtubeImport: {
      url: "",
      status: "idle",
      note: "Paste a YouTube URL for source tracking, then attach audio you own or are licensed to use. Panther will not bypass platform restrictions.",
      importedAssetId: null,
    },
    marketplace: {
      enabled: false,
      capabilities: [
        "sell-beats",
        "lease-beats",
        "upload-user-beats",
        "producer-profiles",
        "collaboration-requests",
        "revenue-splits",
        "comments-reviews",
      ],
      dataModelsReady: true,
      paymentProvider: "queued",
      rightsVerification: "required",
    },
    lastSearchAt: null,
    selectedResultId: null,
    searchBusy: false,
    analysisQueue: [],
  };
}

export function normalizeBeatBrowser(browser?: Partial<BeatBrowserState>): BeatBrowserState {
  const base = defaultBeatBrowser();
  return {
    ...base,
    ...browser,
    filters: { ...base.filters, ...(browser?.filters ?? {}) },
    results: browser?.results ?? base.results,
    providerStatuses: BEAT_PROVIDER_STATUSES,
    crates: browser?.crates?.length ? browser.crates : base.crates,
    favorites: browser?.favorites ?? [],
    recentlyPlayed: browser?.recentlyPlayed ?? [],
    pinnedBeatIds: browser?.pinnedBeatIds ?? [],
    favoriteProducers: browser?.favoriteProducers ?? [],
    youtubeImport: { ...base.youtubeImport, ...(browser?.youtubeImport ?? {}) },
    marketplace: { ...base.marketplace, ...(browser?.marketplace ?? {}) },
    analysisQueue: browser?.analysisQueue ?? [],
  };
}

function textMatch(haystack: string, needle: string) {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function classify(name: string, durationSec: number) {
  const lower = name.toLowerCase();
  const genre: string[] = [];
  const mood: string[] = [];
  const tags: string[] = [];
  if (/trap|808|drill/.test(lower)) genre.push("trap");
  if (/rnb|r&b|soul/.test(lower)) genre.push("rnb");
  if (/pop|dance/.test(lower)) genre.push("pop");
  if (/dark|minor|night/.test(lower)) mood.push("dark");
  if (/sad|pain|emo/.test(lower)) mood.push("emotional");
  if (/hard|rage|aggressive/.test(lower)) mood.push("aggressive");
  if (/chill|smooth|soft/.test(lower)) mood.push("chill");
  if (/type|beat/.test(lower)) tags.push("type beat");
  if (durationSec > 30) tags.push("full beat");
  if (durationSec <= 16) tags.push("loop");
  return {
    genre: genre.length ? genre : ["unknown"],
    mood: mood.length ? mood : ["neutral"],
    tags: tags.length ? tags : ["local audio"],
  };
}

function waveformSeed(id: string, columns = 48) {
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) % 9973;
  return Array.from({ length: columns }, (_, i) => {
    seed = (seed * 48271 + i + 17) % 2147483647;
    return 0.18 + (seed % 1000) / 1250;
  });
}

function aiMatchFor(result: Pick<BeatSearchResult, "energy" | "mood" | "genre" | "bpm" | "key">): BeatSearchResult["ai"] {
  const bright = result.energy > 0.62 || result.mood.includes("dark");
  const rap = result.genre.includes("trap") || (result.bpm ?? 0) >= 130;
  return {
    vocalPreset: bright ? "Bright Airy Vocal" : rap ? "Rap Vocal" : "Clean Pop Vocal",
    micChain: "Bedroom Studio Cleaner",
    autotune: result.key ? `${result.key} / ${rap ? "fast retune" : "natural retune"}` : "Detect key after import",
    vocalStyle: rap ? "tight pocket with short phrase endings" : "open vowels and stronger hook sustain",
    effects: result.energy > 0.7 ? "short throws, tucked reverb" : "wider delay and softer plate",
    flowPacing: result.energy > 0.7 ? "leave dead space before transitions" : "use busier verse cadence, simplify hook",
  };
}

export function buildBeatSearchIndex(project: Project): BeatSearchResult[] {
  const clipByAsset = new Map(project.clips.map((clip) => [clip.assetId, clip]));
  return project.assets
    .filter((asset) => asset.durationSec >= 3)
    .map((asset) => {
      const clip = clipByAsset.get(asset.id);
      const tags = classify(asset.name, asset.durationSec);
      const key = project.beatIntelligence?.sourceAssetId === asset.id ? project.beatIntelligence.breakdown.keyEstimate : null;
      const bpm = project.beatIntelligence?.sourceAssetId === asset.id ? project.beatIntelligence.bpm : null;
      const energy = asset.durationSec > 45 ? 0.72 : 0.48;
      const base = {
        id: `asset:${asset.id}`,
        source: "local" as const,
        title: asset.name.replace(/\.[^.]+$/, ""),
        producer: "Local Library",
        bpm,
        key,
        mood: tags.mood,
        genre: tags.genre,
        energy,
        tags: tags.tags,
        durationSec: asset.durationSec,
        assetId: asset.id,
        clipId: clip?.id ?? null,
        previewUrl: null,
        externalUrl: null,
        waveform: waveformSeed(asset.id),
        favorite: project.beatBrowser?.favorites.includes(`asset:${asset.id}`) ?? false,
        recentlyPlayedAt: null,
        pinnedProjectId: project.beatBrowser?.pinnedBeatIds.includes(`asset:${asset.id}`) ? project.id : null,
        license: { kind: "owned" as const, commercialUse: true, needsVerification: false },
      };
      return { ...base, ai: aiMatchFor(base) };
    });
}

export function searchBeatIndex(project: Project, filters: BeatSearchFilters): BeatSearchResult[] {
  const query = filters.query.trim();
  const index = buildBeatSearchIndex(project);
  return index.filter((result) => {
    const haystack = [
      result.title,
      result.producer,
      result.key ?? "",
      ...result.genre,
      ...result.mood,
      ...result.tags,
      filters.artistStyle,
    ].join(" ");
    const bpmOk =
      (filters.bpmMin == null || (result.bpm ?? project.tempo) >= filters.bpmMin) &&
      (filters.bpmMax == null || (result.bpm ?? project.tempo) <= filters.bpmMax);
    const keyOk = !filters.key || result.key === filters.key;
    const moodOk = !filters.mood || result.mood.some((m) => textMatch(m, filters.mood));
    const genreOk = !filters.genre || result.genre.some((g) => textMatch(g, filters.genre));
    const energyOk =
      filters.energy === "any" ||
      (filters.energy === "low" && result.energy < 0.4) ||
      (filters.energy === "medium" && result.energy >= 0.4 && result.energy < 0.68) ||
      (filters.energy === "high" && result.energy >= 0.68);
    const sourceOk = filters.sources.includes(result.source);
    const tagOk = filters.tags.every((tag) => textMatch(haystack, tag));
    return sourceOk && bpmOk && keyOk && moodOk && genreOk && energyOk && tagOk && textMatch(haystack, query);
  });
}

export function connectorSummary(filters: BeatSearchFilters) {
  const queued = BEAT_PROVIDER_STATUSES.filter((p) => filters.sources.includes(p.source) && !p.live);
  if (!queued.length) return "";
  return queued.map((p) => `${p.label}: ${p.legalNote}`).join(" ");
}
