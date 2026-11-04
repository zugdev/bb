# Fork roadmap

This fork (zugdev/bb, upstream get-bb/bb) turns bb into one hub for every agent thread across the MacBook, the desktop PC and the phone. Each goal below lists what upstream already ships, the gap, and the work. Features go into plugins where possible so the fork keeps rebasing cleanly on upstream, and general fixes go upstream as PRs.

## 1. All Claude Code and Cursor threads in one place

bb only lists threads it created. It already resumes a Claude session by id (`plugins/provider-claude-code/src/bridge/sdk-session.ts:230`) and reads `~/.claude/projects/*/<id>.jsonl` for forking (`session-fork.ts:93`), but nothing discovers or adopts outside sessions.

This Mac has 120 Claude Code transcripts in 45 project folders (1.7 GB) and 437 Cursor chats with 12,317 messages in `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`.

A spike replayed 9 real transcripts (3,203 messages) through `createClaudeDeltaTranslator` with 0 exceptions. Tool calls and text came out as `item.open`/`item.close`. The jsonl has no SDK `result` messages, so the import has to synthesize `turn.boundary`, and the user's typed prompts come back `unhandled` because live threads record them as server turn input. The spike is at `scratchpad/zz-replay-spike.test.ts` in the session that wrote this doc and is easy to recreate.

1. Daemon command `host.discover_provider_sessions`, modelled on `host.discover_repos` (`packages/host-daemon-contract/src/commands.ts`), returning raw session metadata: provider, session id, cwd, first prompt, mtime, message count. Bump `HOST_DAEMON_PROTOCOL_VERSION` (259 today).
2. Daemon or bridge method that replays one transcript into `ThreadDelta`s: each user text entry closes the previous turn and becomes the next turn's input, everything else goes through the translator.
3. Server service modelled on `apps/server/src/services/threads/thread-fork.ts`: map cwd to a project source, find or create the project, insert the thread with a new `import` origin kind (`packages/domain/src/thread-origin-kind.ts`), store the replayed events plus a `thread.identity` event holding the Claude session id, so sending a message resumes the real session.
4. Route in `apps/server/src/routes/hosts.ts`, `bb thread import` in the CLI, and the SDK call, per AGENTS.md.
5. Settings page listing discoverable sessions with "import" and "import all for this project".

Steps 1 to 4 are done on branch `claude-session-import` (protocol 260, `bb thread import --list` and `bb thread import <sessionId>`, SDK `experimental_listProviderSessions` and `experimental_importProviderSession`). A real 1 MB session imported as 3 turns and 34 items and renders in the timeline. The daemon resolves each session's folder to its main repository with `resolveMainRepositoryRoot` (`packages/host-workspace/src/git.ts`), and the server files the session under the project for its own folder or, failing that, that repository, so worktrees and subfolders import too. On this Mac the 120 sessions resolve to 6 repositories (haven 55, muon 30, solvit 15, pentice 5, fayz 1, bb 1), and 13 are outside any repository. `bb thread import --all [--project <id>]` imports every session that has a project and no thread yet, one at a time, and keeps going past failures. The open gap is a UI.
6. Cursor: read only import from `state.vscdb` (`composerData:*`, `bubbleId:*`). These chats cannot be resumed, so they open as archived threads. `cursor-agent` CLI sessions can use ACP `session/list` and `session/load` instead.

## 2. Threads across MacBook, desktop and phone

Supported upstream with no code: one bb server owns one `bb.db`, and other machines enroll as hosts (`docs/multiple-devices.md`). There is no merge across two servers.

1. Run the bb server on the desktop PC, since it stays on.
2. Expose it with bb Connect, or with Tailscale Serve to keep it private.
3. Enroll the MacBook from Settings, Machines, Add a machine, and pick it as the host when starting threads there.
4. Point the MacBook desktop app at the desktop server from its Server menu, and pair the phone with one code (`bb connect machine-code`).

The MacBook can't start new threads while the desktop is off. Windows and Linux builds are alpha (`docs/platform-support.md`).

## 3. Claude and Codex subscriptions, usage and resets

Mostly built. `plugins/account-pool` connects several Claude (OAuth) and Codex (device code) accounts, `plugins/provider-usage` shows 5 hour and 7 day windows from `api.anthropic.com/api/oauth/usage` and `chatgpt.com/backend-api/wham/usage`, and `plugins/provider-retry` resends a turn after a reset, up to 4 retries capped at 6 hours.

1. Done on branch `usage-reset-notifications`: every 5 minutes `provider-usage` reads usage and sends `notifications.send` when a window last seen at 90% or more has rolled over (`plugins/provider-usage/usage-resets.ts`). Setting `resetNotifications`, default on.
2. Pin a thread to one account. Today the only control is `bb pool bypass <thread>`.
3. Persist usage snapshots for history. `provider-usage/server.ts:159` keeps only the latest in memory.
4. `bb settings usage` and `bb.sdk.system.usageLimits()` show only the host account and should include pooled accounts.
5. Claude credential lookup ignores `CLAUDE_CONFIG_DIR` (`provider-claude-code/src/bridge/provider-maintenance.ts:257`). Fix upstream.

## 4. Slack and email assistants

Plugins can store secret settings, serve signed webhooks, run background services and cron jobs, register agent tools and spawn threads (`packages/plugin-sdk/src/backend-contract.ts:2238`). Automations take cron or one shot triggers only.

1. Start with no code: add Slack and Gmail MCP servers to `~/.claude.json` (the Claude provider loads user settings, `sdk-session.ts:265`) and create cron automations that triage mentions and the inbox.
2. Slack plugin built from `examples/plugins/slack-bot/server.ts`, which already verifies Slack signatures, maps Slack threads to bb threads and posts replies on `thread.idle`.
3. Gmail plugin shaped like `plugins/github/server.ts`: a `background.service` sync, a panel, and a CLI command.
4. Event triggers for automations, so a Slack ping or new email starts a run without polling.
5. Started in `plugins/assistant` (id `assistant`, a local plugin installed with `bb plugin install plugins/assistant`, uncommitted on `split-pane-shortcut`): an Assistant sidebar entry that embeds one long running thread in `proj_personal`. Every 10 minutes it sends new Slack mentions and DMs (xoxp user tokens, one per workspace, through `search.messages`) and unread IMAP mail into that thread. The thread alone gets `assistant_notify`, `slack_search`, `slack_thread`, `email_search` and `email_read`, and it only drafts replies. `bb assistant thread` and `bb assistant check` cover the CLI.

## 5. Split panes and UI

Split panes exist: a tree of up to 8 thread panes with resizing, drag to split, focus and maximize shortcuts, saved in `bb.splitLayout` (`apps/app/src/lib/split-layout/`). There is no command to split the focused pane.

1. Done on branch `split-pane-shortcut`: `pane.split.down` and `pane.split.right` open a new thread composer below or beside the focused pane (`splitFocusedPaneWithNewThread` in `apps/app/src/lib/split-layout/ops.ts`). Every press adds a composer pane with its own draft (`split-new-thread` draft scope in `apps/app/src/hooks/usePromptDraftStorage.ts`), and dragging a pane header onto another pane's edge builds any grid up to 8 panes.
2. Pane tabs on the same branch: `Alt+T` opens a tab with its own split layout or reuses an empty one, `Alt+1` to `Alt+9` switch, `Alt+W` closes the pane or the tab's last pane, `Alt+Shift+T` reopens (`apps/app/src/lib/split-layout/tabs.ts`, `SplitTabBar.tsx`), with no tab limit. The browser keeps `Mod+W` and `Mod+T`, so the web uses `Alt`, while the desktop app uses `Mod+D`, `Mod+W`, `Mod+T` and `Mod+1` to `Mod+9`, which moves the right panel's tab keys to `Mod+Alt` and numbered thread and pane keys to `Control`. `Alt+D` / `Mod+D` splits side by side unless `panes.splitDirection` is `down` (Settings → Keyboard → Split direction). Reasoning cycling moved to `Alt+R`, and the git plugin's diff toggle keeps `Mod+D` on the web.
3. Smoother splits: pane contents render through portals keyed by pane id, so splitting, moving and swapping no longer rebuild panes once 2 or more are open, and pane sizes animate over 150ms. Going from 1 pane to 2 still rebuilds the first pane because a single pane renders outside the split host.
4. Home at `/home` (`apps/app/src/views/HomeView.tsx`, grouping in `home-overview.ts`), always the first tab on `Alt+1`. Tabs remember a project, so composers in a tab opened from a project start there. Home has Needs you, Latest replies and search across every thread, then one section per project with New thread, repo and settings links, a title filter, a sort control and rows sorted by your last message (`lastUserMessageAt`). Edit Home reorders sections by dragging, hides them and adds them back, saved in `bb.home.layout`. The tab bar is 26px in the browser, and the desktop title bar went from 44px to 32px by moving the traffic lights up (`MACOS_TRAFFIC_LIGHT_TOP_INSET_PX` 15 to 9).
5. A personal agent section on Home that suggests what to do next, once goal 4 feeds it Slack and email.
6. Further UI customization as it comes up.

## Community plugins worth using

The `bb-community` marketplace (`https://getbb.app/marketplace/v2/marketplace.json`, 518 entries on 2026-11-03) already covers parts of these goals. Each one is third party code that runs with bb's permissions, so read the source before installing.

1. `pulse` (steveafrost/bb-plugin-pulse): Slack, Gmail and Calendar items on one board, filled by scheduled agent runs, with drafted replies it never sends. Closest match for goal 4.
2. `claude-switcher` and `claude-accounts`: pick the Claude or Codex account per thread, which covers goal 3's account pinning.
3. `usage-pace`: marks whether current usage lasts until each window resets.
4. `telegram-projects` and `discord`: answer threads from the phone through a chat app, one topic per project.
5. `t3-import` and `codex-migrate`: import T3 Code and Codex chats. Both write to `bb.db` directly and need bb and the source app on the same computer, so they don't cover the multi machine setup in goal 2. Our Claude import goes through the host daemon instead.
6. `pane-workspaces` and `fast-split`: saved pane arrangements and a new thread pane from the sidebar footer.
7. `tree-sidebar` and `cursor-sidebar`: alternative project sidebars, if the built in "by project" mode falls short.

## Order

1. mod+D split. Done, see goal 5.
2. Claude Code session import. CLI, SDK, worktree routing and bulk import done, next is a UI.
3. Multi device setup, once the desktop PC is ready.
4. Reset notifications and account pinning.
5. Slack and Gmail through MCP plus automations, then plugins where polling falls short.
6. Cursor history import.
