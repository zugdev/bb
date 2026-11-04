---
name: fork-updater
description: "Check whether the installed bb is behind main of zugdev/bb, and update it by reloading plugins or rebuilding bb.app."
---

# Fork updater

```sh
bb fork-updater status [--json]
bb fork-updater update [--json] [--no-reopen]
```

1. `status` runs `git fetch origin` in the checkout from the plugin's `checkoutPath` setting and lists the commits between the build the installed app came from and `origin/main`.
2. When every changed file is under `plugins/<name>/` for a plugin installed from that checkout, `update` fast forwards the checkout and reloads those plugins with no restart.
3. Any other change makes `update` fast forward, run `pnpm install --frozen-lockfile`, package `@bb/desktop`, then quit bb, replace `/Applications/bb.app` and reopen it. `--no-reopen` installs the new app and leaves bb closed. Quitting ends every running session, so ask the user before you run it.
4. `update` refuses when the checkout has uncommitted changes to tracked files. Output from every step goes to `~/.bb/logs/fork-updater.log`. Packaging fails if a bundled plugin in the built app differs from its `plugins/<name>/.bundled-runtime` build. The installed build is recorded only after the swap checks the new app, and a failed swap shows its reason and the log tail in `status`.
