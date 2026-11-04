import { useEffect } from "react";
import {
  definePluginApp,
  experimental_useRpcMutation,
  experimental_useRpcQuery,
  ThreadChat,
  useBbNavigate,
  type ExperimentalBadge,
} from "@get-bb/plugin-sdk/app";
import { assistantRpcContract } from "./contract.js";

function useAssistantBadge(): ExperimentalBadge | null {
  const { data } = experimental_useRpcQuery({
    contract: assistantRpcContract,
    method: "assistant.badge",
    input: {},
  });
  const unseen = data?.unseen ?? 0;
  if (unseen === 0) return null;
  return {
    count: unseen,
    label: unseen === 1 ? "1 new notification" : `${unseen} new notifications`,
  };
}

function AssistantPanel() {
  const { data, error } = experimental_useRpcQuery({
    contract: assistantRpcContract,
    method: "assistant.thread",
    input: {},
  });
  const { data: badge } = experimental_useRpcQuery({
    contract: assistantRpcContract,
    method: "assistant.badge",
    input: {},
  });
  const seen = experimental_useRpcMutation({
    contract: assistantRpcContract,
    method: "assistant.seen",
  });
  const unseen = badge?.unseen ?? 0;
  useEffect(() => {
    if (unseen > 0) void seen.mutate({});
  }, [unseen]);
  if (error !== null) {
    return <p className="p-4 text-sm text-muted-foreground">{error.message}</p>;
  }
  if (data === undefined) return null;
  return (
    <ThreadChat
      threadId={data.threadId}
      variant="full"
      layout="contained"
      className="min-h-0 flex-1"
    />
  );
}

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

function formatRelative(at: number): string {
  const delta = at - Date.now();
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(delta) >= ms) return relativeTime.format(Math.round(delta / ms), unit);
  }
  return relativeTime.format(0, "minute");
}

const ROW_CLASS = "flex h-7 min-w-0 items-center gap-2.5 text-sm";

function AssistantHomeSection() {
  const navigate = useBbNavigate();
  const { data } = experimental_useRpcQuery({
    contract: assistantRpcContract,
    method: "assistant.home",
    input: {},
  });
  const reminders = data?.reminders ?? [];
  const notifications = data?.notifications ?? [];
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface-recessed px-4 py-3">
      <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
        <div className="flex min-w-0 flex-col">
          <h3 className="pb-1 text-xs font-medium text-muted-foreground">Upcoming reminders</h3>
          {reminders.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">No reminders scheduled</p>
          ) : (
            reminders.map((reminder) => (
              <div key={reminder.id} className={ROW_CLASS}>
                <span className="min-w-0 flex-1 truncate">{reminder.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatRelative(reminder.nextRunAt)}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="flex min-w-0 flex-col">
          <h3 className="pb-1 text-xs font-medium text-muted-foreground">Latest notifications</h3>
          {notifications.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">No notifications yet</p>
          ) : (
            notifications.map((notification) => (
              <div
                key={`${notification.at}-${notification.title}`}
                className={ROW_CLASS}
                title={notification.body}
              >
                <span className="min-w-0 flex-1 truncate">{notification.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatRelative(notification.at)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
      <button
        type="button"
        className="self-start rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => navigate.toPluginPanel("assistant")}
      >
        Open Assistant
      </button>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.homepageSection({
    id: "assistant",
    title: "Assistant",
    component: AssistantHomeSection,
  });
  app.slots.navPanel({
    id: "assistant",
    title: "Assistant",
    icon: "Bot",
    path: "assistant",
    component: AssistantPanel,
    experimental_useBadge: useAssistantBadge,
  });
});
