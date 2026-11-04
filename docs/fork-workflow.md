# Fork workflow

How work lands in this fork (zugdev/bb) when several agent threads run at once. The goals are in [fork-roadmap.md](fork-roadmap.md).

## Rules

1. Build features as plugins under `plugins/<name>` and touch core only when the Plugin SDK can't do it. A plugin installs into the running bb without a rebuild and never conflicts with upstream, so `scripts/fork-update.sh` keeps rebasing cleanly. When core has to change, keep the patch small enough to send upstream as a PR.
2. Give every thread its own worktree and branch. Start code threads with the Git worktree environment (`bb thread spawn --new-environment worktree`, or pick Git worktree in the composer). Two threads in the project checkout overwrite each other's files and end up in each other's commits, which happened on 2026-11-04.
3. Commit each verified change on the thread's branch and never commit to `main`, since `main` mirrors upstream. Commit messages and branch names can't contain "claude" or "anthropic" because the global hooks in `~/.git-hooks` reject them.
4. Push when the work is done, without waiting to be asked. Done means evidence: typecheck and tests pass for the changed packages, and the feature was seen working in the running bb, through the CLI or the UI. Then push the branch with `git push origin <branch>`. `scripts/fork-autopush.sh` pushes every local branch whose tip differs from both `main` and its `origin` copy, with `--dry-run` to list them first. A branch rebased or amended after a push needs `git push --force-with-lease`.

## Plugin loop

1. Install from the thread's worktree: `bb plugin install <worktree>/plugins/<name> --yes`.
2. Run `bb plugin dev <worktree>/plugins/<name>` while working. It rebuilds the plugin and reloads it on every save.
3. Typecheck and test with `pnpm exec turbo run typecheck test --filter=<package name>`.
4. After the branch merges, reinstall from the main checkout so the installed path outlives the worktree.

## Core changes

Rebuild and reinstall bb.app with `pnpm fork:update`, which quits bb, packages the desktop app from this checkout and replaces `/Applications/bb.app`. Run it only from a checkout that has every branch you want merged in.
