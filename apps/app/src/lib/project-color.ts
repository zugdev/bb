const PROJECT_HUES = [25, 60, 100, 150, 195, 240, 285, 330] as const;

export function projectColor(projectId: string): string {
  let hash = 0;
  for (const char of projectId) {
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  }
  const hue = PROJECT_HUES[hash % PROJECT_HUES.length];
  return `color-mix(in oklch, oklch(0.65 0.15 ${hue}) 75%, var(--ink))`;
}
