# Fork workflow

How work lands in this fork (zugdev/bb) when several agent threads run at once. It is trunk based: `main` on zugdev/bb is the trunk and holds every fork feature. The goals are in [fork-roadmap.md](fork-roadmap.md).

## Rules

1. Every thread is its own tree. New bb threads get a fresh Git worktree detached at `origin/main` automatically, and the agent creates or checks out the branch the task needs before committing, so parallel threads never share files. Only pick Project checkout for a single thread that has to change the checkout itself.
2. Check what bb already does before writing code. Run `bb settings ui list`, `bb thread-list prefs list` and the plugin settings pages, since many requests are one setting away.
3. Build features as plugins under `plugins/<name>` and touch core only when the Plugin SDK can't do it. A plugin installs into the running bb without a rebuild and stays out of upstream's files.
4. Ship through PRs. When the work has evidence it's done (typecheck and tests pass for the changed packages, and it was seen working in the running bb), push the thread's branch and open one or more PRs against `main` on zugdev/bb with `gh pr create --repo zugdev/bb --base main`, using the repo's PR template. Then merge them with `gh pr merge --merge`. Always pass `--repo zugdev/bb` so nothing goes to upstream get-bb/bb.
5. Resolve conflicts in the thread. If parallel work merged first, merge `origin/main` into the branch, fix the conflicts, rerun the checks, push and merge.
6. Commit messages and branch names can't contain "claude" or "anthropic", because the global hooks in `~/.git-hooks` reject them.

## Getting it into the running bb

1. Plugins: `bb plugin install <worktree>/plugins/<name> --yes` while working, and `bb plugin dev <path>` to reload on every save. After the merge, reinstall from a checkout of `main` so the installed path outlives the worktree. The fork plugins are `plugins/assistant`, `plugins/orchestrator`, `plugins/fork-updater`, `plugins/parent-link` and `plugins/home`; `parent-link` needs a bb.app built from a `main` that has the `experimental_threadHeaderLeading` slot, and `home` one that has `experimental_ProjectPicker`. Without `plugins/home` the New thread screen has no overview.
2. The Fork updater plugin (`plugins/fork-updater`) shows a button in the sidebar footer when the installed bb is behind `main`, and `bb fork-updater status` and `bb fork-updater update` do the same from the CLI. A change limited to plugins installed from its checkout reloads them; anything else runs the rebuild below.
3. Core changes: after the merge, rebuild bb.app from `main` with `pnpm fork:update --pull` in a checkout of `main`. It packages the desktop app, checks every bundled plugin in it against `plugins/<name>/.bundled-runtime`, then quits bb, swaps in the new `/Applications/bb.app` and waits for the server on `:38886`. Add `--no-reopen` to leave bb closed after the swap. Quitting ends running sessions, so ask first. Only one run installs at a time, and a run that starts while another holds `~/.bb/fork-update.lock` waits. If the new app does not answer within about a minute, the script restores the previous app from `~/.bb/bb.app.prev`. To roll back by hand from a terminal, quit bb and run `rm -rf /Applications/bb.app && mv ~/.bb/bb.app.prev /Applications/bb.app`.

## Upstream

Bring upstream in by merging `upstream/main` into a branch off `main` and opening a PR like any other change. Fixes that upstream would want go to get-bb/bb as separate PRs, and only when the user asks.
