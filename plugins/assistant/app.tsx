import { useEffect, useState } from "react";
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

type AgendaItem = {
  key: string;
  title: string;
  at: number | null;
  done: (() => Promise<unknown>) | null;
};

const ROW_CLASS =
  "-mx-2 flex h-8 min-w-0 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ACTION_CLASS =
  "flex h-7 shrink-0 items-center rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function When({ at, done }: { at: number | null; done: boolean }) {
  if (at === null) return null;
  const overdue = !done && at < Date.now();
  return (
    <span className={`shrink-0 text-xs tabular-nums ${overdue ? "text-destructive-text" : "text-muted-foreground"}`}>
      {formatUpcoming(at)}
    </span>
  );
}

function AgendaRow({ item, onOpen }: { item: AgendaItem; onOpen: () => void }) {
  const [checked, setChecked] = useState(false);
  const title = (
    <span className={`min-w-0 flex-1 truncate transition-colors ${checked ? "text-muted-foreground line-through" : ""}`}>
      {item.title}
    </span>
  );
  const done = item.done;
  if (done === null) {
    return (
      <button type="button" className={ROW_CLASS} onClick={onOpen} title="Repeats">
        <span className="flex size-4 shrink-0 items-center justify-center">
          <Icon name="Repeat" aria-label="Repeats" className="size-3.5 text-muted-foreground" />
        </span>
        {title}
        <When at={item.at} done={false} />
      </button>
    );
  }
  return (
    <label className={`${ROW_CLASS} cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring`}>
      <span className="relative flex size-4 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          disabled={checked}
          onChange={() => {
            setChecked(true);
            done().catch(() => setChecked(false));
          }}
          className="peer size-3.5 cursor-pointer appearance-none rounded-full border border-muted-foreground/60 transition-colors checked:border-foreground checked:bg-foreground focus-visible:outline-none"
        />
        <Icon
          name="Check"
          aria-hidden
          className="pointer-events-none absolute size-2.5 text-background opacity-0 transition-opacity peer-checked:opacity-100"
        />
      </span>
      {title}
      <When at={item.at} done={checked} />
    </label>
  );
}

function AssistantHomeSection() {
  const navigate = useBbNavigate();
  const { data } = experimental_useRpcQuery({
    contract: assistantRpcContract,
    method: "assistant.home",
    input: {},
  });
  const todoDone = experimental_useRpcMutation({
    contract: assistantRpcContract,
    method: "assistant.todoDone",
  });
  const reminderDone = experimental_useRpcMutation({
    contract: assistantRpcContract,
    method: "assistant.reminderDone",
  });
  const openAssistant = () => navigate.toPluginPanel("assistant");
  const items: AgendaItem[] = [
    ...(data?.todos ?? []).map((todo) => ({
      key: `todo:${todo.id}`,
      title: todo.title,
      at: todo.dueAt,
      done: () => todoDone.mutate({ id: todo.id }),
    })),
    ...(data?.reminders ?? []).map((reminder) => ({
      key: `reminder:${reminder.id}`,
      title: reminder.name,
      at: reminder.nextRunAt,
      done: reminder.repeats ? null : () => reminderDone.mutate({ id: reminder.id }),
    })),
  ].sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
  return (
    <section className="flex flex-col rounded-xl bg-surface-recessed px-4 py-2">
      <div className="-mr-2 flex h-8 items-center gap-2">
        <Icon name="Bot" className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="min-w-0 flex-1 text-sm font-semibold">Assistant</h2>
        <button type="button" className={ACTION_CLASS} onClick={openAssistant}>
          Open
        </button>
      </div>
      {data === undefined ? null : items.length === 0 ? (
        <p className="flex h-8 items-center text-sm text-muted-foreground">Nothing due today or tomorrow.</p>
      ) : (
        items.map((item) => <AgendaRow key={item.key} item={item} onOpen={openAssistant} />)
      )}
    </section>
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
