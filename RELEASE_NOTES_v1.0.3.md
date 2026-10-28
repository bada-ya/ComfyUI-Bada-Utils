# ComfyUI-Bada-Utils v1.0.3 — Impact Pack Compatibility Fix

> ⚠️ **After updating:** press <kbd>Ctrl</kbd>+<kbd>F5</kbd> in your browser. This release
> changes one frontend file and no server file, so a ComfyUI restart is not required —
> the Manager's **Restart** button is enough if you update through it.
>
> No new nodes and no new features. One compatibility bug is fixed: loading a workflow
> while **ComfyUI-Impact-Pack** is installed could raise
> `findInputSlot is not a function` and leave the canvas half-restored.

**🌐 Languages:** [English](RELEASE_NOTES_v1.0.3.md) · [한국어](RELEASE_NOTES_v1.0.3_ko.md)

## 1. What Changed

### The LoadImage fixer no longer hooks `LGraphNode.prototype.configure`

The Clipboard & LoadImage Auto-Error Fixer used two hooks. One of them wrapped
`LGraphNode.prototype.configure`, which ComfyUI calls while restoring a workflow —
that is, while links are still being rebuilt.

Impact Pack reacts to the same moment through `onConnectionsChange`, and its code can
run before the node's input slots exist. With the extra `configure` hook in the chain
the call order shifted and Impact Pack threw:

```
TypeError: this.findInputSlot is not a function
```

The result was a red error toast and a workflow that only partly loaded.

The fix removes the `configure` hook entirely and keeps the `addWidget` hook, which is
the one that actually heals the LoadImage widget. Workflows that used to fail now load
normally with Impact Pack installed, and the fixer still repairs:

- clipboard images pasted with <kbd>Ctrl</kbd>+<kbd>V</kbd> (the red "invalid image" border)
- `subfolder/name.png` paths that the widget refuses to validate

### Two debug lines removed from the console

`console.debug` calls inside two `catch` blocks fired on every settings lookup. They are
gone; the behaviour is unchanged, the console is just quieter.

### Repository hygiene (not visible to users)

Two maintainer-only paths are now git-ignored so they can never be committed by accident:
`node.zip` (the CNR publish artifact) and `deprecate_version.py` (a one-off script that
needs a live Firebase token). Neither was ever part of the download.

## 2. Upgrade Notes

- **ComfyUI Manager:** **Update** → **Restart**, then <kbd>Ctrl</kbd>+<kbd>F5</kbd>.
- **Git clone:** `git pull`, then <kbd>Ctrl</kbd>+<kbd>F5</kbd>.
- Your `config.json`, presets, favourites and Gemini chat history are untouched.
- Nothing in this release changes node inputs, outputs or widget order, so saved
  workflows keep working as they are.
