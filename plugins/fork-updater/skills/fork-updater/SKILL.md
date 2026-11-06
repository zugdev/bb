---
name: fork-updater
description: "Check whether the installed bb is behind main of zugdev/bb, and update it by reloading plugins or rebuilding bb.app."
---

# Fork updater

```sh
bb fork-updater status [--json]
bb fork-updater update [--json]
```

1. `status` runs `git fetch origin` in the checkout from the plugin's `checkoutPath` setting and lists the commits between the build the installed app came from and `origin/main`.
2. When every changed file is under `plugins/<name>/` for a plugin installed from that checkout, `update` fast forwards the checkout and reloads those plugins with no restart. Files that never reach the app (`docs/**`, `.github/**`, and `*.md` outside `apps/`, `packages/` and `plugins/`) are ignored, so when only those changed, `status` fast forwards the checkout itself and reports up to date.
3. Any other change makes `update` fast forward, run `pnpm install --frozen-lockfile`, package `@bb/desktop`, then quit bb, replace `/Applications/bb.app` and reopen it. Quitting ends every running session, so ask the user before you run it.
4. `update` refuses when the checkout has uncommitted changes to tracked files. Output from every step goes to `~/.bb/logs/fork-updater.log`. Packaging fails if a bundled plugin in the built app differs from its `plugins/<name>/.bundled-runtime` build. The installed build is recorded only after the swap checks the new app, and a failed swap shows its reason and the log tail in `status`.
5. Plugins listed in `scripts/fork-plugins.json` at `origin/main` that have a bb manifest and are missing from the running bb are installed from the checkout by path. `status` shows them as `Installs N new plugins`. A plugin only update installs them after the reloads; a rebuild installs them once the new bb.app starts and reports the swap. A missing plugin on its own is enough for `status` to offer an update.
