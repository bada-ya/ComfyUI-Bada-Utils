# ComfyUI-Bada-Utils v1.0.1 — Official Release

> ⚠️ **Restart ComfyUI before updating** (server files changed) → then <kbd>Ctrl</kbd>+<kbd>F5</kbd> in your browser.
>
> This release folds every feature and fix built during the beta period into the official channel in one go.

**🌐 Languages:** [English](RELEASE_NOTES_v1.0.1.md) · [한국어](RELEASE_NOTES_v1.0.1_ko.md)

## 1. New Features

1) **Workflow 「Save As」 folder picker**
   - Pick a destination folder directly when saving.
   - Create a new folder in place and save straight into it.
   - Presented as an Explorer-style tree, so folders expand in place.

2) **One-click text & prompt translator**
   - Click once to translate any text in your workflow; click again to return to the original.
   - Nodes that benefit are detected automatically and get a translate button.
   - Whitelist or blacklist specific nodes by name from the settings dialog.
   - Double quotes and proper nouns are preserved verbatim.
   - Rotates across several endpoints automatically to ride out `429 Too Many Requests`.

3) **Prompt Generator (`BadaPromptGenerator`)**
   - 4 target engines: KREA 2 / QWEN2.1 / MiniMax H3 / LTX-Video.
   - Wire it into your graph as a prompt booster or an image analyser.
   - Runs entirely on the Gemini API, so it uses **no VRAM and no local resources**.
   - Bring your own system prompts and register them for use.
   - Typically returns in ~2s; Google's own congestion can make it longer.

4) **Sidebar multi-select and move**
   - Move folders, and move several workflows at once (`Ctrl` / `Shift` + click, then drag).

5) **Legacy Manager search & missing-node detection**
   - Searching a custom node name in the legacy Manager now also loads the fresh cache the new Manager uses. Previously only a stale cache was read, so recently installed nodes could not be found.
   - Fixed the tooltip glitch seen in the legacy Manager.
     Note 1: the legacy Manager is enabled with `--enable-manager-legacy-ui`.
     Note 2: the new Manager is recommended.

## 2. Fixes & Improvements

1) **Sidebar folder rename**
   - Renaming a nested folder returned a 404 and was impossible. Fixed — any folder can now be renamed.

2) **`BadaAsyncGeminiStudio`**
   - Reduced eye strain.
   - Faster: capped model fallback waits and cached the server-side model scan, which removes the 「too many requests」 errors.
   - New QWEN2.1 engine.
   - Reordered engine tabs and tidied the submenus.
   - System prompts can be created, edited and deleted.
   - Added a Gemini chat history store — up to 30 conversations, with backup, restore and clear-all.

3) **`BadaRegionalPrompt` (Visual Regional Prompt)**
   - Reduced eye strain.

4) **Translator**
   - Long text used to fail once it exceeded the URL length limit; it is now sent as a POST body.
   - The translate button's tooltip was clipped and unreadable; fixed.

5) **Popup menus**
   - Folder and preset popups could open off-screen and become unreachable; they are now clamped to the viewport.

6) **Performance & data safety**
   - The model list was rescanned on every request; it is now cached, so the server no longer stalls during a scan.
   - Settings files are written to a temp file and then swapped in, so an interrupted save (a crash, a power cut) can no longer leave them empty.

## 3. Other Bug Fixes

   - Panel height is recalculated on language and node-width changes (the video was being cut off).
   - Removed ghost output sockets left behind in saved workflows.
   - Fixed prompt validation, which passed on partially filled values.
   - Errors that used to be swallowed are now surfaced, with stronger diagnostic logging.
   - Reduced node canvas shaking.
   - Fixed a notification overlay that covered the node with a black slab.
   - Conversations containing images now show a thumbnail, so they are recognisable at a glance in the list.

