import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO = resolve(import.meta.dirname, "../..");
const ALLOWLIST = "scripts/fork-plugins.json";

describe("scripts/fork-plugins.json", () => {
  const { plugins } = JSON.parse(readFileSync(join(REPO, ALLOWLIST), "utf8")) as { plugins: string[] };
  const registry = readFileSync(join(REPO, "apps/server/src/services/plugins/builtin-registry.ts"), "utf8");

  it.each(plugins)("%s has a bb manifest and is not bundled with bb", (entry) => {
    const manifest = JSON.parse(readFileSync(join(REPO, entry, "package.json"), "utf8")) as { bb?: unknown };
    expect(manifest.bb).toBeTypeOf("object");
    expect(registry).not.toContain(`name: "${entry.slice("plugins/".length)}"`);
  });
});

describe("host inspect", () => {
  let root: string;
  const previousHome = process.env.HOME;

  function git(cwd: string, ...args: string[]): string {
    return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" }).trim();
  }

  function write(dir: string, path: string, content: unknown): void {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), typeof content === "string" ? content : JSON.stringify(content));
  }

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "fork-plugins-"));
    process.env.HOME = join(root, "home");
  });

  afterAll(() => {
    process.env.HOME = previousHome;
    rmSync(root, { recursive: true, force: true });
  });

  it("lists allowlisted plugins with a bb manifest at origin/main", async () => {
    const origin = join(root, "origin");
    mkdirSync(origin);
    git(origin, "init", "-q", "-b", "main");
    write(origin, "README.md", "x");
    git(origin, "add", ".");
    git(origin, "commit", "-qm", "base");
    const checkout = join(root, "checkout");
    git(root, "clone", "-q", origin, checkout);
    const built = git(checkout, "rev-parse", "HEAD");

    write(origin, ALLOWLIST, { plugins: ["plugins/home", "plugins/no-manifest", "plugins/missing", "apps/server"] });
    write(origin, "plugins/home/package.json", { name: "bb-plugin-home", bb: { server: "./server.ts" } });
    write(origin, "plugins/no-manifest/package.json", { name: "no-manifest" });
    git(origin, "add", ".");
    git(origin, "commit", "-qm", "add home");

    const { default: entry } = await import("./host.js");
    const result = await entry.handlers.inspect({ checkoutPath: checkout, builtCommit: built }, {} as never);
    expect(result.forkPluginDirs).toEqual(["home"]);
    expect(existsSync(join(checkout, "plugins/home"))).toBe(false);
  });
});
