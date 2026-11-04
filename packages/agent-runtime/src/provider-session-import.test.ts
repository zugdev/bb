import type { ProviderSessionTurn } from "@bb/provider-bridge-protocol";
import { describe, expect, it } from "vitest";
import { assembleImportedProviderSession } from "./provider-session-import.js";

const MESSAGE_KEY = { providerItemId: "msg-1" };

function turnWithAnswer(index: number): ProviderSessionTurn {
  const base = index * 1000;
  return {
    prompt: `prompt ${index}`,
    startedAt: base,
    steps: [
      { at: base, deltas: [{ kind: "turn.open" }] },
      {
        at: base + 1,
        deltas: [
          {
            kind: "item.open",
            key: MESSAGE_KEY,
            item: { type: "agentMessage", text: "" },
          },
          {
            kind: "item.textDelta",
            key: MESSAGE_KEY,
            channel: "agentMessage",
            text: `answer ${index}`,
          },
          { kind: "item.textClose", key: MESSAGE_KEY, channel: "agentMessage" },
        ],
      },
      {
        at: base + 2,
        deltas: [{ kind: "turn.boundary", status: "completed" }],
      },
    ],
  };
}

describe("assembleImportedProviderSession", () => {
  it("assembles each turn into settled events stamped with their step time", () => {
    const imported = assembleImportedProviderSession({
      providerId: "claude-code",
      session: {
        sessionId: "session-1",
        cwd: "/workspace",
        truncated: false,
        turns: [turnWithAnswer(1), turnWithAnswer(2)],
      },
    });

    expect(imported.turns).toHaveLength(2);
    for (const [index, turn] of imported.turns.entries()) {
      const base = (index + 1) * 1000;
      expect(turn.events.map(({ at, event }) => [at, event.type])).toEqual([
        [base, "turn/started"],
        [base + 1, "item/completed"],
        [base + 2, "turn/completed"],
      ]);
      expect(turn.events[1]?.event).toMatchObject({
        type: "item/completed",
        item: { type: "agentMessage", text: `answer ${index + 1}` },
      });
    }
    const [firstScope, secondScope] = imported.turns.map(
      (turn) => turn.events[0]?.event.scope,
    );
    expect(firstScope).not.toEqual(secondScope);
  });
});
