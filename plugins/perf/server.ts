import {
  cliCommand,
  defineCli,
  defineRpcContract,
  PluginCliError,
  type BbPluginApi,
} from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  latestSample,
  listProfiles,
  listServerLogs,
  logsDirectory,
  parseStalls,
  parseTurnTraces,
  profilesDirectory,
  readRecords,
  STALL_MESSAGES,
  type LogFile,
  type Sample,
  type Stall,
  type TurnTrace,
} from "./logs.js";

const SAMPLE_FRESH_MS = 30_000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 500;

export interface PerfStatus {
  dataDir: string;
  logsDir: string;
  profilesDir: string;
  diagnosticsAvailable: boolean | null;
  experimentEnabled: boolean | null;
  collecting: boolean;
  latestSample: Sample | null;
  logFiles: LogFile[];
  profiles: { count: number; bytes: number; newestAt: string | null };
}

const limitSchema = z.number().int().min(1).max(MAX_LIMIT);

export const perfRpcContract = defineRpcContract({
  status: { input: z.null(), output: z.custom<PerfStatus>() },
  turns: {
    input: z
      .object({ threadId: z.string().min(1).nullable(), limit: limitSchema })
      .strict(),
    output: z.custom<TurnTrace[]>(),
  },
  stalls: {
    input: z.object({ limit: limitSchema }).strict(),
    output: z.custom<Stall[]>(),
  },
});

const systemConfigSchema = z.object({
  performanceDiagnosticsAvailable: z.boolean(),
  experiments: z.object({ performanceDiagnostics: z.boolean() }),
});

async function readDiagnosticsFlags(baseUrl: string) {
  try {
    const response = await fetch(`${baseUrl}/api/v1/system/config`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const parsed = systemConfigSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 3);
  return `${(value / 1024 ** index).toFixed(1)} ${["B", "KB", "MB", "GB"][index]}`;
}

function formatFlag(value: boolean | null): string {
  return value === null ? "unknown" : value ? "yes" : "no";
}

function formatStatus(status: PerfStatus): string {
  const sample = status.latestSample;
  const lines = [
    `Collecting: ${status.collecting ? "yes" : "no"}`,
    `BB_PERF_DIAGNOSTICS set: ${formatFlag(status.diagnosticsAvailable)}`,
    `performanceDiagnostics experiment: ${formatFlag(status.experimentEnabled)}`,
    `Logs: ${status.logsDir} (${status.logFiles.length} server log files)`,
    `Profiles: ${status.profilesDir} (${status.profiles.count} files, ${formatBytes(status.profiles.bytes)})`,
  ];
  if (sample !== null) {
    lines.push(
      `Latest sample ${sample.at}: p99 ${sample.p99DelayMs.toFixed(1)} ms, max ${sample.maxDelayMs.toFixed(1)} ms, ELU ${sample.eventLoopUtilization.toFixed(2)}, CPU ${sample.mainThreadCpuMs.toFixed(0)} ms, GC ${sample.gcDurationMs.toFixed(0)} ms, RSS ${formatBytes(sample.rssBytes)}`,
    );
  }
  if (!status.collecting) {
    lines.push(
      status.diagnosticsAvailable === false
        ? "Start bb with BB_PERF_DIAGNOSTICS=1 (or --perf-diagnostics), then turn on the performanceDiagnostics experiment."
        : "Turn on the performanceDiagnostics experiment in Settings → Experiments.",
    );
  }
  return lines.join("\n");
}

function formatTurn(trace: TurnTrace): string {
  const head = `${trace.at} ${trace.threadId} ${trace.commandType ?? "-"} ${trace.outcome} first output ${trace.firstOutputMs === null ? "-" : `${trace.firstOutputMs} ms`} total ${trace.totalMs} ms`;
  let previous = 0;
  const spans = trace.spans.map((span) => {
    const line = `  ${span.name.padEnd(28)} @${String(span.atMs).padStart(8)} ms  +${(span.atMs - previous).toFixed(1)} ms`;
    previous = span.atMs;
    return line;
  });
  const rpcs = trace.rpcs.map(
    (rpc) =>
      `  rpc ${rpc.type.padEnd(24)} @${String(rpc.startMs).padStart(8)} ms  ${rpc.durationMs} ms${rpc.ok ? "" : " failed"}`,
  );
  const daemon = trace.daemonSpans.map(
    (span) =>
      `  daemon ${span.name.padEnd(21)} @${String(span.atMs).padStart(8)} ms`,
  );
  return [head, ...spans, ...rpcs, ...daemon].join("\n");
}

function formatStall(stall: Stall): string {
  const lines = [
    `${stall.startedAt} ${stall.delayMs} ms ${stall.kind} ${stall.attribution}${stall.pid === null ? "" : ` pid ${stall.pid}`}`,
  ];
  if (stall.candidate !== null) lines.push(`  candidate: ${stall.candidate}`);
  if (stall.inFlightWork !== null)
    lines.push(`  in flight: ${stall.inFlightWork}`);
  for (const stack of stall.stacks.slice(0, 3)) {
    const top = stack.frames[0];
    if (top === undefined) continue;
    lines.push(
      `  ${stack.sampledMs} ms ${top.functionName} ${top.url}:${top.lineNumber}`,
    );
  }
  lines.push(`  profile: ${stall.profile?.path ?? "none"}`);
  return lines.join("\n");
}

const JSON_OPTION = {
  type: "boolean",
  description: "Emit machine-readable JSON",
} as const;
const LIMIT_OPTION = {
  type: "integer",
  description: `How many of the newest entries to show (1 to ${MAX_LIMIT})`,
  min: 1,
  max: MAX_LIMIT,
  default: DEFAULT_LIMIT,
} as const;

export default async function perfPlugin(bb: BbPluginApi): Promise<void> {
  const dataDir = bb.server.experimental_dataDir;

  async function status(): Promise<PerfStatus> {
    const [flags, logFiles, profiles, samples] = await Promise.all([
      readDiagnosticsFlags(bb.server.loopbackBaseUrl),
      listServerLogs(dataDir),
      listProfiles(dataDir),
      readRecords(dataDir, ["Server performance sample"]),
    ]);
    const sample = latestSample(samples);
    const newest = profiles[0];
    return {
      dataDir,
      logsDir: logsDirectory(dataDir),
      profilesDir: profilesDirectory(dataDir),
      diagnosticsAvailable: flags?.performanceDiagnosticsAvailable ?? null,
      experimentEnabled: flags?.experiments.performanceDiagnostics ?? null,
      collecting:
        sample !== null && Date.now() - Date.parse(sample.at) < SAMPLE_FRESH_MS,
      latestSample: sample,
      logFiles,
      profiles: {
        count: profiles.length,
        bytes: profiles.reduce((total, file) => total + file.bytes, 0),
        newestAt:
          newest === undefined
            ? null
            : new Date(newest.modifiedAt).toISOString(),
      },
    };
  }

  async function turns(
    threadId: string | null,
    limit: number,
  ): Promise<TurnTrace[]> {
    const traces = parseTurnTraces(await readRecords(dataDir, ["Turn trace"]));
    return traces
      .filter((trace) => threadId === null || trace.threadId === threadId)
      .slice(-limit)
      .reverse();
  }

  async function stalls(limit: number): Promise<Stall[]> {
    const [records, profiles] = await Promise.all([
      readRecords(dataDir, STALL_MESSAGES),
      listProfiles(dataDir),
    ]);
    const names = new Set(
      profiles.map((profile) => profile.path.split(/[\\/]/).pop() ?? ""),
    );
    return parseStalls(records, names).slice(-limit).reverse();
  }

  bb.rpc.register(perfRpcContract, {
    status: () => status(),
    turns: ({ threadId, limit }) => turns(threadId, limit),
    stalls: ({ limit }) => stalls(limit),
  });


  bb.cli.register(
    defineCli({
      name: "perf",
      summary: "Read bb performance diagnostics: turn traces and stalls",
      description:
        "Reads the server's own logs and CPU profiles under the data dir. Turn traces and CPU profiles need BB_PERF_DIAGNOSTICS=1 at startup plus the performanceDiagnostics experiment; stalls over 500 ms are logged without them.",
      commands: {
        status: cliCommand({
          summary: "Show whether diagnostics are collecting and where they go",
          options: { json: JSON_OPTION },
          async run(input) {
            const view = await status();
            return {
              exitCode: 0,
              stdout: input.options.json
                ? JSON.stringify(view)
                : formatStatus(view),
            };
          },
        }),
        turns: cliCommand({
          summary: "List recent turn traces with span timings",
          options: {
            thread: {
              type: "string",
              description: "Only traces for this thread id",
            },
            limit: LIMIT_OPTION,
            json: JSON_OPTION,
          },
          async run(input) {
            const thread = input.options.thread ?? null;
            if (thread !== null && !/^thr_\w+$/.test(thread))
              throw new PluginCliError(`Not a thread id: ${thread}`, {
                code: "invalid_thread",
              });
            const traces = await turns(thread, input.options.limit);
            return {
              exitCode: 0,
              stdout: input.options.json
                ? JSON.stringify(traces)
                : traces.length === 0
                  ? "No turn traces. Run `bb perf status` to check that diagnostics are on."
                  : traces.map(formatTurn).join("\n\n"),
            };
          },
        }),
        stalls: cliCommand({
          summary: "List recent event loop stalls and their CPU profiles",
          options: { limit: LIMIT_OPTION, json: JSON_OPTION },
          async run(input) {
            const found = await stalls(input.options.limit);
            return {
              exitCode: 0,
              stdout: input.options.json
                ? JSON.stringify(found)
                : found.length === 0
                  ? "No stalls in the server logs."
                  : found.map(formatStall).join("\n\n"),
            };
          },
        }),
      },
    }),
  );
}
