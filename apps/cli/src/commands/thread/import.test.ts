import type { HostProviderSession } from "@bb/server-contract";
import { afterEach, describe, expect, it, vi } from "vitest";
import { importAllSessions } from "./import.js";

function session(sessionId: string): HostProviderSession {
  return {
    sessionId,
    cwd: "/tmp/project",
    title: sessionId,
    updatedAt: 0,
    sizeBytes: 1,
    projectId: "project-1",
    importedThreadId: null,
  };
}

describe("importAllSessions", () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it("keeps importing after a failure and exits nonzero", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const imported: string[] = [];
    await importAllSessions(
      [session("a"), session("b"), session("c")],
      async ({ sessionId }) => {
        if (sessionId === "b") throw new Error("boom");
        imported.push(sessionId);
        return { id: `thread-${sessionId}` };
      },
      { json: true },
    );
    expect(imported).toEqual(["a", "c"]);
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toEqual({
      outcomes: [
        { sessionId: "a", threadId: "thread-a", error: null },
        { sessionId: "b", threadId: null, error: "boom" },
        { sessionId: "c", threadId: "thread-c", error: null },
      ],
    });
    expect(process.exitCode).toBe(1);
  });
});
