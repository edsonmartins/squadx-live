# SquadX Live CI/CD Pipeline

## Overview

This document details the GitHub Actions workflows for SquadX Live, covering PR checks, server deployments, desktop builds (Tauri), and package manager publishing.

---

## Workflow Summary

| Workflow         | Trigger                        | Purpose                                |
| ---------------- | ------------------------------ | -------------------------------------- |
| PR Checks        | Pull request, push to main     | Lint, typecheck, test                  |
| Deploy LiveKit   | Push to `apps/livekit/**`      | Deploy SFU server to DigitalOcean      |
| Deploy TURN      | Push to `apps/turn/**`         | Deploy TURN server to DigitalOcean     |
| Tauri Release    | Release tag (v\*)              | Build, sign, publish desktop app       |
| Package Managers | After release                  | Update Homebrew, WinGet, AUR, etc.     |

---

## 1. PR Checks Workflow

**File**: `.github/workflows/pr-checks.yml`

Runs on every pull request and push to main:

- **Lint job**: ESLint, TypeScript type checking, Prettier format check
- **Test job**: Vitest tests with coverage upload to Codecov

```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
```

---

## 2. Deploy LiveKit Workflow

**File**: `.github/workflows/deploy-livekit.yml`

Deploys the LiveKit SFU server to a DigitalOcean droplet via SSH.

**Trigger**: Push to `apps/livekit/**` or manual dispatch

**Domain**: `sfu.live.squadx.dev`

**Required Secrets**:
- `DROPLET_SFU_HOST` - Server IP/hostname
- `DROPLET_SFU_PORT` - SSH port (default: 22)
- `DROPLET_SFU_USER` - SSH username
- `DROPLET_SFU_SSH_KEY` - Base64-encoded SSH private key
- `ENV_FILE` - Environment file with `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`

---

## 3. Deploy TURN Workflow

**File**: `.github/workflows/deploy-turn.yml`

Deploys the TURN server to a DigitalOcean droplet via SSH.

**Trigger**: Push to `apps/turn/**` or manual dispatch

**Domain**: `turn.live.squadx.dev`

**Required Secrets**:
- `DROPLET_HOST` - Server IP/hostname
- `DROPLET_PORT` - SSH port (default: 22)
- `DROPLET_USER` - SSH username
- `DROPLET_SSH_KEY` - Base64-encoded SSH private key
- `TURN_SERVER_CREDENTIAL` - TURN server password

---

## 4. Tauri Desktop Release Workflow

**File**: `.github/workflows/tauri-release.yml`

Builds and releases the Tauri desktop application for macOS, Windows, and Linux.

**Trigger**: Push tag `v*` or manual dispatch with version input

**Build Matrix**:
| OS           | Target                       | Output                    |
| ------------ | ---------------------------- | ------------------------- |
| macOS        | aarch64-apple-darwin         | .dmg (Apple Silicon)      |
| macOS        | x86_64-apple-darwin          | .dmg (Intel)              |
| Windows      | x86_64-pc-windows-msvc       | .exe, .msi                |
| Linux        | x86_64-unknown-linux-gnu     | .AppImage, .deb, .rpm     |

**Required Secrets**:

### macOS Code Signing
- `APPLE_CERTIFICATE` - Base64-encoded .p12 certificate
- `APPLE_CERTIFICATE_PASSWORD` - Certificate password
- `KEYCHAIN_PASSWORD` - Temporary keychain password
- `APPLE_ID` - Apple ID email for notarization
- `APPLE_APP_SPECIFIC_PASSWORD` - App-specific password
- `APPLE_TEAM_ID` - Apple Developer Team ID

### Windows Code Signing
- `WINDOWS_CERTIFICATE` - Base64-encoded .pfx certificate
- `WINDOWS_CERTIFICATE_PASSWORD` - Certificate password

### Tauri Updater Signing
- `TAURI_SIGNING_PRIVATE_KEY` - Private key for updater signatures
- `TAURI_SIGNING_KEY_PASSWORD` - Key password (optional)

---

## 5. Package Submission Workflow

**File**: `.github/workflows/submit-packages.yml`

Submits releases to various package managers after a release is published.

**Trigger**: Release published, repository dispatch, or manual

**Supported Package Managers**:
- Homebrew (macOS)
- Scoop (Windows)
- WinGet (Windows)
- Chocolatey (Windows) - runs on Windows runner
- AUR (Arch Linux)
- APT (Debian/Ubuntu)
- RPM (Fedora/RHEL)
- Nix (NixOS)
- Gentoo

**Required Secrets**:
- `PKG_SUBMIT_TOKEN` - GitHub PAT with repo scope
- `AUR_SSH_KEY` - Base64-encoded SSH key for AUR
- `GPG_PRIVATE_KEY` - Base64-encoded GPG key for signing
- `GPG_PASSPHRASE` - GPG key passphrase
- `CHOCOLATEY_API_KEY` - Chocolatey Community API key

---

## Setting Up Secrets

### 1. Generate SSH Keys for Server Deployment

```bash
# Generate SSH key pair
ssh-keygen -t ed25519 -f squadx-deploy -C "github-actions"

# Base64 encode for GitHub secret
cat squadx-deploy | base64 -w 0 > squadx-deploy.b64

# Add public key to server
ssh-copy-id -i squadx-deploy.pub user@server
```

### 2. Generate Tauri Signing Keys

```bash
# Generate Tauri updater key pair
pnpm tauri signer generate -w ~/.tauri/squadx-live.key

# The private key goes to TAURI_SIGNING_PRIVATE_KEY secret
# The public key goes in tauri.conf.json
```

### 3. macOS Code Signing Certificate

1. Export your Developer ID Application certificate from Keychain Access as .p12
2. Base64 encode: `base64 -i certificate.p12 -o certificate.b64`
3. Set `APPLE_CERTIFICATE` to the base64 content
4. Set `APPLE_CERTIFICATE_PASSWORD` to the export password
5. Generate app-specific password at appleid.apple.com for `APPLE_APP_SPECIFIC_PASSWORD`

### 4. Windows Code Signing Certificate

1. Obtain a code signing certificate from a trusted CA
2. Export as .pfx with private key
3. Base64 encode: `certutil -encode certificate.pfx certificate.b64`
4. Set `WINDOWS_CERTIFICATE` to the base64 content (remove header/footer)
5. Set `WINDOWS_CERTIFICATE_PASSWORD` to the export password

---

## Manual Workflow Triggers

All workflows support manual triggering via `workflow_dispatch`:

```bash
# Trigger Tauri release manually
gh workflow run tauri-release.yml -f version=0.1.0

# Trigger package submission (dry run)
gh workflow run submit-packages.yml -f version=0.1.0 -f dry_run=true

# Trigger server deployment
gh workflow run deploy-livekit.yml
gh workflow run deploy-turn.yml
```

---

## Local Development Commands

```bash
# Run lint, typecheck, and format check
pnpm lint && pnpm typecheck && pnpm format:check

# Run tests
pnpm test

# Build Tauri app locally
pnpm build:tauri

# Build for specific platform
pnpm tauri:build:mac    # macOS universal
pnpm tauri:build:win    # Windows x64
pnpm tauri:build:linux  # Linux x64
```

---

## Troubleshooting

### macOS Notarization Fails
- Ensure `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` are correct
- Check that the certificate is a "Developer ID Application" certificate
- Verify the Team ID matches your Apple Developer account

### Windows Signing Fails
- Ensure the certificate is valid and not expired
- Check that the timestamp URL is accessible
- Verify the certificate has code signing extended key usage

### Linux Build Fails
- Ensure all webkit2gtk dependencies are installed
- Check that patchelf is available for AppImage creation

### Package Submission Fails
- Verify the version exists in GitHub Releases
- Check that required secrets are configured
- Review the workflow logs for specific error messages
