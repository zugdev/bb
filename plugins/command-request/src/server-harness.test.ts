import { describe, expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";

function setup() {
  const host = createFakePluginHost({
    pluginId: "command-request",
    sdk: {
      terminals: {
        async create(args) {
          return { id: args.id };
        },
      },
    },
  });
  plugin(host.bb as unknown as Parameters<typeof plugin>[0]);
  return host;
}

describe("command-request plugin server", () => {
  it("creates the terminal with the displayed command only after Run", async () => {
    const host = setup();
    const command = host.harness.runCli(
      ["request", "haven db migrate new add_x", "--purpose", "Create a migration"],
      { threadId: "thr-test", cwd: "/workspace" },
    );
    await vi.waitFor(() =>
      expect(host.harness.pendingInteractions).toHaveLength(1),
    );
    const pending = host.harness.pendingInteractions[0]!;
    expect(host.harness.sdk.callsTo("terminals.create")).toHaveLength(0);
    const payload = pending.payload as { command: string; terminalId: string };
    expect(payload.command).toBe("haven db migrate new add_x");

    host.harness.submitInteraction(pending.id, {
      action: "run",
      command: "rm -rf /",
    });
    const result = await command;

    expect(result.exitCode).toBe(0);
    const createArgs = host.harness.sdk.callsTo("terminals.create")[0]?.[0];
    expect(createArgs).toMatchObject({
      id: payload.terminalId,
      scope: { kind: "thread", threadId: "thr-test" },
      start: { mode: "command", command: "haven db migrate new add_x" },
    });
    expect(JSON.parse(result.stdout ?? "")).toMatchObject({
      terminalId: payload.terminalId,
    });
  });

  it("never creates a terminal when the user declines", async () => {
    const host = setup();
    const command = host.harness.runCli(["request", "make deploy"], {
      threadId: "thr-test",
      cwd: "/workspace",
    });
    await vi.waitFor(() =>
      expect(host.harness.pendingInteractions).toHaveLength(1),
    );
    host.harness.cancelInteraction(host.harness.pendingInteractions[0]!.id);

    const result = await command;
    expect(result.exitCode).not.toBe(0);
    expect(host.harness.sdk.callsTo("terminals.create")).toHaveLength(0);
  });

  it.each([
    ["ANSI escape", "echo safe\u001b[2K\rrm -rf ~"],
    ["carriage return", "echo safe\rrm -rf ~"],
    ["bidi override", "echo \u202Esafe"],
    ["zero width space", "ls\u200B -la"],
  ])("rejects a command hiding text with %s", async (_label, hidden) => {
    const host = setup();
    const result = await host.harness.runCli(["request", hidden], {
      threadId: "thr-test",
      cwd: "/workspace",
    });
    expect(result.exitCode).not.toBe(0);
    expect(host.harness.pendingInteractions).toHaveLength(0);
  });
});
