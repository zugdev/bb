import {
  PluginCliError,
  cliCommand,
  defineCli,
  type BbPluginApi,
} from "@get-bb/plugin-sdk";
import { locateHavenBrowser } from "./locate.js";

const profilePattern = /^[A-Za-z0-9_-]{1,64}$/;

export default function havenBrowserPlugin(
  bb: BbPluginApi,
  socketRoot = "/tmp",
) {
  bb.cli.register(
    defineCli({
      name: "haven-browser",
      summary: "Find the live haven browser window of a profile",
      commands: {
        preview: cliCommand({
          summary:
            "Print the DevTools URL of a profile's open haven browser, preferring this checkout's window",
          positionals: [
            {
              name: "profile",
              description: "haven browser profile name",
              required: true,
            },
          ],
          options: {
            json: {
              type: "boolean",
              description: "Emit machine-readable JSON",
            },
          },
          async run(input, ctx) {
            const profile = input.positionals.profile;
            if (!profilePattern.test(profile))
              throw new PluginCliError(`Invalid profile name '${profile}'`, {
                code: "invalid_profile",
              });
            try {
              const found = await locateHavenBrowser({
                profile,
                cwd: ctx.cwd,
                socketRoot,
              });
              return {
                exitCode: 0,
                stdout: JSON.stringify({ profile, ...found }),
              };
            } catch (error) {
              throw new PluginCliError(
                error instanceof Error ? error.message : String(error),
                { code: "not_open" },
              );
            }
          },
        }),
      },
    }),
  );
  bb.agents.configure((context) => ({
    tools: [],
    skills: [],
    ...(context.project.gitRemoteUrl?.toLowerCase().includes("haven-tax/haven")
      ? {
          instructions: `Show every haven browser profile you drive live in this thread. Right after \`haven browser open <profile>\` succeeds, run \`bb haven-browser preview <profile> --json\`, then \`bb browser-automation open --backend cdp --machine ${context.host.id} --cdp-url <cdpUrl> --json\` with the returned cdpUrl, and follow the browser-automation previewDirective instruction. Do this once per profile, and again only when the preview ends or the window was reopened. Keep driving the page with \`haven browser\` commands; use the browser-automation session only for the preview.`,
        }
      : {}),
  }));
}
