# Code editor and file tree

Status: **2026-09-05: 3 passed, 1 failed, 2 partial/blocked**. See [the audit](../MAINTENANCE.md) and [per-recipe ledger](../validation-2026-09-05.json).

## Setup and entry points

Open a fixture source file in the Monaco opener; include modified text, a binary, and a text file over 8MB.

Use the main skill’s isolated targets and evidence rules. A plugin can be present
in this checkout but disabled in an installation. Enable it only in the test
store before checking its surfaces. Read its current command/schema definitions
from the source below; CLI references use the matching source CLI described in
SKILL.md. Inspect nested `--help` before selecting flags and IDs.

## Source

- `plugins/monaco-editor/package.json`
- `plugins/monaco-editor/server.ts`
- `plugins/monaco-editor/app.tsx`
- `plugins/monaco-editor/host.ts`
- `plugins/monaco-editor/lib/navigation.ts`

## Feature recipes

| Feature | Drive | Observable success |
| --- | --- | --- |
| Open, edit, save | Open from tree, quick-open, and a thread link; edit/save, close and reopen. | Selected host/path is correct and persisted bytes match the edit. |
| Concurrent edits | Modify the same fixture outside the editor, attempt save, then exercise Reload and Overwrite separately. | Conflict is visible; Reload preserves external content and Overwrite occurs only when explicitly selected. |
| Editing commands | Use find/replace, multiple cursors, folding, sort lines, undo/redo, and copy path where offered. | Each command affects the intended document/selection; keyboard actions do not act on another pane. |
| File tree and filtering | Filter, navigate, and open nested fixture files; switch active editor tab. | Tree selection and editor identity stay aligned; hidden filtered files are not deleted. |
| Themes and opener preference | Change palette/light-dark and set a per-extension opener. | Editor colors follow active theme; future opens obey the saved extension choice. |
| Large and unsupported files | Open the large text fixture, binary, deleted file, and disconnected-host file. | Read-only/fallback/error behavior is clear; unsupported files are not corrupted. |
| Editor tab | Open a thread with an environment, show the right panel, select **Editor**, open a file from the docked tree, reload the page. | The tree is rooted at the thread workspace, the file opens in the same tab, and the same file reopens after reload. |
| Go to definition and hover | In a TypeScript workspace with `typescript` installed, press F12 on an imported symbol, Cmd+click another, hover a third. | The tab switches to the defining file with the cursor on the definition; hover shows the tsserver type; a workspace without `typescript` shows no definitions and no error. |

## Evidence and cleanup

Record each row’s UI/tool/CLI action and observed result separately. Inspect the
registered plugin command and SDK call before claiming agent parity; do not
invent a plugin CLI where the feature uses a core command instead. Preserve
failed attempts and missing prerequisites as unverified results. Restore plugin
configuration and remove only this run’s fixtures, registrations, and workers.
External account changes use authorized disposable targets.

## Maintenance notes

- Current Monaco uses a div[aria-label="Editor content"] native edit context, not necessarily a textarea. Focus that label and send keyboard input; wait for rendering before reading undo/redo results. Source: `plugins/monaco-editor/app.tsx:214`.
