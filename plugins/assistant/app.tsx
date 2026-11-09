import { useEffect } from "react";
import {
  definePluginApp,
  experimental_Icon as Icon,
  experimental_useRpcMutation,
  experimental_useRpcQuery,
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
  const navigate = useBbNavigate();
  const { data, error } = experimental_useRpcQuery({
    contract: assistantRpcContract,
    method: "assistant.thread",
    input: {},
  });
  const seen = experimental_useRpcMutation({
    contract: assistantRpcContract,
    method: "assistant.seen",
  });
  const markSeen = seen.mutate;
  const threadId = data?.threadId;
  useEffect(() => {
    if (threadId === undefined) return;
    void markSeen({});
    navigate.toThread(threadId, { experimental_replace: true });
  }, [threadId, markSeen, navigate]);
  if (error !== null) {
    return <p className="p-4 text-sm text-muted-foreground">{error.message}</p>;
  }
  return null;
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
const WHEN_CLASS = "shrink-0 text-xs text-muted-foreground tabular-nums";

function ListTitle({ children }: { children: string }) {
  return <h3 className="flex h-7 items-center text-xs font-medium text-muted-foreground">{children}</h3>;
}

function AssistantHomeSection() {
  const navigate = useBbNavigate();
  const { data } = experimental_useRpcQuery({
    contract: assistantRpcContract,
    method: "assistant.home",
    input: {},
  });
  const done = experimental_useRpcMutation({
    contract: assistantRpcContract,
    method: "assistant.todoDone",
  });
  const openAssistant = () => navigate.toPluginPanel("assistant");
  const todos = data?.todos ?? [];
  const reminders = data?.reminders ?? [];
  const notifications = data?.notifications ?? [];
  const empty = todos.length === 0 && reminders.length === 0 && notifications.length === 0;
  return (
    <div className="flex flex-col rounded-xl bg-surface-recessed px-4 py-2.5">
      <div className="-mr-2 flex h-7 items-center gap-2">
        <Icon name="Bot" className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="min-w-0 flex-1 text-sm font-medium">
          {empty ? (
            <span className="font-normal text-muted-foreground">
              Nothing to do. Ask the assistant for a to-do, a reminder or a daily inbox check.
            </span>
          ) : (
            "Assistant"
          )}
        </h2>
        <button type="button" className={ACTION_CLASS} onClick={openAssistant}>
          Open
        </button>
      </div>
      {todos.length > 0 || reminders.length > 0 ? (
        <div className={`grid gap-x-8 ${todos.length > 0 && reminders.length > 0 ? "md:grid-cols-2" : ""}`}>
          {todos.length > 0 ? (
            <div className="flex min-w-0 flex-col">
              <ListTitle>To do</ListTitle>
              {todos.map((todo) => (
                <label key={todo.id} className={`${ROW_CLASS} cursor-pointer`}>
                  <input
                    type="checkbox"
                    className="size-3.5 shrink-0 accent-current"
                    disabled={done.isPending}
                    onChange={() => void done.mutate({ id: todo.id })}
                  />
                  <span className="min-w-0 flex-1 truncate">{todo.title}</span>
                  {todo.dueAt === null ? null : (
                    <span className={todo.dueAt < Date.now() ? "shrink-0 text-xs text-destructive-text tabular-nums" : WHEN_CLASS}>
                      {formatUpcoming(todo.dueAt)}
                    </span>
                  )}
                </label>
              ))}
            </div>
          ) : null}
          {reminders.length > 0 ? (
            <div className="flex min-w-0 flex-col">
              <ListTitle>Reminders</ListTitle>
              {reminders.map((reminder) => (
                <button key={reminder.id} type="button" className={ROW_CLASS} onClick={openAssistant}>
                  <span className="min-w-0 flex-1 truncate">{reminder.name}</span>
                  <span className={WHEN_CLASS}>{formatUpcoming(reminder.nextRunAt)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {notifications.length > 0 ? (
        <div className="flex min-w-0 flex-col">
          <ListTitle>Notified</ListTitle>
          {notifications.map((notification) => (
            <button
              key={`${notification.at}-${notification.title}`}
              type="button"
              className={ROW_CLASS}
              onClick={openAssistant}
              aria-label={notification.body ? `${notification.title}: ${notification.body}` : notification.title}
            >
              <span className="min-w-0 flex-1 truncate">{notification.title}</span>
              <span className={WHEN_CLASS}>{formatRelative(notification.at)}</span>
            </button>
          ))}
        </div>
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
