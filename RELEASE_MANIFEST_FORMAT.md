# Release Manifest Format

Each release channel publishes:

- `https://updates.panther.studio/stable/latest.json`
- `https://updates.panther.studio/beta/latest.json`

Example:

```json
{
  "channel": "stable",
  "latestVersion": "1.2.0",
  "minimumSupportedVersion": "1.0.0",
  "projectSchema": {
    "current": 2,
    "minimumReadable": 0
  },
  "critical": false,
  "major": true,
  "releaseDate": "2026-05-26",
  "releaseNotes": "New Studio Intelligence workflow, updater hardening, and project migrations.",
  "updaterEndpoint": "https://updates.panther.studio/stable/windows/x86_64/1.2.0"
}
```

The manifest is advisory and user-facing. The actual executable update must still be delivered through Tauri's signed updater manifest and verified package.
