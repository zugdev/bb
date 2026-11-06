import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const MAX_BYTES_PER_FILE = 16 * 1024 * 1024;
const SERVER_LOG_PATTERN = /^server(?:\.\d+)?\.log$/;
export const PROFILE_NAME_PATTERN =
  /^profile-\d+(?:-[0-9a-f-]{36})?\.cpuprofile$/;

export interface LogFile {
  path: string;
  bytes: number;
  modifiedAt: number;
}

export function logsDirectory(dataDir: string): string {
  return join(dataDir, "logs");
}

export function profilesDirectory(dataDir: string): string {
  return join(dataDir, "logs", "performance");
}

async function listFiles(
  directory: string,
  pattern: RegExp,
): Promise<LogFile[]> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const files = await Promise.all(
    names
      .filter((name) => pattern.test(name))
      .map(async (name) => {
        const path = join(directory, name);
        try {
          const details = await stat(path);
          return { path, bytes: details.size, modifiedAt: details.mtimeMs };
        } catch (error) {
          if (isMissing(error)) return null;
          throw error;
        }
      }),
  );
  return files
    .filter((file): file is LogFile => file !== null)
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function listServerLogs(dataDir: string): Promise<LogFile[]> {
  return listFiles(logsDirectory(dataDir), SERVER_LOG_PATTERN);
}

export function listProfiles(dataDir: string): Promise<LogFile[]> {
  return listFiles(profilesDirectory(dataDir), PROFILE_NAME_PATTERN);
}

async function readTail(path: string, maxBytes: number): Promise<string> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    const text = buffer.toString("utf8");
    return length < size ? text.slice(text.indexOf("\n") + 1) : text;
  } finally {
    await handle.close();
  }
}

export async function readRecords(
  dataDir: string,
  messages: readonly string[],
): Promise<Record<string, unknown>[]> {
  const needles = messages.map((message) => `"msg":${JSON.stringify(message)}`);
  const records: Record<string, unknown>[] = [];
  for (const file of await listServerLogs(dataDir)) {
    let text: string;
    try {
      text = await readTail(file.path, MAX_BYTES_PER_FILE);
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
    for (const line of text.split("\n")) {
      if (!needles.some((needle) => line.includes(needle))) continue;
      try {
        const value: unknown = JSON.parse(line);
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value)
        )
          records.push(value as Record<string, unknown>);
      } catch {
        continue;
      }
    }
  }
  return records.sort((a, b) => Number(a.time) - Number(b.time));
}

const spanSchema = z.object({ name: z.string(), atMs: z.number() });
export type Span = z.infer<typeof spanSchema>;

const turnTraceRecordSchema = z.object({
  time: z.number(),
  turnTrace: z.object({
    threadId: z.string(),
    hostId: z.string().nullable(),
    commandType: z.string().nullable(),
    outcome: z.string(),
    spans: z.record(z.string(), z.number()),
    rpcs: z.array(
      z.object({
        type: z.string(),
        startMs: z.number(),
        durationMs: z.number(),
        ok: z.boolean(),
      }),
    ),
    daemon: z.object({ spans: z.array(spanSchema) }).nullable(),
  }),
});

export interface TurnTrace {
  at: string;
  threadId: string;
  hostId: string | null;
  commandType: string | null;
  outcome: string;
  firstOutputMs: number | null;
  totalMs: number;
  spans: Span[];
  rpcs: { type: string; startMs: number; durationMs: number; ok: boolean }[];
  daemonSpans: Span[];
}

export function parseTurnTraces(
  records: readonly Record<string, unknown>[],
): TurnTrace[] {
  return records.flatMap((record) => {
    const parsed = turnTraceRecordSchema.safeParse(record);
    if (!parsed.success) return [];
    const trace = parsed.data.turnTrace;
    const spans = Object.entries(trace.spans)
      .map(([name, atMs]) => ({ name, atMs }))
      .sort((a, b) => a.atMs - b.atMs);
    const ends = [
      ...spans.map((span) => span.atMs),
      ...trace.rpcs.map((rpc) => rpc.startMs + rpc.durationMs),
    ];
    return [
      {
        at: new Date(parsed.data.time).toISOString(),
        threadId: trace.threadId,
        hostId: trace.hostId,
        commandType: trace.commandType,
        outcome: trace.outcome,
        firstOutputMs: trace.spans["firstOutput.notified"] ?? null,
        totalMs: Math.max(0, ...ends),
        spans,
        rpcs: trace.rpcs,
        daemonSpans: trace.daemon?.spans ?? [],
      },
    ];
  });
}

const stackSchema = z.object({
  sampledMs: z.number(),
  frames: z.array(
    z.object({
      functionName: z.string(),
      url: z.string(),
      lineNumber: z.number(),
      columnNumber: z.number(),
    }),
  ),
});

const attributionSchema = z.object({
  msg: z.literal("Event loop stall attribution"),
  pid: z.number(),
  startedAt: z.string(),
  endedAt: z.string(),
  delayMs: z.number(),
  stallAttribution: z.string(),
  stacks: z.array(stackSchema),
});

const stalledSchema = z.object({
  msg: z.literal("Event loop stalled"),
  time: z.number(),
  intervalMs: z.number(),
  maxDelayMs: z.number(),
  inFlightWorkAtObservation: z.string().nullish(),
  longestSynchronousWork: z.string().nullish(),
  stallCauseCandidate: z.string().nullish(),
  stallAttribution: z.string(),
});

const profileSavedSchema = z.object({
  msg: z.literal("Server CPU profile saved"),
  pid: z.number(),
  path: z.string(),
  startedAt: z.string(),
  endedAt: z.string(),
});

export interface Stall {
  kind: "sampled" | "observed";
  startedAt: string;
  endedAt: string;
  delayMs: number;
  pid: number | null;
  attribution: string;
  inFlightWork: string | null;
  candidate: string | null;
  stacks: z.infer<typeof stackSchema>[];
  profile: { name: string; path: string } | null;
}

export const STALL_MESSAGES = [
  "Event loop stall attribution",
  "Event loop stalled",
  "Server CPU profile saved",
] as const;

export function parseStalls(
  records: readonly Record<string, unknown>[],
  profileNames: ReadonlySet<string>,
): Stall[] {
  const profiles = records.flatMap((record) => {
    const parsed = profileSavedSchema.safeParse(record);
    if (!parsed.success) return [];
    const name = parsed.data.path.split(/[\\/]/).pop() ?? "";
    if (!profileNames.has(name)) return [];
    return [
      {
        pid: parsed.data.pid,
        name,
        path: parsed.data.path,
        startedAt: Date.parse(parsed.data.startedAt),
        endedAt: Date.parse(parsed.data.endedAt),
      },
    ];
  });
  const profileFor = (
    pid: number | null,
    startedAt: number,
    endedAt: number,
  ) => {
    const match = profiles.find(
      (profile) =>
        (pid === null || profile.pid === pid) &&
        profile.startedAt <= endedAt &&
        profile.endedAt >= startedAt,
    );
    return match === undefined ? null : { name: match.name, path: match.path };
  };
  return records
    .flatMap((record): Stall[] => {
      const sampled = attributionSchema.safeParse(record);
      if (sampled.success) {
        const stall = sampled.data;
        return [
          {
            kind: "sampled",
            startedAt: stall.startedAt,
            endedAt: stall.endedAt,
            delayMs: stall.delayMs,
            pid: stall.pid,
            attribution: stall.stallAttribution,
            inFlightWork: null,
            candidate: null,
            stacks: stall.stacks,
            profile: profileFor(
              stall.pid,
              Date.parse(stall.startedAt),
              Date.parse(stall.endedAt),
            ),
          },
        ];
      }
      const observed = stalledSchema.safeParse(record);
      if (!observed.success) return [];
      const stall = observed.data;
      const startedAt = stall.time - stall.intervalMs;
      return [
        {
          kind: "observed",
          startedAt: new Date(startedAt).toISOString(),
          endedAt: new Date(stall.time).toISOString(),
          delayMs: stall.maxDelayMs,
          pid: null,
          attribution: stall.stallAttribution,
          inFlightWork: stall.inFlightWorkAtObservation ?? null,
          candidate:
            stall.stallCauseCandidate ?? stall.longestSynchronousWork ?? null,
          stacks: [],
          profile: profileFor(null, startedAt, stall.time),
        },
      ];
    })
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

const sampleSchema = z.object({
  time: z.number(),
  p99DelayMs: z.number(),
  maxDelayMs: z.number(),
  eventLoopUtilization: z.number(),
  mainThreadCpuMs: z.number(),
  gcDurationMs: z.number(),
  memory: z.object({ rss: z.number(), heapUsed: z.number() }),
});

export interface Sample {
  at: string;
  p99DelayMs: number;
  maxDelayMs: number;
  eventLoopUtilization: number;
  mainThreadCpuMs: number;
  gcDurationMs: number;
  rssBytes: number;
  heapUsedBytes: number;
}

export function latestSample(
  records: readonly Record<string, unknown>[],
): Sample | null {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const parsed = sampleSchema.safeParse(records[index]);
    if (!parsed.success) continue;
    const sample = parsed.data;
    return {
      at: new Date(sample.time).toISOString(),
      p99DelayMs: sample.p99DelayMs,
      maxDelayMs: sample.maxDelayMs,
      eventLoopUtilization: sample.eventLoopUtilization,
      mainThreadCpuMs: sample.mainThreadCpuMs,
      gcDurationMs: sample.gcDurationMs,
      rssBytes: sample.memory.rss,
      heapUsedBytes: sample.memory.heapUsed,
    };
  }
  return null;
}
