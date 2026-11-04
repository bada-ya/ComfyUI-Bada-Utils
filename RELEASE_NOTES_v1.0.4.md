## ComfyUI-Bada-Utils v1.0.4

This release brings the latest beta improvements to the stable `main` branch.

### Highlights

- **Prompt Generator and Async Gemini Studio:** added Qwen2.1, FLUX.3, and MOSS.

- **Prompt Generator:** added the optional Pollinations text provider, speed/quality generation modes, improved multi-key rotation and early-stop racing, and clearer failure/refusal handling.
- **Async Gemini Studio:** improved parallel generation, chat key rotation, key handling, and per-tab image attachment limits.
- **Cloud Sync and workflows:** refreshes workflow listings after sync, explains HTTP 409 conflicts without overwriting files, skips symlinks during scans, and improves error reporting.
- **Compatibility and localization:** includes ComfyUI/Impact Pack compatibility fixes and broader Korean/English UI translations.
- **Python support:** declares Python `>=3.10`.

- **Google Drive Sync:** syncs workflows, custom (user-defined) targets, Bada Utils settings files, and Gemini chat history.
- **ComfyUI Nodes 2.0:** added Nodes 2.0 support.

### Verification

- Regression harness: 1250/1250
- Prompt generation plan probe: 17/17
- Studio race and chat probe: 46/46
- Server key check probe: 26/26
- `comfy node validate`: passed

### Upgrade

Update the node in ComfyUI Manager or pull the `main` branch, restart ComfyUI, then hard-refresh the browser with `Ctrl+Shift+R`.
