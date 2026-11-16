export interface CatalogEntry {
  threadId: string;
  projectName: string;
  title: string;
  firstPrompt: string;
  updatedAt: number;
}

const PROMPT_EXCERPT_CHARS = 300;
export const MAX_MATCHES = 8;

function oneLine(text: string, limit: number): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}…`;
}

export function buildFindPrompt(description: string, catalog: readonly CatalogEntry[], now: number): string {
  const lines = catalog.map((entry) => {
    const days = Math.floor((now - entry.updatedAt) / 86_400_000);
    return `${entry.threadId} | ${entry.projectName} | ${days}d ago | ${oneLine(entry.title, 120)} | ${oneLine(entry.firstPrompt, PROMPT_EXCERPT_CHARS)}`;
  });
  return [
    "You help a developer find one of their past coding agent threads.",
    "Each line below is a thread: id | project | last activity | title | first prompt.",
    "",
    ...lines,
    "",
    `The developer is looking for: ${description}`,
    "",
    `Reply with the ids of the threads that best match, best first, one per line, at most ${MAX_MATCHES}. Reply with nothing else. If none match, reply NONE.`,
  ].join("\n");
}

export function parseThreadIds(reply: string, knownIds: ReadonlySet<string>): string[] {
  const ids = reply.match(/thr_[a-z0-9]+/gu) ?? [];
  return [...new Set(ids.filter((id) => knownIds.has(id)))].slice(0, MAX_MATCHES);
}
