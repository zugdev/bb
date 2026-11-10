const FIRST_HUE = 25;
const GOLDEN_ANGLE = 137.508;

interface ColoredProject {
  id: string;
  createdAt: number;
}

export function projectColorForRank(rank: number): string {
  const hue = ((FIRST_HUE + rank * GOLDEN_ANGLE) % 360).toFixed(1);
  return `color-mix(in oklch, oklch(0.65 0.15 ${hue}) 75%, var(--ink))`;
}

export function projectColorsById(
  projects: readonly ColoredProject[],
): Map<string, string> {
  const ranked = [...projects].sort(
    (left, right) =>
      left.createdAt - right.createdAt || left.id.localeCompare(right.id),
  );
  return new Map(
    ranked.map((project, rank) => [project.id, projectColorForRank(rank)]),
  );
}
