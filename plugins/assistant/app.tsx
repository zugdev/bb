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
import { formatUpcoming, type Dollar, type HabitProgress } from "./home.js";

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

function When({ at, done }: { at: number | null; done: boolean }) {
  if (at === null) return null;
  const overdue = !done && at < Date.now();
  return (
    <span className={`shrink-0 text-xs tabular-nums ${overdue ? "text-destructive-text" : "text-muted-foreground"}`}>
      {formatUpcoming(at)}
    </span>
  );
}

const brlFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pctFormat = new Intl.NumberFormat("pt-BR", { signDisplay: "exceptZero", maximumFractionDigits: 2 });

function DollarQuote({ dollar }: { dollar: Dollar }) {
  const change = pctFormat.format(dollar.pctChange);
  const tone = change.startsWith("+") ? "text-destructive-text" : "text-success";
  return (
    <li className="flex gap-2 tabular-nums" title="US$ 1 em reais e a variação de hoje">
      <span aria-hidden className="flex size-3.5 shrink-0 justify-center font-medium">$</span>
      <span className="min-w-0">
        Dólar {brlFormat.format(dollar.brl)}
        {change === "0" ? null : <span className={`ml-1.5 ${tone}`}>{change}%</span>}
      </span>
    </li>
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
          className={CHECKBOX_CLASS}
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

const CHECKBOX_CLASS =
  "peer size-3.5 cursor-pointer appearance-none rounded-full border border-muted-foreground/60 transition-colors checked:border-foreground checked:bg-foreground focus-visible:outline-none";

function HabitRow({ habit, onToggle }: { habit: HabitProgress; onToggle: () => Promise<unknown> }) {
  const [pending, setPending] = useState<{ checked: boolean; from: boolean } | null>(null);
  const checked = pending !== null && pending.from === habit.doneToday ? pending.checked : habit.doneToday;
  return (
    <label className={`${ROW_CLASS} cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring`}>
      <span className="relative flex size-4 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => {
            setPending({ checked: !checked, from: habit.doneToday });
            onToggle().catch(() => setPending(null));
          }}
          className={CHECKBOX_CLASS}
        />
        <Icon
          name="Check"
          aria-hidden
          className="pointer-events-none absolute size-2.5 text-background opacity-0 transition-opacity peer-checked:opacity-100"
        />
      </span>
      <span className="min-w-0 flex-1 truncate">{habit.title}</span>
      <span
        className="shrink-0 text-xs tabular-nums text-muted-foreground"
        title={`${habit.streak} day streak, ${habit.last30} of the last 30 days, ${habit.total} total`}
      >
        {habit.streak > 1 ? `${habit.streak}d streak · ` : ""}
        {habit.last30}/30d
      </span>
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
  const habitToggle = experimental_useRpcMutation({
    contract: assistantRpcContract,
    method: "assistant.habitToggle",
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
      {data?.habits.map((habit) => (
        <HabitRow key={habit.id} habit={habit} onToggle={() => habitToggle.mutate({ id: habit.id })} />
      ))}
      {data === undefined ? null : items.length === 0 ? (
        <p className="flex h-8 items-center text-sm text-muted-foreground">Nothing due today or tomorrow.</p>
      ) : (
        items.map((item) => <AgendaRow key={item.key} item={item} onOpen={openAssistant} />)
      )}
      {data?.news.length || data?.dollar ? (
        <ul className="mt-1 flex flex-col gap-1 border-t border-border-hairline pt-2 pb-1 text-xs text-muted-foreground">
          {data.dollar ? <DollarQuote dollar={data.dollar} /> : null}
          {data.news.map((line) => (
            <li key={line} className="flex gap-2">
              <Icon name="News01" aria-hidden className="mt-px size-3.5 shrink-0" />
              <span className="min-w-0">{line}</span>
            </li>
          ))}
        </ul>
      ) : null}
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
    experimental_ownTab: true,
    experimental_useBadge: useAssistantBadge,
  });
});
