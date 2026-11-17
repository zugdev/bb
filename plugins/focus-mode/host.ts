import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { experimental_spawnHostProcess as spawn } from "@get-bb/plugin-sdk/process";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { focusModeHostContract } from "./contract.js";
import { isBlocking, withFocusBlock } from "./hosts-file.js";

const HOSTS_PATH = "/etc/hosts";

function readHosts(): string {
  return readFileSync(HOSTS_PATH, "utf8");
}

const ASKPASS_SCRIPT = `#!/bin/sh
exec /usr/bin/osascript -e 'text returned of (display dialog "bb Focus mode needs your password to update /etc/hosts." default answer "" with hidden answer with icon caution)'
`;

const RESTART_CHROME_WITHOUT_BLOCKED_TABS = `
function run(argv) {
  const blocked = JSON.parse(argv[0]);
  const chrome = Application("Google Chrome");
  if (!chrome.running()) return 0;
  let closed = 0;
  for (const window of chrome.windows()) {
    for (const tab of window.tabs().reverse()) {
      const host = (tab.url().match(/^https?:\\/\\/([^/:?#]+)/) ?? [])[1]?.toLowerCase();
      if (host && blocked.some((domain) => host === domain || host.endsWith("." + domain))) {
        tab.close();
        closed++;
      }
    }
  }
  if (closed === 0) return 0;
  chrome.quit();
  while (chrome.running()) delay(0.2);
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;
  app.doShellScript("/usr/bin/open -a 'Google Chrome' --args --restore-last-session");
  return closed;
}`;

function run(command: string, args: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { env, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${command} exited with ${code}`));
    });
  });
}

function runAsAdmin(dir: string, shellCommand: string): Promise<void> {
  const askpass = join(dir, "askpass");
  writeFileSync(askpass, ASKPASS_SCRIPT, { mode: 0o700 });
  return run("/usr/bin/sudo", ["-A", "/bin/sh", "-c", shellCommand], { ...process.env, SUDO_ASKPASS: askpass });
}

export default experimental_defineHostEntry({
  contract: focusModeHostContract,
  handlers: {
    status() {
      return { enabled: isBlocking(readHosts()) };
    },
    async setEnabled({ enabled, domains }) {
      if (process.platform !== "darwin") throw new Error("Focus mode only supports macOS");
      const current = readHosts();
      const next = withFocusBlock(current, enabled ? domains : null);
      if (next !== current) {
        const dir = mkdtempSync(join(tmpdir(), "bb-focus-mode-"));
        const staged = join(dir, "hosts");
        try {
          writeFileSync(staged, next);
          await runAsAdmin(
            dir,
            `/bin/cat '${staged}' > ${HOSTS_PATH} && /usr/bin/dscacheutil -flushcache && /usr/bin/killall -HUP mDNSResponder`,
          );
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
        if (enabled) {
          await run("/usr/bin/osascript", ["-l", "JavaScript", "-e", RESTART_CHROME_WITHOUT_BLOCKED_TABS, JSON.stringify(domains)]).catch(
            () => undefined,
          );
        }
      }
      return { enabled: isBlocking(readHosts()) };
    },
  },
});
