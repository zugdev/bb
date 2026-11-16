import { tmpdir } from "node:os";
import { experimental_spawnHostProcess as spawn } from "@get-bb/plugin-sdk/process";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { threadFinderHostContract } from "./contract.js";

function askClaude(prompt: string, model: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["-p", "--model", model, "--setting-sources", "", "--tools", "", "--no-session-persistence"],
      { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`claude exited with ${code}: ${stderr.trim() || stdout.trim()}`));
    });
    child.stdin.end(prompt);
  });
}

export default experimental_defineHostEntry({
  contract: threadFinderHostContract,
  handlers: {
    async ask({ prompt, model }) {
      return { text: await askClaude(prompt, model) };
    },
  },
});
