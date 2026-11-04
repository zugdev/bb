import { describe, expect, it } from "vitest";
import { classifyChanges } from "./classify.js";

const checkout = "/repo/trunk";
const plugins = [
  { id: "assistant", rootDir: "/repo/trunk/plugins/assistant" },
  { id: "elsewhere", rootDir: "/other/plugins/git" },
];

describe("classifyChanges", () => {
  it("is up to date with no changed files", () => {
    expect(classifyChanges(checkout, [], plugins)).toEqual({ kind: "up-to-date" });
  });

  it("reloads plugins installed from the checkout when only their files changed", () => {
    expect(
      classifyChanges(checkout, ["plugins/assistant/app.tsx", "plugins/assistant/server.ts"], plugins),
    ).toEqual({ kind: "plugins", pluginIds: ["assistant"] });
  });

  it("rebuilds when a plugin that is not installed from the checkout changed", () => {
    expect(classifyChanges(checkout, ["plugins/git/server.ts"], plugins)).toEqual({ kind: "rebuild" });
  });

  it("rebuilds when any file outside local plugins changed", () => {
    expect(
      classifyChanges(checkout, ["plugins/assistant/app.tsx", "pnpm-lock.yaml"], plugins),
    ).toEqual({ kind: "rebuild" });
  });
});
