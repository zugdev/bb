export interface LocalPlugin {
  id: string;
  rootDir: string;
}

function neverShips(file: string): boolean {
  if (file.startsWith("docs/") || file.startsWith(".github/")) return true;
  return file.endsWith(".md") && !/^(apps|packages|plugins)\//u.test(file);
}

export function classifyChanges(
  checkoutPath: string,
  changedFiles: readonly string[],
  localPlugins: readonly LocalPlugin[],
  newPluginDirs: readonly string[] = [],
):
  | { kind: "up-to-date" }
  | { kind: "docs" }
  | { kind: "plugins"; pluginIds: string[] }
  | { kind: "rebuild" } {
  if (changedFiles.length === 0) return { kind: "up-to-date" };
  const shippedFiles = changedFiles.filter((file) => !neverShips(file));
  if (shippedFiles.length === 0) return { kind: "docs" };
  const pluginsRoot = `${checkoutPath.replace(/\/+$/u, "")}/plugins/`;
  const idByDir = new Map(
    localPlugins
      .filter((plugin) => plugin.rootDir.startsWith(pluginsRoot))
      .map((plugin) => [plugin.rootDir.slice(pluginsRoot.length).replace(/\/+$/u, ""), plugin.id]),
  );
  const pluginIds = new Set<string>();
  for (const file of shippedFiles) {
    const match = /^plugins\/([^/]+)\//u.exec(file);
    const dir = match?.[1];
    if (dir !== undefined && newPluginDirs.includes(dir)) continue;
    const id = dir === undefined ? undefined : idByDir.get(dir);
    if (id === undefined) return { kind: "rebuild" };
    pluginIds.add(id);
  }
  return { kind: "plugins", pluginIds: [...pluginIds].sort() };
}
