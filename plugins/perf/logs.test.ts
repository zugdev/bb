import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listProfiles,
  parseStalls,
  parseTurnTraces,
  readRecords,
  STALL_MESSAGES,
} from "./logs.js";

const PROFILE =
  "profile-1793957000000-0f8fad5b-d9cb-469f-a165-70867728950e.cpuprofile";

function line(fields: object): string {
  return JSON.stringify({ level: 30, component: "server", ...fields });
}

const turnTrace = {
  time: Date.parse("2026-11-06T10:00:05.000Z"),
  msg: "Turn trace",
  turnTrace: {
    threadId: "thr_abc",
    hostId: "host_1",
    commandType: "turn.submit",
    outcome: "output",
    spans: {
      "send.received": 0,
      "command.sent": 40.2,
      "send.responded": 41,
      "firstOutput.notified": 1830.5,
    },
    rpcs: [{ type: "workspace.read", startMs: 5, durationMs: 30, ok: true }],
    daemon: { spans: [{ name: "lanes.entered", atMs: 0.4 }] },
  },
};

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "perf-logs-"));
  await mkdir(join(dataDir, "logs", "performance"), { recursive: true });
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("server log reading", () => {
  it("reads matching records across rotated files in time order and skips broken lines", async () => {
    const older = join(dataDir, "logs", "server.4.log");
    const newer = join(dataDir, "logs", "server.5.log");
    await writeFile(
      older,
      [
        line({
          time: 1,
          msg: "Event loop stalled",
          intervalMs: 5000,
          maxDelayMs: 900,
          stallAttribution: "unattributed",
        }),
        line({ time: 2, msg: "Provider model catalog refresh settled" }),
      ].join("\n"),
    );
    await writeFile(
      newer,
      [line(turnTrace), '{"msg":"Turn trace","time":', ""].join("\n"),
    );
    await utimes(older, new Date(1_000), new Date(1_000));
    await writeFile(
      join(dataDir, "logs", "host-daemon.5.log"),
      line(turnTrace),
    );

    const records = await readRecords(dataDir, [
      "Turn trace",
      "Event loop stalled",
    ]);
    expect(records.map((record) => record.msg)).toEqual([
      "Event loop stalled",
      "Turn trace",
    ]);

    const [trace] = parseTurnTraces(records);
    expect(trace).toMatchObject({
      threadId: "thr_abc",
      firstOutputMs: 1830.5,
      totalMs: 1830.5,
      daemonSpans: [{ name: "lanes.entered", atMs: 0.4 }],
    });
    expect(trace?.spans.map((span) => span.name)).toEqual([
      "send.received",
      "command.sent",
      "send.responded",
      "firstOutput.notified",
    ]);
  });

  it("links a stall to the retained profile of the same process whose window covers it", async () => {
    await writeFile(join(dataDir, "logs", "performance", PROFILE), "{}");
    const profilePath = join(dataDir, "logs", "performance", PROFILE);
    await writeFile(
      join(dataDir, "logs", "server.1.log"),
      [
        line({
          time: Date.parse("2026-11-06T10:00:31Z"),
          msg: "Event loop stall attribution",
          pid: 42,
          startedAt: "2026-11-06T10:00:10.000Z",
          endedAt: "2026-11-06T10:00:10.400Z",
          delayMs: 400,
          stallAttribution: "sampled",
          stacks: [
            {
              sampledMs: 380,
              frames: [
                {
                  functionName: "buildTimeline",
                  url: "file:///server.js",
                  lineNumber: 10,
                  columnNumber: 2,
                },
              ],
            },
          ],
        }),
        line({
          time: Date.parse("2026-11-06T10:00:31Z"),
          msg: "Server CPU profile saved",
          pid: 7,
          path: "/elsewhere/profile-1-other.cpuprofile",
          startedAt: "2026-11-06T10:00:00.000Z",
          endedAt: "2026-11-06T10:00:30.000Z",
        }),
        line({
          time: Date.parse("2026-11-06T10:00:31Z"),
          msg: "Server CPU profile saved",
          pid: 42,
          path: profilePath,
          startedAt: "2026-11-06T10:00:00.000Z",
          endedAt: "2026-11-06T10:00:30.000Z",
        }),
        line({
          time: Date.parse("2026-11-06T11:00:00Z"),
          msg: "Event loop stalled",
          intervalMs: 5000,
          maxDelayMs: 2400,
          inFlightWorkAtObservation: "GET /api/v1/threads",
          longestSynchronousWork: "ws:daemon heartbeat",
          stallCauseCandidate: null,
          stallAttribution: "unattributed",
        }),
      ].join("\n"),
    );
    const profiles = await listProfiles(dataDir);
    const names = new Set(
      profiles.map((profile) => profile.path.split("/").pop() ?? ""),
    );
    const stalls = parseStalls(
      await readRecords(dataDir, STALL_MESSAGES),
      names,
    );

    expect(stalls).toHaveLength(2);
    expect(stalls[0]).toMatchObject({
      kind: "sampled",
      delayMs: 400,
      profile: { name: PROFILE, path: profilePath },
    });
    expect(stalls[1]).toMatchObject({
      kind: "observed",
      delayMs: 2400,
      candidate: "ws:daemon heartbeat",
      startedAt: "2026-11-06T10:59:55.000Z",
      profile: null,
    });
  });
});
