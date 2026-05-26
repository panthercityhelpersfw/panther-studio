# Release Guide

## Normal Installer

Use this when you want a normal Windows installer without update artifacts:

```powershell
npm install
npm run release:installer
```

Outputs:

- `src-tauri/target/release/bundle/nsis/Panther Studio_<version>_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/Panther Studio_<version>_x64_en-US.msi`

## Signed Updater Release

One-time setup:

```powershell
npm run updater:keys
```

Keep `.tauri/panther-updater.key` private. The public key is already configured in `src-tauri/tauri.conf.json`.

Build signed updater artifacts:

```powershell
npm run release:updater
npm run release:manifest
```

The manifest and upload-ready release files are copied to:

```text
release/update-feed/
```

Upload every file in that directory to the GitHub Release for the same version. The app checks:

```text
https://github.com/panthercityhelpersfw/panther-studio/releases/latest/download/latest.json
```

If the GitHub owner/repo changes, build with:

```powershell
$env:PANTHER_GITHUB_REPOSITORY="owner/repo"
npm run release:updater
npm run release:manifest
```

or pass `--repo owner/repo`.

## Local 0.1.0 -> 0.1.1 Test

1. Build and install an updater-enabled `0.1.0`:

```powershell
npm run update:local:base
```

2. Install the generated NSIS installer from `src-tauri/target/release/bundle/nsis`.

3. Build the simulated `0.1.1` release:

```powershell
npm run update:local:build
npm run update:local:manifest
npm run update:local:serve
```

The local manifest and installers are copied to `release/update-feed-local/`.

4. Open the installed `0.1.0` app and use Preferences -> Updates -> Check for updates.

Expected result: the app detects `0.1.1`, downloads it from `http://127.0.0.1:17632/latest.json`, installs it, restarts, and About/Preferences shows `0.1.1`.

## Release Checklist

- Version is correct.
- `npm run build` passes.
- Signed updater build passes.
- `release/update-feed/latest.json` contains `windows-x86_64-nsis` and `windows-x86_64-msi` entries.
- Release notes are present in `latest.json`.
- Old installer remains attached for rollback.
- Installed app updates without deleting projects, presets, or settings.
