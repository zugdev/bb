import { useEffect, type ReactNode } from "react";
import {
  definePluginApp,
  experimental_Icon as Icon,
  experimental_useRpcMutation,
  experimental_useRpcQuery,
  ThreadChat,
  useBbNavigate,
  type ExperimentalBadge,
} from "@get-bb/plugin-sdk/app";
import { assistantRpcContract } from "./contract.js";
import { formatUpcoming } from "./home.js";

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
  const markSeen = seen.mutate;
  useEffect(() => {
    if (unseen > 0) void markSeen({});
  }, [unseen, markSeen]);
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

const ROW_CLASS =
  "-mx-2 flex h-7 min-w-0 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ACTION_CLASS =
  "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface AssistantListRow {
  key: string;
  label: string;
  when: string;
  detail?: string;
}

function AssistantList({
  title,
  rows,
  onOpen,
  action,
}: {
  title: string;
  rows: AssistantListRow[];
  onOpen: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="-mr-2 flex h-7 items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {action}
      </div>
      {rows.map((row) => (
        <button key={row.key} type="button" className={ROW_CLASS} onClick={onOpen} aria-label={row.detail ? `${row.label}: ${row.detail}` : row.label}>
          <span className="min-w-0 flex-1 truncate">{row.label}</span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{row.when}</span>
        </button>
      ))}
    </div>
  );
}

function AssistantHomeSection() {
  const navigate = useBbNavigate();
  const { data } = experimental_useRpcQuery({
    contract: assistantRpcContract,
    method: "assistant.home",
    input: {},
  });
  const openAssistant = () => navigate.toPluginPanel("assistant");
  const reminders = (data?.reminders ?? []).map((reminder) => ({
    key: reminder.id,
    label: reminder.name,
    when: formatUpcoming(reminder.nextRunAt),
  }));
  const notifications = (data?.notifications ?? []).map((notification) => ({
    key: `${notification.at}-${notification.title}`,
    label: notification.title,
    when: formatRelative(notification.at),
    detail: notification.body,
  }));
  const openButton = (
    <button type="button" className={ACTION_CLASS} onClick={openAssistant}>
      <Icon name="Bot" className="size-3.5" aria-hidden />
      Open Assistant
    </button>
  );
  if (reminders.length === 0 && notifications.length === 0) {
    return (
      <div className="flex min-h-11 items-center gap-3 rounded-xl bg-surface-recessed py-2 pl-4 pr-2">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          Nothing scheduled. Ask the assistant for a reminder or a daily inbox check.
        </p>
        {openButton}
      </div>
    );
  }
  const both = reminders.length > 0 && notifications.length > 0;
  return (
    <div className={`grid gap-x-8 gap-y-3 rounded-xl bg-surface-recessed px-4 py-2.5 ${both ? "md:grid-cols-2" : ""}`}>
      {reminders.length > 0 ? (
        <AssistantList title="Upcoming reminders" rows={reminders} onOpen={openAssistant} action={both ? undefined : openButton} />
      ) : null}
      {notifications.length > 0 ? (
        <AssistantList title="Latest notifications" rows={notifications} onOpen={openAssistant} action={openButton} />
      ) : null}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.homepageSection({
    id: "assistant",
    title: "Assistant",
    component: AssistantHomeSection,
    experimental_placement: "lead",
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
