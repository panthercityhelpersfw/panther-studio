import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AppSettings, Profile, Project, SavedPreset } from "../state/types";

/**
 * IndexedDB schema. In a Tauri app, IndexedDB is physically stored inside the
 * WebView2 user-data directory under the OS app-local-data folder, so this is a
 * real, crash-safe, per-user on-disk store - not browser session storage.
 *
 *  - projects: full project JSON (metadata, tracks, clips, asset metadata)
 *  - blobs:    raw recorded audio bytes (the actual waveform source data)
 *  - settings: app-wide settings (selected device, last project, etc.)
 */
export interface BackupRecord {
  id: string;
  projectId: string;
  createdAt: number;
  project: Project;
}

interface PantherDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { updatedAt: number };
  };
  blobs: {
    key: string;
    value: { id: string; projectId: string; data: Blob };
    indexes: { projectId: string };
  };
  settings: {
    key: string;
    value: unknown;
  };
  backups: {
    key: string;
    value: BackupRecord;
    indexes: { projectId: string };
  };
  profiles: {
    key: string;
    value: Profile;
  };
  presets: {
    key: string;
    value: SavedPreset;
    indexes: { profileId: string };
  };
}

const DB_NAME = "panther-studio";
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<PantherDB>> | null = null;

function getDB(): Promise<IDBPDatabase<PantherDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PantherDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("projects")) {
          const store = db.createObjectStore("projects", { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
        if (!db.objectStoreNames.contains("blobs")) {
          const store = db.createObjectStore("blobs", { keyPath: "id" });
          store.createIndex("projectId", "projectId");
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings");
        }
        if (!db.objectStoreNames.contains("backups")) {
          const store = db.createObjectStore("backups", { keyPath: "id" });
          store.createIndex("projectId", "projectId");
        }
        if (!db.objectStoreNames.contains("profiles")) {
          db.createObjectStore("profiles", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("presets")) {
          const store = db.createObjectStore("presets", { keyPath: "id" });
          store.createIndex("profileId", "profileId");
        }
      },
    });
  }
  return dbPromise;
}

// ---- Projects ----

export async function saveProject(project: Project): Promise<void> {
  const db = await getDB();
  await db.put("projects", project);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const db = await getDB();
  return db.get("projects", id);
}

export async function listProjects(profileId?: string | null): Promise<Project[]> {
  const db = await getDB();
  const all = await db.getAll("projects");
  const filtered =
    profileId == null
      ? all
      : all.filter((p) => (p.profileId ?? null) === profileId || p.profileId == null);
  return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("projects", id);
  // Cascade-delete this project's audio blobs.
  const tx = db.transaction("blobs", "readwrite");
  const idx = tx.store.index("projectId");
  let cursor = await idx.openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// ---- Audio blobs ----

export async function saveBlob(
  id: string,
  projectId: string,
  data: Blob
): Promise<void> {
  const db = await getDB();
  await db.put("blobs", { id, projectId, data });
}

export async function loadBlob(id: string): Promise<Blob | undefined> {
  const db = await getDB();
  const rec = await db.get("blobs", id);
  return rec?.data;
}

export async function deleteBlob(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("blobs", id);
}

/** Remove blobs that are no longer referenced by any clip/asset in the project. */
export async function pruneBlobs(
  projectId: string,
  keepIds: Set<string>
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("blobs", "readwrite");
  const idx = tx.store.index("projectId");
  let cursor = await idx.openCursor(projectId);
  while (cursor) {
    if (!keepIds.has(cursor.value.id)) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}

// ---- Settings ----

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDB();
  await db.put("settings", settings, "app");
}

export async function loadSettings(): Promise<AppSettings | undefined> {
  const db = await getDB();
  return (await db.get("settings", "app")) as AppSettings | undefined;
}

export async function estimateStorage(): Promise<{
  usage: number;
  quota: number;
} | null> {
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  }
  return null;
}

// ---- Backups (recovery) ----

export async function saveBackup(project: Project, keep = 8): Promise<void> {
  const db = await getDB();
  const rec: BackupRecord = {
    id: `${project.id}:${Date.now()}`,
    projectId: project.id,
    createdAt: Date.now(),
    // Structured-clone a deep copy so later mutations don't touch the snapshot.
    project: JSON.parse(JSON.stringify(project)),
  };
  await db.put("backups", rec);
  // Prune to the most recent `keep` per project.
  const all = await db.getAllFromIndex("backups", "projectId", project.id);
  all.sort((a, b) => b.createdAt - a.createdAt);
  const tx = db.transaction("backups", "readwrite");
  for (const old of all.slice(keep)) await tx.store.delete(old.id);
  await tx.done;
}

export async function listBackups(projectId: string): Promise<BackupRecord[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("backups", "projectId", projectId);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function latestBackup(projectId: string): Promise<BackupRecord | undefined> {
  return (await listBackups(projectId))[0];
}

// ---- Profiles ----

export async function listProfiles(): Promise<Profile[]> {
  const db = await getDB();
  const all = await db.getAll("profiles");
  return all.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

export async function saveProfile(profile: Profile): Promise<void> {
  const db = await getDB();
  await db.put("profiles", profile);
}

export async function deleteProfile(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("profiles", id);
  // Cascade: delete this profile's projects + their blobs, and presets.
  const projects = await db.getAll("projects");
  for (const p of projects) {
    if ((p.profileId ?? null) === id) await deleteProject(p.id);
  }
  const presets = await db.getAllFromIndex("presets", "profileId", id);
  const tx = db.transaction("presets", "readwrite");
  for (const pr of presets) await tx.store.delete(pr.id);
  await tx.done;
}

// ---- Preset library ----

export async function listPresets(profileId: string): Promise<SavedPreset[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("presets", "profileId", profileId);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function savePreset(preset: SavedPreset): Promise<void> {
  const db = await getDB();
  await db.put("presets", preset);
}

export async function deletePreset(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("presets", id);
}

// ---- Reset ----

/** Wipe all projects, blobs, backups, and settings (factory reset). */
export async function resetAll(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ["projects", "blobs", "backups", "settings", "profiles", "presets"],
    "readwrite"
  );
  await tx.objectStore("projects").clear();
  await tx.objectStore("blobs").clear();
  await tx.objectStore("backups").clear();
  await tx.objectStore("settings").clear();
  await tx.objectStore("profiles").clear();
  await tx.objectStore("presets").clear();
  await tx.done;
}
