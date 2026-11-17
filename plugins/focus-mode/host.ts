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

function runAsAdmin(shellCommand: string): Promise<void> {
  const script = `do shell script ${JSON.stringify(shellCommand)} with administrator privileges with prompt "bb Focus mode wants to update /etc/hosts."`;
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/osascript", ["-e", script], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `osascript exited with ${code}`));
    });
  });
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
            `/bin/cat '${staged}' > ${HOSTS_PATH} && /usr/bin/dscacheutil -flushcache && /usr/bin/killall -HUP mDNSResponder`,
          );
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }
      return { enabled: isBlocking(readHosts()) };
    },
  },
});
