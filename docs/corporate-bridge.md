# Corporate bridge

This page tracks how work from this fork moves into a company fork of bb that runs multiplayer, with one shared server and many enrolled hosts. It lists only what lives in zugdev/bb. Notes about the company's own setup belong in the company fork, never here, because zugdev/bb is public.

The unit of transfer is a PR against the company fork. Nothing in this fork auto updates company machines: `plugins/fork-updater` and `pnpm fork:update` pull from zugdev/bb main and stay personal.

## Targets

1. Marketplace: a plugin that uses only the published Plugin SDK. It installs on the company bb with `bb plugin install` and needs no core change. Check it with `pnpm check:plugin-forks plugins/<name>`.
2. Company fork, API first: a plugin that depends on an `experimental_` API this fork added to core. The API lands in the company fork first, then the plugin.
3. Company fork, patch: a core patch cherry-picked into the company fork.
4. Redesign: the idea transfers, but the code assumes one user.
5. Personal: stays here.

## Costs that differ in multiplayer

1. A `HOST_DAEMON_PROTOCOL_VERSION` bump forces every enrolled host to update before it can reconnect. This fork made one bump, 259 to 260, for session import in 3967f84e63. Each bump that ports means one fleet update, so batch them.
2. Migrations are numbered. This fork added `0150_thread_last_user_message_at`, and the company fork has probably used 0150 already, so the migration has to be regenerated against the company schema with Drizzle. Copying the SQL file would break the sequence.
3. Agents in this fork merge their own PRs (see `docs/fork-workflow.md`). In the company fork, agents open PRs and a review gate merges them.

## Inventory

Rows follow the buckets in [fork-roadmap.md](fork-roadmap.md#plugins-over-patches), which has the PRs and file lists.

| Feature | Lives in | Target | Notes |
| --- | --- | --- | --- |
| Profiling plugin, `bb perf` | `plugins/perf` (in progress) | Marketplace | Reads `BB_PERF_DIAGNOSTICS` samples, turn traces and stall cpuprofiles core already writes. Turn traces span server and daemon, which is where multiplayer lag would show. |
| Parent thread link | `plugins/parent-link`, `experimental_threadHeaderLeading`, `toThread({ experimental_inPane })` | Company fork, API first | Two small core APIs. |
| New thread overview | `plugins/home` and the `experimental_*` APIs listed in the roadmap row | Company fork, API first | Also needs the 0150 migration and the pane tabs patch for the pinned tab. Largest dependency chain here. |
| Status rollup of child threads | `ThreadStatusDot.tsx`, `plugins/thread-list` | Company fork, patch | Useful when many agents fan out. |
| Usage readout and reset notifications | `plugins/provider-usage`, `experimental_buttonContent` | Company fork, patch | Edits a bundled plugin. Only useful if the company runs agents on subscriptions. |
| Notifications only on the starting device | `plugins/push-notifications`, core `experimental_clientId` | Company fork, patch | In multiplayer the target is a user and their devices, so check how the company fork routes notifications first. |
| Claude Code session import | daemon, server, bridges, CLI, SDK | Company fork, patch | Protocol bump 260. Port together with any other daemon change. |
| Keep the runtime running when the macOS app quits, resume interrupted turns | desktop and server | Company fork, patch | No protocol bump. Mostly matters for hosts on laptops. |
| Pane tabs and split shortcuts | `split-layout/*`, app keybindings | Company fork, patch | 17 files and 2,162 lines over core layout. Rebasing it is the main cost, so port it only if people ask for it. |
| Small UI fixes: right panel toggle per pane, Compact button, draft pencil size, compact web toggles | app components | Company fork, patch | Independent of each other. Cherry-pick one at a time. |
| New worktrees on a detached HEAD | `plugins/environment-git-worktree` | Company fork, patch | Pairs with the agent instruction to pick a branch from the task. |
| Fork workflow and agent instructions | `docs/fork-workflow.md`, `custom-instructions` plugin | Redesign | Keep one worktree per thread, PRs from agents and parents archiving children. Swap self-merge for the company review gate. |
| Orchestrator | `plugins/orchestrator` | Redesign | Stands in for "the user", which needs an owner per thread in multiplayer. |
| Assistant for Slack and email | `plugins/assistant` | Personal | Reads one person's inboxes. |
| Fork updater | `plugins/fork-updater`, `scripts/fork-*.sh` | Personal | Pulls from zugdev/bb. |
| Desktop window edges, Open in editor removal, search button | app shell, `plugins/navigation` | Personal | Taste. |

## Order

1. Profiling plugin, since it needs nothing from core and helps diagnose the company fork itself.
2. Workflow and agent instructions, adapted to the review gate.
3. The `experimental_` APIs for parent-link, then the plugin.
4. Daemon changes in one batch so hosts update once.
5. Everything else on request.
