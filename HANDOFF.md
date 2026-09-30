# Beta Handoff - 2026-09-30

## Destination

- Repository: `bada-ya/ComfyUI-Bada-Utils-Beta`
- Branch: `main`
- The production repository `bada-ya/ComfyUI-Bada-Utils` must not receive these changes.

## Changes

- Renamed the Bada Prompt Generator node to `Bada Prompt Generator` and connected its node controls, manager modal, and execution notices to the Bada Utils English/Korean language setting.
- Updated Bada Utils settings so preset badge position options and Note Helper labels/descriptions update immediately when the language changes.
- Replaced translation whitelist matching with automatic detection of visible text input/display widgets and a comma-separated node-name blacklist. Hidden, password, API-key, secret, and token widgets are excluded. The previous whitelist setting is not migrated into the blacklist.
- Updated the Prompt Generator UI to use horizontal model and submenu buttons with selected states, removed the blue panel background, and made the panel width follow the node width.
- Made Duration visible only for MINIMAX H3 and LTX2.5, and renamed the model-management control/modal to System Prompt Manager.
- Extended `dev_tests/bada_promptgen_ui_smoke.py` with language-switch coverage.

## Runtime Notes

- Restart the `D:\\StabilityMatrix\\Data\\Packages\\ComfyUI` instance to load Python node registration changes, then hard-refresh the browser to reload frontend assets.
- Do not touch `D:\\StabilityMatrix\\Data\\Packages\\ComfyUI_antig`.
- Automated tests were not run for this handoff, per user request.

## Follow-up

- Confirm the translation blacklist behavior on representative text input and text display nodes.
- Review button wrapping and duration visibility in the Prompt Generator after the ComfyUI restart.
