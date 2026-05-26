# Update Test Checklist

## Local Simulation

- [ ] Run `npm run update:local:base`.
- [ ] Install `0.1.0` from `src-tauri/target/release/bundle/nsis`.
- [ ] Run `npm run update:local:build`.
- [ ] Run `npm run update:local:manifest`.
- [ ] Run `npm run update:local:serve`.
- [ ] `release/update-feed-local/latest.json` returns HTTP 200.
- [ ] Open installed `0.1.0`.
- [ ] Preferences shows app version `0.1.0`.
- [ ] Manual check detects `0.1.1`.
- [ ] Release notes are visible.
- [ ] Download completes.
- [ ] Install & restart relaunches Panther Studio.
- [ ] Preferences shows app version `0.1.1`.

## GitHub Release

- [ ] `latest.json` is attached to the latest GitHub Release.
- [ ] NSIS `.exe` and `.exe.sig` are attached.
- [ ] MSI `.msi` and `.msi.sig` are attached.
- [ ] `latest.json` URLs download without authentication.
- [ ] `latest.json` signatures exactly match `.sig` contents.
- [ ] Installed app detects the GitHub-hosted version.

## Safety

- [ ] Existing projects remain listed after update.
- [ ] Presets remain listed after update.
- [ ] Settings remain intact after update.
- [ ] Audio blobs still decode after update.
- [ ] A failed update leaves the current app usable.
- [ ] Previous installer remains available in the release archive.

## Startup Safety

- [ ] Normal developer build shows `Developer build: updates disabled.`
- [ ] Production updater build shows `Updates ready` when configured.
- [ ] Network failure shows a Settings error and does not block launch.
- [ ] Missing/invalid manifest shows a Settings error and does not block launch.
- [ ] Boot log records updater skipped, available, failed, downloaded, or installed events.
