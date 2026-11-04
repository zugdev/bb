import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = resolve(import.meta.dirname, "../../scripts/fork-update.sh");
const BUILTIN_PLUGINS =
  "apps/desktop/release/mac-arm64/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/server/dist/builtin-plugins";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function checkout(packaged: Record<string, string>, runtime: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fork-update-"));
  roots.push(root);
  mkdirSync(join(root, "scripts"));
  copyFileSync(SCRIPT, join(root, "scripts", "fork-update.sh"));
  for (const [name, source] of Object.entries(runtime)) {
    mkdirSync(join(root, "plugins", name, ".bundled-runtime", "dist"), { recursive: true });
    writeFileSync(join(root, "plugins", name, ".bundled-runtime", "dist", "server.js"), source);
  }
  for (const [name, source] of Object.entries(packaged)) {
    mkdirSync(join(root, BUILTIN_PLUGINS, name, "dist"), { recursive: true });
    writeFileSync(join(root, BUILTIN_PLUGINS, name, "dist", "server.js"), source);
  }
  writeFileSync(join(root, BUILTIN_PLUGINS, "marketplace.json"), "{}");
  return root;
}

function verify(root: string) {
  return spawnSync("/bin/sh", [join(root, "scripts", "fork-update.sh"), "--verify"], { encoding: "utf8" });
}

describe("fork-update.sh --verify", () => {
  it("passes when every packaged bundled plugin matches its .bundled-runtime build", () => {
    const root = checkout({ git: "a", "provider-usage": "new" }, { git: "a", "provider-usage": "new" });
    expect(verify(root).status).toBe(0);
  });

  it("names the packaged plugins that are stale or have no runtime build", () => {
    const root = checkout(
      { git: "a", "provider-usage": "old", gone: "x" },
      { git: "a", "provider-usage": "sidebarWeeklyUsage" },
    );
    const result = verify(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(".bundled-runtime: gone provider-usage");
  });
});
