import { cliCommand, defineCli, type BbPluginApi } from "@get-bb/plugin-sdk";
import { orchestratorRpcContract, type OrchestratorScope } from "./contract.js";
import { ORCHESTRATOR_INSTRUCTIONS, orchestratorPrompt, type ScopedThread } from "./scope.js";

const PERSONAL_PROJECT_ID = "proj_personal";

export default function plugin(bb: BbPluginApi) {
  function toScoped(thread: {
    id: string;
    title: string | null;
    status: string;
    projectId: string;
    environmentId: string | null;
  }): ScopedThread {
    return {
      id: thread.id,
      title: thread.title,
      status: thread.status,
      projectId: thread.projectId,
      environmentId: thread.environmentId,
    };
  }

  async function start(scope: OrchestratorScope): Promise<string> {
    let threads: ScopedThread[];
    let projectId: string;
    let label: string;
    if (scope.kind === "project") {
      const project = await bb.sdk.projects.get({ projectId: scope.projectId });
      const listed = await bb.sdk.threads.list({ projectId: scope.projectId, archived: false });
      threads = listed.filter((thread) => thread.originPluginId !== bb.pluginId).map(toScoped);
      projectId = scope.projectId;
      label = `the ${project.name} project`;
    } else {
      threads = await Promise.all(
        scope.threadIds.map(async (threadId) => toScoped(await bb.sdk.threads.get({ threadId }))),
      );
      const projectIds = new Set(threads.map((thread) => thread.projectId));
      projectId = projectIds.size === 1 ? [...projectIds][0]! : PERSONAL_PROJECT_ID;
      label = `the ${threads.length} threads open in one of the user's tabs`;
    }
    const thread = await bb.sdk.threads.spawn({
      projectId,
      environment: { type: "project-default" },
      title: scope.kind === "project" ? `Orchestrate: ${label.replace(/^the | project$/g, "")}` : "Orchestrate: tab",
      prompt: orchestratorPrompt(label, threads),
      pluginMetadata: { orchestrator: true },
    });
    return thread.id;
  }

  bb.agents.configure((context) =>
    context.pluginMetadata.orchestrator === true
      ? { tools: [], skills: [], instructions: ORCHESTRATOR_INSTRUCTIONS }
      : { tools: [], skills: [] },
  );

  bb.rpc.register(orchestratorRpcContract, {
    async "orchestrator.start"(scope) {
      return { threadId: await start(scope) };
    },
  });

  bb.cli.register(
    defineCli({
      name: "orchestrate",
      summary: "Start an agent that stands in for you over a project or a set of threads",
      commands: {
        project: cliCommand({
          summary: "Orchestrate every open thread in a project",
          positionals: [{ name: "projectId", description: "Project id from `bb project list`", required: true }],
          async run(input) {
            return { exitCode: 0, stdout: await start({ kind: "project", projectId: input.positionals.projectId }) };
          },
        }),
        threads: cliCommand({
          summary: "Orchestrate the given threads",
          positionals: [{ name: "threadIds", description: "Thread ids", required: true, variadic: true }],
          async run(input) {
            return { exitCode: 0, stdout: await start({ kind: "threads", threadIds: input.positionals.threadIds }) };
          },
        }),
      },
    }),
  );
}
