import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { experimental_createBridgeJsonRpcTestHarness as createBridgeJsonRpcTestHarness } from "@get-bb/plugin-sdk/provider-bridge/testing";
import { experimental_killAllChildrenForTests, handleLine } from "./bridge.js";
import {
  FULL_ACCESS_SESSION_OPTIONS,
  stubFakeCodexAppServer,
} from "./fake-codex-app-server-harness.js";

const THREAD_ID = "thr_ephemeral_1";

let harness: ReturnType<typeof createBridgeJsonRpcTestHarness>;
let workspaceDir: string;
let requestLogPath: string;

function appServerThreadStartParams(): Record<string, unknown>[] {
  return readFileSync(requestLogPath, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map(
      (line) =>
        JSON.parse(line) as { method: string; params: Record<string, unknown> },
    )
    .filter((entry) => entry.method === "thread/start")
    .map((entry) => entry.params);
}

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "bb-codex-ephemeral-ws-"));
  requestLogPath = join(workspaceDir, "requests.jsonl");
  const scriptPath = join(workspaceDir, "script.json");
  writeFileSync(scriptPath, JSON.stringify({ requestLogPath }));
  stubFakeCodexAppServer(scriptPath);
  harness = createBridgeJsonRpcTestHarness(handleLine);
});

afterEach(async () => {
  const cleanupId = 994_001;
  harness.sendRequest(cleanupId, "thread/stop", {
    threadId: THREAD_ID,
    providerThreadId: "ephemeral-cleanup",
    intent: "release",
    activeTurnId: null,
  });
  await harness.waitForResponse(cleanupId).catch(() => undefined);
  experimental_killAllChildrenForTests();
  harness.restore();
  vi.unstubAllEnvs();
  rmSync(workspaceDir, { recursive: true, force: true });
});

it.each([
  { ephemeral: true, expected: true },
  { ephemeral: undefined, expected: false },
])(
  "asks the app-server for an ephemeral thread when bb requests one ($ephemeral)",
  async ({ ephemeral, expected }) => {
    harness.sendRequest(1, "thread/start", {
      threadId: THREAD_ID,
      cwd: workspaceDir,
      instructionMode: "append",
      ...(ephemeral === undefined ? {} : { ephemeral }),
      options: { ...FULL_ACCESS_SESSION_OPTIONS },
    });
    const response = await harness.waitForResponse(1);
    expect(response.error).toBeUndefined();

    expect(appServerThreadStartParams()[0]?.ephemeral).toBe(expected);
  },
  30_000,
);
