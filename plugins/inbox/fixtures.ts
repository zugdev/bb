import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export function makeThread(
  overrides: Partial<PluginSidebarThread> & { id: string },
): PluginSidebarThread {
  const projectId = overrides.projectId ?? "proj_web";
  const title = overrides.title ?? overrides.id;
  return {
    projectId,
    title,
    titleFallback: null,
    displayTitle: title,
    parentThreadId: null,
    lifecycleOwnerThreadId: null,
    parentNotifications: "auto",
    sourceThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "codex",
    status: "idle",
    runtimeStatus: "idle",
    queuedWork: "none",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    pinnedAt: null,
    pinSortKey: null,
    isArchived: false,
    archivedAt: null,
    href: `/projects/${projectId}/threads/${overrides.id}`,
    isHidden: false,
    environment: null,
    host: null,
    createdAt: 0,
    updatedAt: 0,
    lastReadAt: null,
    latestAttentionAt: 0,
    experimental_lastUserMessageAt: null,
    experimental_snoozedUntil: null,
    ...overrides,
  };
}
