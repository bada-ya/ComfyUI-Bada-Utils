# ComfyUI-Bada-Utils v1.0.2 — Packaging & Install Cleanup

> ⚠️ **Restart ComfyUI after updating** (one server file changed) → then <kbd>Ctrl</kbd>+<kbd>F5</kbd> in your browser.
>
> No new nodes and no new features in this release. It is a maintenance release:
> three maintainer-only files that were accidentally being shipped to every user
> are gone from the download, and the installation instructions now match what
> the repository actually contains.

**🌐 Languages:** [English](RELEASE_NOTES_v1.0.2.md) · [한국어](RELEASE_NOTES_v1.0.2_ko.md)

## 1. What Changed

### Three local-only files are no longer shipped

These were hard-coded to the maintainer's own machine and had no use for anyone
else, but they were being downloaded by every install:

| Removed | Why |
| --- | --- |
| `install_junction.bat` | Hard-coded an absolute path to one specific ComfyUI install. |
| `publish_registry.bat` | Hard-coded an absolute path to one specific Python environment. |
| `package.json` | Declared a Playwright dependency used only to verify changes during development. |

Nothing else depended on them. The nodes, the settings dialog and the missing-node
resolver all behave exactly as in `v1.0.1`.

### Installation instructions corrected

`install_junction.bat` was advertised as the recommended Windows install method,
so removing it left the README pointing at a file that is no longer in the
download. The three methods are now:

1. **ComfyUI Manager** — recommended for everyone
2. **Git Clone**
3. **Manual Junction Link** — the junction workflow is kept, written out as the
   `mklink /J` command with placeholder paths, and labelled development-only

### Development-only references removed from comments

Three code comments pointed at browser-verification scripts that are not part of
the public repository. The observations they record were kept; only the pointers
to now-unreachable files were dropped.

## 2. Upgrade Notes

- Manager detects this release like any other — no action needed beyond
  **Update** → **Restart**.
- Your `config.json`, presets, favourites and Gemini chat history are untouched;
  nothing in this release changes how or where they are stored.
- If you previously used `install_junction.bat` to symlink a working copy, switch
  to the `mklink /J` command in the README (Method 3).