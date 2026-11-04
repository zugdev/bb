import { describe, expect, it } from "vitest";
import { findTextPart } from "./email.js";
import { newPings, parseSlackTokens, type SlackMessage } from "./slack.js";

const workspace = { token: "xoxp-1", team: "acme", userId: "U_ME" };

function message(ts: string, fromId: string, channelId = "C1"): SlackMessage {
  return { workspace: "acme", channel: "general", channelId, ts, from: fromId, fromId, text: "hi", permalink: "" };
}

describe("newPings", () => {
  it("keeps messages after the cursor from other people, deduped and oldest first", () => {
    const pings = newPings(
      workspace,
      [message("30.0", "U_ANA"), message("10.0", "U_ANA"), message("25.0", "U_ME"), message("30.0", "U_ANA"), message("20.5", "U_BOB", "D1")],
      "15.0",
    );
    expect(pings.map((ping) => ping.ts)).toEqual(["20.5", "30.0"]);
  });
});

describe("parseSlackTokens", () => {
  it("splits on spaces, commas and newlines", () => {
    expect(parseSlackTokens(" xoxp-a, xoxp-b\nxoxp-c ")).toEqual(["xoxp-a", "xoxp-b", "xoxp-c"]);
    expect(parseSlackTokens(undefined)).toEqual([]);
  });
});

describe("findTextPart", () => {
  it("finds the plain text part inside a multipart message", () => {
    expect(
      findTextPart({
        type: "multipart/mixed",
        childNodes: [
          { type: "multipart/alternative", childNodes: [{ type: "text/html", part: "1.2" }, { type: "text/plain", part: "1.1" }] },
        ],
      }),
    ).toBe("1.1");
    expect(findTextPart({ type: "text/html", part: "1" })).toBeUndefined();
  });
});
