# Signing Keys Security

Panther Studio uses Tauri updater signing keys. These are separate from Windows Authenticode code-signing certificates.

## Files

- Private key: `.tauri/panther-updater.key`
- Public key: `.tauri/panther-updater.key.pub`

The private key is ignored by Git through `.gitignore`:

```text
*.key
.tauri/
```

Never commit or upload the private key. Store it in a password manager or CI secret storage.

## CI Secrets

Preferred CI variables:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Local fallback:

- `.tauri/panther-updater.key`

`scripts/build-updater-release.cjs` reads the ignored local key into the child build environment only when CI key variables are absent. It does not write the private key into tracked files.

## Rotate Keys

Only rotate the updater key when necessary. If you change the public key in `tauri.conf.json`, older installed apps that trust the previous key cannot verify updates signed by the new key. To rotate safely, ship one transition release that still uses the old key, then switch future releases.

## Recovery

If a key leaks:

1. Stop publishing updates immediately.
2. Remove the release manifest.
3. Build a full installer with a new key.
4. Tell users to install the full installer manually.
5. Keep projects and settings untouched.
