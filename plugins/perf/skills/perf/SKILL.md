---
name: perf
description: "Diagnose where bb lags: slow first output after sending a message, UI freezes, event loop stalls, slow daemon RPCs. Reads turn traces, stall records and CPU profiles with `bb perf`."
---

# Diagnose bb lag

The `bb perf` commands read the bb server's own logs (`<dataDir>/logs/server.N.log`) and CPU profiles (`<dataDir>/logs/performance/`) on the machine that runs the server. Every command takes `--json`; prefer it when you compare numbers.

1. Run `bb perf status`. `collecting` is true when a `Server performance sample` was logged in the last 30 seconds. If it is false:
   1. `BB_PERF_DIAGNOSTICS set: no` means the server was started without permission. Ask the user before restarting bb with `BB_PERF_DIAGNOSTICS=1` (or `bb-app --perf-diagnostics`), because a restart ends running sessions.
   2. Otherwise ask the user to turn on the `performanceDiagnostics` experiment in Settings → Experiments. It applies without a restart.
2. Reproduce the lag once diagnostics collect, then read what was captured.

## Slow response after sending a message

`bb perf turns [--thread <thr_id>] [--limit N]` lists the newest turn traces. Each span is milliseconds since the server received the send:

1. Large gaps before `command.sent` are server side: `dispatch.checkpoint.done` and `runtimeConfig.*` (workspace reads, plugin config, env). The `rpc` lines show which daemon call the server waited on.
2. `daemon` spans are the host daemon's own offsets from receiving `turn.submit` (`lanes.entered`, `skills.staged`, `runtime.ready`, `input.staged`, `bridge.turnStarted`, `events.flushed`). They use a different clock, so compare durations. `command.settled - command.sent - events.flushed` is network time.
3. A long gap between `command.settled` and `firstOutput.batchReceived` is the provider itself (model latency), which bb can't speed up.
4. `outcome` other than `output` (`not-sent`, `command-failed`, `no-output`, `superseded`, `completed-without-output`) explains a missing first output.

Only sends through the send API are traced; queue drains and retries are not.

## Freezes and stalls

`bb perf stalls [--limit N]` lists event loop stalls, newest first.

1. `sampled` stalls come from `Event loop stall attribution` with the top sampled stacks; they need diagnostics on and arrive at the next profile rotation, within about 30 seconds.
2. `observed` stalls come from `Event loop stalled` (over 500 ms, logged even with diagnostics off). `candidate` names the longest measured synchronous work; it is a hint and the stack is not sampled.
3. `profile` is the retained `.cpuprofile` covering the stall. Load it in Chrome DevTools → Performance, select the stall window (UTC), and read the bottom-up view. Profiles are kept 12 hours, so copy the ones you need. They contain local paths and function names; ask before sharing them.

Report findings with numbers: the span or RPC that took the time, its duration, the thread id and the UTC time.
