import { appendFileSync, mkdirSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { experimental_spawnHostProcess as spawn } from "@get-bb/plugin-sdk/process";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { forkUpdaterHostContract, type UpdateStep } from "./contract.js";

const LOG_PATH = join(homedir(), ".bb", "logs", "fork-updater.log");
const OUTPUT_TAIL_BYTES = 2_000;

function log(line: string): void {
  mkdirSync(dirname(LOG_PATH), { recursive: true });
  appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${line}\n`);
}

function run(
  cwd: string,
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = {},
): Promise<string> {
  log(`$ ${command} ${args.join(" ")}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let tail = "";
    const record = (chunk: Buffer, isStdout: boolean) => {
      const text = chunk.toString("utf8");
      if (isStdout) stdout += text;
      tail = (tail + text).slice(-OUTPUT_TAIL_BYTES);
      appendFileSync(LOG_PATH, text);
    };
    child.stdout.on("data", (chunk: Buffer) => record(chunk, true));
    child.stderr.on("data", (chunk: Buffer) => record(chunk, false));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else
        reject(
          new Error(
            `${command} ${args[0] ?? ""} exited with ${code}. See ${LOG_PATH}\n${tail.trim()}`,
          ),
        );
    });
  });
}

const git = (cwd: string, ...args: string[]) => run(cwd, "git", args);

async function isAncestor(cwd: string, commit: string, of: string): Promise<boolean> {
  return git(cwd, "merge-base", "--is-ancestor", commit, of).then(
    () => true,
    () => false,
  );
}

async function runStep(checkoutPath: string, step: UpdateStep): Promise<void> {
  switch (step) {
    case "fast-forward": {
      const dirty = await git(checkoutPath, "status", "--porcelain", "--untracked-files=no");
      if (dirty !== "") {
        throw new Error(`${checkoutPath} has uncommitted changes:\n${dirty}`);
      }
      await git(checkoutPath, "merge", "--ff-only", "origin/main");
      return;
    }
    case "install":
      await run(checkoutPath, "pnpm", ["install", "--frozen-lockfile"]);
      return;
    case "package":
      await run(
        checkoutPath,
        "pnpm",
        ["exec", "dotenv", "--no-expand", "-c", "production", "--", "turbo", "run", "package", "--filter=@bb/desktop", "--output-logs=new-only"],
        { NODE_ENV: "production" },
      );
      return;
    case "swap": {
      log("starting detached swap");
      const output = openSync(LOG_PATH, "a");
      const child = spawn("/bin/sh", [join(checkoutPath, "scripts", "fork-update.sh"), "--swap"], {
        cwd: checkoutPath,
        detached: true,
        stdio: ["ignore", output, output],
      });
      child.unref();
      return;
    }
  }
}

export default experimental_defineHostEntry({
  contract: forkUpdaterHostContract,
  handlers: {
    async inspect({ checkoutPath, builtCommit }) {
      await git(checkoutPath, "fetch", "origin");
      const remoteCommit = await git(checkoutPath, "rev-parse", "origin/main");
      const builtIsAncestor = await isAncestor(checkoutPath, builtCommit, remoteCommit);
      if (!builtIsAncestor) {
        return { remoteCommit, builtIsAncestor, commits: [], changedFiles: [] };
      }
      const range = `${builtCommit}..${remoteCommit}`;
      const commits = (await git(checkoutPath, "log", "--no-merges", "--format=%h%x09%s", range))
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => {
          const [sha = "", ...subject] = line.split("\t");
          return { sha, subject: subject.join("\t") };
        });
      const changedFiles = (await git(checkoutPath, "diff", "--name-only", builtCommit, remoteCommit))
        .split("\n")
        .filter((line) => line !== "");
      return { remoteCommit, builtIsAncestor, commits, changedFiles };
    },
    async run({ checkoutPath, step }) {
      await runStep(checkoutPath, step);
      return { headCommit: await git(checkoutPath, "rev-parse", "HEAD") };
    },
  },
});
