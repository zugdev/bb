import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createNodeVerifiedProcessOps,
  isVerifiedProcessRunning,
  stopVerifiedProcess,
  type VerifiedProcessOps,
} from "@bb/config/verified-process-stop";
import { z } from "zod";

const OWNED_RUNTIME_PID_FILE_NAME = "owned-runtime.json";
const KILL_TIMEOUT_MS = 3_000;

const ownedRuntimePidFileSchema = z.object({
  bridgeModifiedAtMs: z.number().optional(),
  bridgePath: z.string().min(1),
  pid: z.number().int().positive(),
  serverUrl: z.string().min(1),
  startedAt: z.string().min(1),
});

type ReapStaleOwnedRuntimeResult =
  | ClearedStaleOwnedRuntimePidFileResult
  | FailedToStopOwnedRuntimeResult
  | NoStaleOwnedRuntimePidFileResult
  | ReapedStaleOwnedRuntimeResult
  | SkippedStaleOwnedRuntimeResult;

interface OwnedRuntimePidFile {
  bridgeModifiedAtMs?: number;
  bridgePath: string;
  pid: number;
  serverUrl: string;
  startedAt: string;
}

interface WriteOwnedRuntimePidFileArgs {
  bridgePath: string;
  pid: number;
  serverUrl: string;
  userDataPath: string;
}

interface ClearOwnedRuntimePidFileArgs {
  userDataPath: string;
}

interface ReadOwnedRuntimePidFileArgs {
  userDataPath: string;
}

interface ReadAdoptableOwnedRuntimeArgs {
  bridgePath: string;
  processOps?: VerifiedProcessOps;
  serverUrl: string;
  userDataPath: string;
}

interface ReapStaleOwnedRuntimeArgs {
  processOps?: VerifiedProcessOps;
  signal: NodeJS.Signals;
  timeoutMs: number;
  userDataPath: string;
}

interface NoStaleOwnedRuntimePidFileResult {
  kind: "no-pid-file";
}

interface ClearedStaleOwnedRuntimePidFileResult {
  kind: "cleared-stale-pid-file";
  pid: number;
}

interface ReapedStaleOwnedRuntimeResult {
  kind: "reaped";
  pid: number;
}

interface FailedToStopOwnedRuntimeResult {
  kind: "failed-to-stop";
  pid: number;
}

interface SkippedStaleOwnedRuntimeResult {
  command: string | null;
  kind: "skipped-unverified-process";
  pid: number;
}

function ownedRuntimePidFilePath(userDataPath: string): string {
  return join(userDataPath, OWNED_RUNTIME_PID_FILE_NAME);
}

async function readBridgeModifiedAtMs(
  bridgePath: string,
): Promise<number | undefined> {
  try {
    return (await stat(bridgePath)).mtimeMs;
  } catch {
    return undefined;
  }
}

export async function writeOwnedRuntimePidFile(
  args: WriteOwnedRuntimePidFileArgs,
): Promise<void> {
  const pidFile: OwnedRuntimePidFile = {
    bridgeModifiedAtMs: await readBridgeModifiedAtMs(args.bridgePath),
    bridgePath: args.bridgePath,
    pid: args.pid,
    serverUrl: args.serverUrl,
    startedAt: new Date().toISOString(),
  };
  await mkdir(args.userDataPath, { recursive: true });
  const temporaryPath = join(
    args.userDataPath,
    `.${OWNED_RUNTIME_PID_FILE_NAME}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(pidFile, null, 2)}\n`,
      "utf8",
    );
    await rename(temporaryPath, ownedRuntimePidFilePath(args.userDataPath));
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function clearOwnedRuntimePidFile(
  args: ClearOwnedRuntimePidFileArgs,
): Promise<void> {
  await rm(ownedRuntimePidFilePath(args.userDataPath), { force: true });
}

export async function readOwnedRuntimePidFile(
  args: ReadOwnedRuntimePidFileArgs,
): Promise<OwnedRuntimePidFile | null> {
  try {
    const rawPidFile = await readFile(
      ownedRuntimePidFilePath(args.userDataPath),
      "utf8",
    );
    const parsed = ownedRuntimePidFileSchema.safeParse(JSON.parse(rawPidFile));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function readAdoptableOwnedRuntime(
  args: ReadAdoptableOwnedRuntimeArgs,
): Promise<OwnedRuntimePidFile | null> {
  const pidFile = await readOwnedRuntimePidFile({
    userDataPath: args.userDataPath,
  });
  if (
    pidFile === null ||
    pidFile.bridgeModifiedAtMs === undefined ||
    pidFile.bridgePath !== args.bridgePath ||
    pidFile.serverUrl !== args.serverUrl ||
    pidFile.bridgeModifiedAtMs !==
      (await readBridgeModifiedAtMs(args.bridgePath))
  ) {
    return null;
  }
  const running = await isVerifiedProcessRunning({
    pid: pidFile.pid,
    processOps: args.processOps,
    startedAt: pidFile.startedAt,
    verifyTokens: [pidFile.bridgePath],
  });
  return running ? pidFile : null;
}

export async function reapStaleOwnedRuntime(
  args: ReapStaleOwnedRuntimeArgs,
): Promise<ReapStaleOwnedRuntimeResult> {
  const processOps = args.processOps ?? createNodeVerifiedProcessOps();
  const pidFile = await readOwnedRuntimePidFile({
    userDataPath: args.userDataPath,
  });

  if (pidFile === null) {
    return { kind: "no-pid-file" };
  }

  const stopResult = await stopVerifiedProcess({
    killTimeoutMs: KILL_TIMEOUT_MS,
    pid: pidFile.pid,
    processOps,
    signal: args.signal,
    startedAt: pidFile.startedAt,
    timeoutMs: args.timeoutMs,
    verifyTokens: [pidFile.bridgePath],
  });

  if (stopResult.kind === "not-running") {
    await clearOwnedRuntimePidFile({ userDataPath: args.userDataPath });
    return {
      kind: "cleared-stale-pid-file",
      pid: pidFile.pid,
    };
  }

  if (stopResult.kind === "unverified") {
    return {
      command: stopResult.command,
      kind: "skipped-unverified-process",
      pid: pidFile.pid,
    };
  }

  if (stopResult.kind === "still-running") {
    return {
      kind: "failed-to-stop",
      pid: pidFile.pid,
    };
  }

  await clearOwnedRuntimePidFile({ userDataPath: args.userDataPath });
  return {
    kind: "reaped",
    pid: pidFile.pid,
  };
}
