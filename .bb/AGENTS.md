# bb fork

This checkout is gus's fork of bb: origin zugdev/bb, upstream get-bb/bb. Follow [docs/fork-workflow.md](../docs/fork-workflow.md); it's trunk based and `main` on zugdev/bb is the trunk.

1. Before writing code, check whether bb already does it: `bb settings ui list`, `bb thread-list prefs list`, the plugin settings and `docs/configuration.md`.
2. Build features as plugins under `plugins/<name>` and patch core only when the Plugin SDK can't do it. Bundled plugins (`builtin:` sources) can't be installed from a path, so changing one needs a core rebuild.
3. When you have evidence the work is done (typecheck and tests pass for the changed packages, and you saw it working in the running bb), push your branch, open PRs with `gh pr create --repo zugdev/bb --base main` using the PR template and merge them with `gh pr merge --merge --repo zugdev/bb`. Don't wait to be asked. Never target get-bb/bb.
4. Rebuilding bb.app (`pnpm fork:update --pull`) quits bb and kills every running session, so only the top thread of a task runs it, once, after every child touching core has merged. It asks gus first only when unrelated threads are running. Child threads never run it or ask about it; they report "merged, needs core rebuild" to their parent. Plugin only changes need no rebuild, just a reinstall from the main checkout.
