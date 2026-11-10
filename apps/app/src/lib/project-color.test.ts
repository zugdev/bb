import { describe, expect, it } from "vitest";
import { projectColorsById } from "./project-color";

const projects = Array.from({ length: 40 }, (_, index) => ({
  id: `proj_${String(39 - index).padStart(2, "0")}`,
  createdAt: 1_000 + index,
}));

describe("projectColorsById", () => {
  it("gives every project its own color", () => {
    const colors = projectColorsById(projects);
    expect(new Set(colors.values()).size).toBe(projects.length);
  });

  it("keeps existing colors when a project is added", () => {
    const before = projectColorsById(projects);
    const after = projectColorsById([
      { id: "proj_aa", createdAt: 9_999 },
      ...projects,
    ]);
    for (const [id, color] of before) {
      expect(after.get(id)).toBe(color);
    }
    expect([...before.values()]).not.toContain(after.get("proj_aa"));
  });
});
