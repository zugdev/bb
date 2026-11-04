export interface ScopedThread {
  id: string;
  title: string | null;
  status: string;
  projectId: string;
  environmentId: string | null;
}

export function collectPaneThreadIds(layout: unknown): string[] {
  const found: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const record = node as Record<string, unknown>;
    if (record.kind === "thread" && typeof record.threadId === "string") {
      if (!found.includes(record.threadId)) found.push(record.threadId);
      return;
    }
    Object.values(record).forEach(visit);
  };
  visit(layout);
  return found;
}

export function orchestratorPrompt(scopeLabel: string, threads: ScopedThread[]): string {
  const rows = threads.map(
    (thread) =>
      `- ${thread.id} [${thread.status}] ${thread.title ?? "(untitled)"} (project ${thread.projectId}, environment ${thread.environmentId ?? "none"})`,
  );
  return [
    `You are responsible for ${scopeLabel}. These are the threads in scope:`,
    ...rows,
    "",
    "Go through each one and reply with one line per thread: where it stands and what it needs next. Then do the next steps that are safe to do without me.",
  ].join("\n");
}

export const ORCHESTRATOR_INSTRUCTIONS = `You stand in for the user over a set of bb threads, listed in your first message. Act the way they would.
1. Inspect each thread with \`bb thread show <id>\`, \`bb thread log <id>\` and \`bb thread output <id>\`. Look at its worktree with git to see the branch, uncommitted changes and unpushed commits.
2. Unblock threads. When a thread asks something you can answer from context, answer with \`bb thread tell <id> '<message>'\`. When only the user can decide, collect the question for your reply.
3. Land finished work. When a thread's work has evidence it is done (typecheck and tests pass and it was checked in the running bb), make sure it is committed on the thread's own branch and pushed with \`git push origin <branch>\`, following docs/fork-workflow.md. Never commit to or push main.
4. Tidy up. Archive threads whose work has landed with \`bb thread archive <id>\`. Start follow up work with \`bb thread spawn --project <id> --new-environment worktree --prompt-file -\` when the user asks or a thread's result calls for it.
5. Ask the user before anything hard to undo: deleting threads, force pushing, discarding changes or merging branches.
6. End every reply with a ledger: one line per thread with its state and the next action, and the questions that need the user.`;
