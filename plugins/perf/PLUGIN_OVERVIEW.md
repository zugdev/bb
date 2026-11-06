See where bb lags. The plugin reads the performance diagnostics bb already writes and shows them as a waterfall per sent message and a list of event loop stalls with their CPU profiles.

## What you get

- A Performance page with a waterfall for each turn trace, from the server receiving the message to the first streamed output, including every daemon call it waited on.
- A list of event loop stalls with sampled stacks and a download link for the CPU profile that covers each one.
- `bb perf status`, `bb perf turns [--thread <id>]` and `bb perf stalls`, all with `--json`.

## Turning diagnostics on

Turn traces and CPU profiles need bb started with `BB_PERF_DIAGNOSTICS=1` (or `--perf-diagnostics`) and the Server performance diagnostics experiment on. Stalls over 500 ms are logged without either. Leave diagnostics off for routine use, since profiling adds overhead.

The plugin reads logs on the machine that runs the bb server; daemon timings arrive inside each turn trace.
