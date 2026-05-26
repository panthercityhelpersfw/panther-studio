# Versioning Policy

Panther Studio uses semantic versioning:

- Patch: bug fixes, documentation, safe UI polish.
- Minor: new features that preserve project compatibility.
- Major: changes that may require visible migration notes or user approval.

## Current App Version

The installed version is read from Tauri via `getVersion()` and from the native command `get_app_paths`.

## Project Schema

Project files carry:

- `schemaVersion`
- `savedWithVersion`

Current project schema is defined in `src/persistence/projectMigrations.ts`.

## Compatibility

The app may open projects at or above `MIN_SUPPORTED_PROJECT_SCHEMA_VERSION`.
Projects are migrated before audio blobs are hydrated or the project is opened.
