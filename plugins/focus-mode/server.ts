import { cliCommand, defineCli, PluginCliError, type BbPluginApi } from "@get-bb/plugin-sdk";
import { focusModeHostContract, focusModeRpcContract } from "./contract.js";
import { parseDomains } from "./hosts-file.js";

const DEFAULT_DOMAINS = [
  "x.com",
  "twitter.com",
  "instagram.com",
  "youtube.com",
  "m.youtube.com",
  "youtu.be",
  "facebook.com",
  "reddit.com",
  "old.reddit.com",
  "tiktok.com",
  "twitch.tv",
  "news.ycombinator.com",
].join("\n");

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function focusModePlugin(bb: BbPluginApi): void {
  const settings = bb.settings.define({
    domains: {
      type: "string",
      label: "Blocked sites",
      description: "One domain per line. Focus mode also blocks the www. form of each.",
      experimental_multiline: true,
      default: DEFAULT_DOMAINS,
    },
  });
  const host = bb.hosts.experimental_client({ contract: focusModeHostContract });

  async function hostId(): Promise<string> {
    const { primaryHostId } = await bb.sdk.system.config();
    if (primaryHostId === null) throw new Error("This bb server has no host daemon of its own");
    return primaryHostId;
  }

  async function status() {
    return host.call("status", null, { hostId: await hostId() });
  }

  async function setEnabled(enabled: boolean) {
    const value = (await settings.get()).domains;
    const domains = parseDomains(typeof value === "string" ? value : DEFAULT_DOMAINS);
    const result = await host.call("setEnabled", { enabled, domains }, { hostId: await hostId(), timeoutMs: 5 * 60_000 });
    bb.rpc.experimental_invalidateAll();
    return result;
  }

  bb.rpc.register(focusModeRpcContract, {
    status,
    setEnabled: ({ enabled }) => setEnabled(enabled),
  });

  const toggle = (enabled: boolean) =>
    cliCommand({
      summary: enabled ? "Block the configured sites in /etc/hosts" : "Remove the block from /etc/hosts",
      async run() {
        try {
          const result = await setEnabled(enabled);
          return { exitCode: 0, stdout: `Focus mode ${result.enabled ? "on" : "off"}` };
        } catch (error) {
          throw new PluginCliError(errorMessage(error), { code: "hosts_update_failed" });
        }
      },
    });

  bb.cli.register(
    defineCli({
      name: "focus-mode",
      summary: "Block distracting sites through /etc/hosts",
      description:
        "Focus mode writes the configured domains to /etc/hosts and flushes the DNS cache. Changing /etc/hosts asks for an administrator password.",
      commands: {
        status: cliCommand({
          summary: "Show whether focus mode is on",
          async run() {
            return { exitCode: 0, stdout: `Focus mode ${(await status()).enabled ? "on" : "off"}` };
          },
        }),
        on: toggle(true),
        off: toggle(false),
      },
    }),
  );
}
