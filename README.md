
> Lightweight GitHub client integrated directly into your Android root manager WebUI.

**FORGE // GIT** turns your root environment into a local GitHub management node. Access your repositories, monitor GitHub Actions workflows, check releases, and run authenticated GitHub API calls straight from your module WebUI.

---

## Features

- **Root-Level Security**: Personal Access Tokens (PAT) are stored securely under `/data/adb/forge/token` with `0600` root permissions.
- **Full API Bridge**: Lightweight Shell-based API handler supporting `GET`, `POST`, `PATCH`, `DELETE`, and file downloads.
- **Universal Root Support**: Out-of-the-box support for **KernelSU**, **APatch**, and **Magisk**.
- **Action & Release Management**: Download release assets directly to local storage and open them on your system.
- **Zero Heavy Dependencies**: Built on pure Android Shell utilities and `curl`.

---

## Installation

1. Flash the module ZIP using **KernelSU**, **APatch**, or **Magisk**.
2. Reboot your device (or refresh WebUI environment).
3. Open the **WebUI** from the module card inside your root manager app.
4. Navigate to **Settings**, paste your GitHub Personal Access Token, and save.

---

## Requirements

- Android System (`curl` command binary must be available in system or busybox).
- GitHub Personal Access Token (PAT) with `repo` scope.

---

## Directory Structure

- `/data/adb/forge/token`: Encrypted/root-restricted PAT storage.
- `/data/adb/forge/cache/`: Downloaded release assets and temporary buffers.

---
MIT License
