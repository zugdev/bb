import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blockSchema } from "./block";
import { muonFilePath, readMuonFile } from "./muon";

describe("muon paths", () => {
  it("builds all three paths under the root", () => {
    expect(muonFilePath("/m", "a_b.1-c", "instruction")).toBe(
      "/m/tasks/a_b.1-c/instruction.md",
    );
    expect(muonFilePath("/m", "a_b.1-c", "survey")).toBe(
      "/m/state/a_b.1-c/survey.md",
    );
    expect(muonFilePath("/m", "a_b.1-c", "review")).toBe(
      "/m/state/a_b.1-c/review-response.md",
    );
  });

  it.each(["..", ".", "../etc", "a/b", "", ".hidden", "a b", "a\\b"])(
    "rejects task id %j",
    (task) => {
      expect(() => muonFilePath("/m", task, "survey")).toThrow();
    },
  );

  it("accepts only a task field in the block", () => {
    expect(blockSchema.safeParse({ task: "x_1" }).success).toBe(true);
    expect(
      blockSchema.safeParse({ task: "x_1", survey: "/etc/passwd" }).success,
    ).toBe(false);
  });

  it("reads current content and reports missing files", async () => {
    const root = await mkdtemp(join(tmpdir(), "muon-"));
    await mkdir(join(root, "tasks", "t1"), { recursive: true });
    await writeFile(join(root, "tasks", "t1", "instruction.md"), "first");
    await writeFile(join(root, "tasks", "t1", "instruction.md"), "second");
    expect(await readMuonFile(root, "t1", "instruction")).toEqual({
      kind: "ok",
      text: "second",
    });
    expect(await readMuonFile(root, "t1", "survey")).toEqual({
      kind: "missing",
      path: join(root, "state", "t1", "survey.md"),
    });
    await mkdir(join(root, "state", "t1"), { recursive: true });
    await writeFile(join(root, "state", "t1", "review-response.md"), "reply");
    expect(await readMuonFile(root, "t1", "review")).toEqual({
      kind: "ok",
      text: "reply",
    });
  });
});
