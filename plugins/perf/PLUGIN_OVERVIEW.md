See where bb lags. The plugin reads the performance diagnostics bb already writes and prints the turn traces and event loop stalls through `bb perf`.

## What you get

- `bb perf turns [--thread <id>]`: span timings for each turn trace, from the server receiving the message to the first streamed output, including every daemon call it waited on.
- `bb perf stalls`: event loop stalls with sampled stacks and the CPU profile that covers each one.
- `bb perf status`. All three take `--json`.

## Turning diagnostics on

Turn traces and CPU profiles need bb started with `BB_PERF_DIAGNOSTICS=1` (or `--perf-diagnostics`) and the Server performance diagnostics experiment on. Stalls over 500 ms are logged without either. Leave diagnostics off for routine use, since profiling adds overhead.

The plugin reads logs on the machine that runs the bb server; daemon timings arrive inside each turn trace.
