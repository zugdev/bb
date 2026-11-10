import { describe, expect, it } from "vitest";
import { projectColor } from "./project-color";

describe("projectColor", () => {
  it("gives a project the same color every time and spreads projects across the palette", () => {
    expect(projectColor("prj_abc")).toBe(projectColor("prj_abc"));
    const colors = new Set(
      Array.from({ length: 40 }, (_, index) => projectColor(`prj_${index}`)),
    );
    expect(colors.size).toBeGreaterThan(4);
  });
});
