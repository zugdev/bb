export interface LocalPlugin {
  id: string;
  rootDir: string;
}

export function classifyChanges(
  checkoutPath: string,
  changedFiles: readonly string[],
  localPlugins: readonly LocalPlugin[],
): { kind: "up-to-date" } | { kind: "plugins"; pluginIds: string[] } | { kind: "rebuild" } {
  if (changedFiles.length === 0) return { kind: "up-to-date" };
  const pluginsRoot = `${checkoutPath.replace(/\/+$/u, "")}/plugins/`;
  const idByDir = new Map(
    localPlugins
      .filter((plugin) => plugin.rootDir.startsWith(pluginsRoot))
      .map((plugin) => [plugin.rootDir.slice(pluginsRoot.length).replace(/\/+$/u, ""), plugin.id]),
  );
  const pluginIds = new Set<string>();
  for (const file of changedFiles) {
    const match = /^plugins\/([^/]+)\//u.exec(file);
    const id = match === null ? undefined : idByDir.get(match[1]!);
    if (id === undefined) return { kind: "rebuild" };
    pluginIds.add(id);
  }
  return { kind: "plugins", pluginIds: [...pluginIds].sort() };
}
