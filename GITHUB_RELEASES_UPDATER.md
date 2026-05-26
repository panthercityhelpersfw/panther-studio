# GitHub Releases Updater

Panther Studio's default updater endpoint is:

```text
https://github.com/panthercityhelpersfw/panther-studio/releases/latest/download/latest.json
```

For a real production repository, set `PANTHER_GITHUB_REPOSITORY=owner/repo` or pass `--repo owner/repo` when generating release artifacts.

## Required Release Assets

Upload the generated updater files from `release/update-feed/`:

- `latest.json`
- NSIS setup `.exe`
- NSIS setup `.exe.sig`

The app downloads the installer URL listed in `latest.json` and verifies it against the matching `.sig` content and the public key in `tauri.conf.json`. The manifest generator defaults to the NSIS setup exe. Use `--installer msi` only if the release should update through the MSI artifact.

## Manifest Shape

```json
{
  "version": "0.1.1",
  "notes": "Release notes shown in Panther Studio before install.",
  "pub_date": "2026-05-25T00:00:00.000Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<contents of .exe.sig>",
      "url": "https://github.com/owner/repo/releases/download/v0.1.1/Panther%20Studio_0.1.1_x64-setup.exe"
    }
  }
}
```

Tauri v2 matches the platform key as `OS-ARCH`, so Windows x64 must be `windows-x86_64`.

## Commands

```powershell
$env:PANTHER_GITHUB_REPOSITORY="owner/repo"
npm run release:updater
npm run release:manifest
```

To publish an MSI updater artifact instead:

```powershell
npm run release:manifest -- --version 0.1.1 --installer msi
```

To customize release notes:

```powershell
$env:PANTHER_RELEASE_NOTES="Bug fixes, updater hardening, and Windows installer reliability."
npm run release:manifest
```
