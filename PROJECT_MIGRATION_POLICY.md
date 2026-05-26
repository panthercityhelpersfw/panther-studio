# Project Migration Policy

Migrations live in `src/persistence/projectMigrations.ts`.

## Rules

- Run migrations before opening projects.
- Never delete audio blobs, presets, settings, profiles, or backups during migration.
- Migrations only alter project JSON metadata.
- Save the migrated project after successful migration.
- Block only schemas below `MIN_SUPPORTED_PROJECT_SCHEMA_VERSION`.

## Current Migrations

- `0 -> 1`: adds buses, export history, coach markers, and coach history.
- `1 -> 2`: adds persisted Studio Intelligence state and local memory.

## Validation

Every future schema change must include:

- migration function
- migration entry in this document
- save/reload test
- import bundle test
- rollback note
