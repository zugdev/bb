# bb as the base for a software factory

This paper collects what running the zugdev/bb fork taught us about bb, the design ideas in bb worth keeping, and proposed designs for the three things a factory of many agents needs that bb does not have yet: placing threads on machines automatically, one standard agent lifecycle, and user identity. It describes bb at protocol version 260 (`packages/host-daemon-contract/src/protocol.ts:1`). Company specifics stay out of this repo, see [corporate-bridge.md](corporate-bridge.md) for how work moves to a company fork.

## 1. The shape of bb

One server owns `bb.db`, the product policy and every thread. Machines enroll as hosts and run a host daemon, which runs the provider sessions (Claude Code, Codex, Pi, ACP) inside environments: a project checkout, a worktree, a personal workspace, or a machine a plugin provisions, such as `environment-modal-sandbox`. Desktop, web, mobile, the `bb` CLI and the SDK are all clients of the same server. Plugins extend the server, the daemon and the app through one SDK.

## 2. Design ideas worth keeping

1. The server owns policy and the daemon owns host primitives (AGENTS.md:20-21, `docs/system-overview.md:57-63`). The daemon returns raw data and knows nothing about threads beyond the commands it receives, so a behavior change ships to the whole fleet from one place and any host can be replaced.
2. The protocol version triggers fleet updates. The server rejects a daemon whose version differs and records it (`apps/server/src/internal/session.ts:124-150`), and the daemon then installs the server's build itself, refusing downgrades and insecure transport (`apps/host-daemon/src/protocol-self-update.ts:259-300`). A shared TypeScript build can't check machines that are already enrolled, so one integer makes compatibility an explicit deploy step.
3. Bridges speak the provider's dialect and the runtime owns the timeline. A bridge emits a narrow `thread/delta` grammar and the core assembler mints ids and owns ordering (`docs/provider-bridge-protocol.md:7-12`). Capabilities are negotiated and a handshake can only narrow them (:57-72), and the host drops events outside the grammar (:523-532).
4. Recorded traffic is the regression suite. Record mode writes every bridge boundary to NDJSON with a global sequence, redacted recordings are committed with pinned row counts, and a redaction rule that masks nothing fails the run (`docs/provider-bridge-protocol.md:605-660`).
5. Code bb ships itself gets no privilege. Its providers use only the public API (`docs/provider-plugin-api.md:21-28`), and a plugin API for a core action must be the path core itself uses, with one contract test table for every surface (AGENTS.md:30). The plugin API stays real because core depends on it.
6. New plugin APIs start as `experimental_` with an entry in `docs/api_to_audit.md` naming behavior, stabilization criteria and core callers. The entries record open problems plainly, for example the server wide lock behind `message.dispatch` (`docs/api_to_audit.md:708-763`).
7. CI checks that listed plugins can be forked. It copies each one out of the repo, installs the packed SDK, and typechecks, tests and builds the copy (`docs/forkable-plugins.md:18-44`). This is why a plugin from the fork can install on a company bb unchanged.
8. Hooks decide and events announce. `message.dispatch` handlers answer proceed, wait or reject in a chain that fails closed inside a 10 s limit (`apps/server/src/services/threads/dispatch-hooks.ts:171-208`), and events can't change anything. Concurrency limits are a plugin on that hook (`plugins/concurrency-limit/server.ts:524`).
9. Tests run on real SQLite. Migrations build a template once and each test gets a copy (`packages/db/src/testing.ts:38`), so every test runs on the real schema and still runs fast.
10. The event log is append only and pruned by supersession. Events are unique on `(thread_id, sequence)`, and pruning deletes only superseded snapshots and deltas while keeping the latest event, so sequence allocation and recovery always have a tail (`docs/events-table-pruning.md:3-21`).
11. Subprocess admission keeps local git and network work in separate pools sized by CPU, with waiting work gaining priority (`docs/vcs-process-admission.md:9-25`). A slow push can't starve `git status`.
12. Lifecycle ownership is its own link. `lifecycleOwnerThreadId` is set once, spans projects and hosts, and is separate from the sidebar parent and the fork source (`docs/system-overview.md:30-46`). Archiving the owner archives its dependents, which is what fanning out many agents needs to avoid orphans.

## 3. What running the fork taught us

1. Plugins over patches works, and it takes an audit. The fork's first 34 PRs touched 293 files, 213 of them outside `plugins/`. Sorting every change into plugin, surface, API, upstream or patch ([fork-roadmap.md](fork-roadmap.md#plugins-over-patches)) let us move Home, the New thread overview and the parent link into plugins with small `experimental_` APIs. The parent link move cost core 9 production lines.
2. Edits to bundled plugins are patches. `thread-list`, `navigation` and `push-notifications` live in upstream files, so editing them conflicts on every rebase like any core edit.
3. Core keeps the pieces that own the window. Pane tabs are 17 files and 2,162 lines because no plugin surface owns the split layout or the default keybinding table. That's the largest patch we carry.
4. One protocol bump in the whole fork (259 to 260, session import) was enough to show the cost: every host has to update before it reconnects. Daemon changes should be batched.
5. Replaying real data before designing pays off. A spike pushed 9 Claude transcripts (3,203 messages) through `createClaudeDeltaTranslator` with 0 exceptions, and it showed the import had to synthesize turn boundaries before any code was written. 120 sessions then resolved to 6 repositories.
6. Agent conventions held only as prompts drift. Branch naming, when to archive, how to report to a parent and when to open a PR all live in `custom-instructions` and bb-guide text. Agents mostly follow them, and nothing checks that they do.
7. Agents merging their own PRs works for one person with typecheck, tests and a check in the running app as the gate. A team needs a review gate.
8. A worktree that starts on a detached HEAD lets the agent name the branch after the task, which stopped branches named after threads.
9. Updating the running app from main has to be safe to interrupt. The fork updater nested `bb.app` and left bb unable to start once (#19). It now skips the rebuild when only docs changed and reopens bb after the swap.

## 4. Machine selection and resource management

### Today

The machine is fixed once, when the thread is created, and persisted as the start intent (`apps/server/src/services/threads/thread-create.ts:712`). `resolveCreateThreadEnvironment` (`thread-default-policy.ts:340-476`) uses this ladder:

1. An explicit `--machine`.
2. A child of a live parent in the same project goes to the parent's host.
3. The primary host if it holds a checkout, otherwise the first project source on a persistent host by `isDefault` then `createdAt` (`packages/db/src/data/project-sources.ts:223-249`).
4. Cloud compositions default to a new machine.

Validation checks that the host isn't being removed and that the environment provider's `requires` facts hold. Load is never an input. The daemon heartbeat carries only its type (`packages/host-daemon-contract/src/session.ts:780-784`), so the server knows no CPU, memory or disk for any host. Provider health and auth are fetched per host on demand and never cached for placement.

Capacity is enforced later. `concurrency-limit` answers `wait` from `message.dispatch` when a host is at its limit (default `os.availableParallelism()`), and the message queues until a recheck. The dispatch decision has no amendment arm, and the SDK says that's deliberate: "a hook is a decision, never an owner or an author of the work" (`packages/plugin-sdk/src/backend-contract.ts:572-578`). So a full host makes threads wait even when another host is idle.

### Proposed design

1. Add a placement hook, `experimental_thread.place`, that runs before the start intent is persisted. It gets the project, parent, requested provider and the environment provider's `requires`, and returns a host id, a new machine from a named machine provider, or no opinion. Core's current ladder becomes the default handler, so core and plugins share the path (AGENTS.md:30). This needs no protocol bump. Keeping it separate from `message.dispatch` respects upstream's rule that dispatch hooks only decide.
2. Report load through a plugin host entry, the way `concurrency-limit` reads `availableParallelism` (`plugins/concurrency-limit/host.ts:8-10`): CPU, memory, load average, free disk and installed provider binaries, polled by the server. This needs no protocol bump. Moving it onto the heartbeat later saves the polling but costs a bump.
3. Cache provider health and auth for each host on the server from the existing `provider.health` command, so placement can skip hosts where Claude or Codex isn't logged in.
4. Add host labels (team, region, GPU, trust level) as a column with a route and CLI, set by admins. Placement policies match on labels.
5. Scale out on pressure. When every eligible host is at its limit, the placement plugin asks a machine provider such as `environment-modal-sandbox` for a new machine, and the existing idle suspend (`plugins/environment-modal-sandbox/server.ts:118-140`) scales back down.
6. Later, re-place queued threads that haven't provisioned yet when their host stays full. This needs care since the environment may already be partly created, so it comes after the first five.

The placement policy itself (least loaded, stick to the parent, keep a project on hosts that hold its checkout, cost of a new machine against waiting) lives in a plugin, so a company can change it without patching core.

## 5. A standard agent lifecycle

### Today

bb runs four separate state machines:

1. Thread status has six values, `pending|idle|starting|active|stopping|error`, driven only by run and stop events through one table (`packages/domain/src/thread-lifecycle.ts:30-72`).
2. Turn outcome exists only as an event, `completed|failed|interrupted` (`packages/domain/src/provider-event.ts:48-52`).
3. Queued messages have `queued|scheduled|waiting|failed_retrying|failed_exhausted|claimed` (`packages/domain/src/queued-message-lifecycle.ts:3-91`).
4. Pending interactions have no expiry for provider requests (`apps/server/src/services/interactions/pending-interactions.ts:500`).

On top of those, automations, workflows and tasks each keep their own run status and reconcile it on startup, and workflows, side-chat, assistant, storage-retention and the orchestrator prompt each archive by their own rules. The archive cascade follows three links (lifecycle dependents, sidebar children, hidden forks, `thread-archive.ts:223-231`), while a plain archive detaches children. Nothing times out an active turn: the only watchdog is a warning at 120 s that stops nothing (`packages/agent-runtime/src/runtime.ts:283-308`). The stuck notification mode only filters which events reach the parent.

Recovery is solid. A restarted daemon's active threads are interrupted and resumed with a `runtime-restarted` message, and a disconnected host gets 30 s of grace before its threads show `waiting-for-host`.

### Proposed contract

1. A terminal outcome for every unit of agent work: `succeeded|failed|cancelled|blocked`, with a structured result that follows a schema. Only workflows has this today (`bb_workflow_result`). Automations, tasks and child threads would report through the same record, and their own tables keep only what's specific to them.
2. A `report` tool for agents that sets the outcome and result and notifies the parent. It replaces the prompt rules in bb-guide about final responses and `bb thread tell`.
3. Timeouts in core: a maximum active turn time, a TTL on pending interactions, and an escalation step that goes to the owner, then the parent, then a person.
4. One cascade rule: lifecycle ownership decides archive, delete and stop, and the sidebar parent is display only. Threads with a plugin origin can opt into parent notifications.
5. Spawn defaults set by policy: lifecycle owner, visibility, notification mode, permission mode and budget, applied by a lifecycle plugin from project settings and not repeated in every prompt.
6. A cost budget on the work unit, enforced at `message.dispatch` with `wait` or `reject`, accumulated from `thread/tokenUsage/updated` as it streams. Pruning keeps only the latest root token snapshot, so the plugin has to accumulate the totals itself, and add child usage to the owner's total.

Core owns the outcome record, the report tool, the timeouts and the cascade rule. The policy (defaults, budgets, retention, archive order, factory rules like PR before archive) goes in a plugin.

## 6. Identity comes first

`threads` has no owner column (`packages/db/src/schema.ts:598-650`), and `pending_interactions` stores a resolution without who resolved it (schema.ts:1231-1256). The `user` and `apikey` tables exist (schema.ts:47-61). Budgets, audit, approval routing and the orchestrator's "stand in for the user" all need an owner for each thread, an actor on each event and roles for each project. This is a core change, and it should land in a company fork before any of the plugins below.

## 7. Factory ideas, ranked

1. A review gate and merge queue, as a plugin on the GitHub plugin, which already reads `reviewDecision`, `statusCheckRollup` and review threads (`plugins/github/server.ts:1242-1445`). It holds an agent's PR until CI passes and a reviewer thread on a different model approves, then merges one PR at a time per repo. It needs a GitHub App identity, since the plugin uses one person's `gh` session today.
2. Budgets per team and project, from section 5, once identity exists.
3. An audit trail: export the events with their actor, chain hashes over them to make tampering evident, and keep them outside SQLite.
4. Shared memory across users. The memory plugin already has global and project scopes, provenance, history and an injection check (`plugins/memory/server.ts:813`). It needs team and org scopes and a review queue before writes from many agents reach a catalog everyone shares.
5. Templates for recurring jobs with parameters, an owner and a budget, built on automations, task presets and `.bb/workflows/`. Automation scripts run only on the server host today.
6. Evaluation of agent output on workflows: golden tasks, a judge thread with a rubric, and the same task run on several models. Workflow calls are cached by prompt, model and permission (`plugins/workflows/src/cache.ts:170-192`), so reruns are deterministic.
7. Approval routing. `interaction.pending` fires on every approval request (`docs/api_to_audit.md:765-775`), so a plugin can route it to whoever is on call in Slack and escalate on `expiresAt`. Recording who resolved it needs identity.
8. Change sets across repos: link PRs in several repos so the merge queue lands them together or not at all, using lifecycle ownership across projects.
9. Profiling: `plugins/perf` reads the `BB_PERF_DIAGNOSTICS` samples, stall CPU profiles and turn traces that span server and daemon, and serves them through `bb perf`. It's in progress and installs from the marketplace.

## 8. Order

1. Profiling, since it needs nothing from core and helps measure everything after it.
2. Identity on threads, events and interaction resolutions.
3. The lifecycle outcome record, the report tool and timeouts.
4. The placement hook with load reported through host entries, then labels and scale out.
5. Review gate and merge queue.
6. Budgets, audit, memory scopes, templates, evaluation and approval routing, in the order teams ask for them.

Items 2 to 4 are core changes. Each should go to get-bb/bb as a proposal first, because each adds an `experimental_` API that upstream would have to audit, and carrying them as a fork patch costs a rebase every release.
