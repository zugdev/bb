import { describe, expect, it } from "vitest";
import { buildFindPrompt, parseThreadIds } from "./find.js";

describe("parseThreadIds", () => {
  it("keeps known ids in reply order and drops duplicates and invented ids", () => {
    const known = new Set(["thr_aaa111", "thr_bbb222", "thr_ccc333"]);
    const reply = "thr_bbb222\n- thr_zzz999 (made up)\nthr_aaa111\nthr_bbb222";
    expect(parseThreadIds(reply, known)).toEqual(["thr_bbb222", "thr_aaa111"]);
  });

  it("returns nothing for NONE", () => {
    expect(parseThreadIds("NONE", new Set(["thr_aaa111"]))).toEqual([]);
  });
});

describe("buildFindPrompt", () => {
  it("flattens multiline prompts onto one catalog line", () => {
    const prompt = buildFindPrompt(
      "the inbox fix",
      [{ threadId: "thr_aaa111", projectName: "bb", title: "Fix inbox", firstPrompt: "archive\n\nbutton broken", updatedAt: 0 }],
      2 * 86_400_000,
    );
    expect(prompt).toContain("thr_aaa111 | bb | 2d ago | Fix inbox | archive button broken");
    expect(prompt).toContain("looking for: the inbox fix");
  });
});
