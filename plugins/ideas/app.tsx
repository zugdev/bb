import { useState, type FormEvent } from "react";
import {
  definePluginApp,
  experimental_Icon as Icon,
  experimental_useRpcMutation,
  experimental_useRpcQuery,
  useBbNavigate,
} from "@get-bb/plugin-sdk/app";
import { ideasRpcContract, type Idea, type ProviderForecast } from "./contract.js";

const BUTTON_CLASS =
  "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const FIELD_CLASS =
  "h-8 min-w-0 rounded-md border border-border bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function formatIn(at: number): string {
  const hours = Math.max(0, Math.round((at - Date.now()) / 3_600_000));
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h`;
}

function ForecastRow({ forecast, startWithinHours, targetPercent }: { forecast: ProviderForecast; startWithinHours: number; targetPercent: number }) {
  const status = forecast.startsIdeas
    ? "starting ideas now"
    : forecast.projectedPercent >= targetPercent
      ? `on track to pass ${targetPercent}%, holding ideas`
      : `ideas start in ${formatIn(forecast.resetsAt - startWithinHours * 3_600_000)}`;
  return (
    <li className="flex min-w-0 items-baseline gap-2 text-sm">
      <span className="font-medium">{forecast.displayName}</span>
      <span className="tabular-nums text-muted-foreground">
        {Math.round(forecast.usedPercent)}% used, {Math.round(forecast.projectedPercent)}% projected at reset in {formatIn(forecast.resetsAt)}
      </span>
      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{status}</span>
    </li>
  );
}

function IdeaRow({ idea, projectName, providerName }: { idea: Idea; projectName: string; providerName: string }) {
  const navigate = useBbNavigate();
  const start = experimental_useRpcMutation({ contract: ideasRpcContract, method: "ideas.start" });
  const remove = experimental_useRpcMutation({ contract: ideasRpcContract, method: "ideas.remove" });
  return (
    <li className="flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5 hover:bg-state-hover">
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 whitespace-pre-wrap text-sm">{idea.prompt}</p>
        <p className="text-xs text-muted-foreground">
          {projectName} · {providerName}
        </p>
      </div>
      {idea.threadId === null ? (
        <button type="button" className={BUTTON_CLASS} disabled={start.isPending} onClick={() => void start.mutate({ id: idea.id })}>
          <Icon name="Play" className="size-3.5" aria-hidden />
          Start now
        </button>
      ) : (
        <button type="button" className={BUTTON_CLASS} onClick={() => navigate.toThread(idea.threadId!)}>
          <Icon name="ArrowUpRight" className="size-3.5" aria-hidden />
          Open thread
        </button>
      )}
      <button type="button" className={BUTTON_CLASS} aria-label="Delete idea" onClick={() => void remove.mutate({ id: idea.id })}>
        <Icon name="Trash2" className="size-3.5" aria-hidden />
      </button>
    </li>
  );
}

function IdeasPanel() {
  const { data, error } = experimental_useRpcQuery({ contract: ideasRpcContract, method: "ideas.state", input: {} });
  const add = experimental_useRpcMutation({ contract: ideasRpcContract, method: "ideas.add" });
  const [prompt, setPrompt] = useState("");
  const [projectId, setProjectId] = useState("");
  const [providerId, setProviderId] = useState("");
  if (error !== null) return <p className="p-4 text-sm text-muted-foreground">{error.message}</p>;
  if (data === undefined) return null;
  const project = projectId || data.projects[0]?.id || "";
  const provider = providerId || data.forecasts[0]?.providerId || data.providers[0]?.id || "";
  const nameOf = (options: { id: string; name: string }[], id: string) => options.find((option) => option.id === id)?.name ?? id;
  const queued = data.ideas.filter((idea) => idea.threadId === null);
  const started = data.ideas.filter((idea) => idea.threadId !== null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (prompt.trim() === "" || project === "" || provider === "") return;
    void add.mutate({ prompt: prompt.trim(), projectId: project, providerId: provider }).then(() => setPrompt(""));
  };
  const section = (title: string, ideas: Idea[]) =>
    ideas.length === 0 ? null : (
      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">
          {title} <span className="text-xs font-normal text-muted-foreground tabular-nums">{ideas.length}</span>
        </h3>
        <ul className="-mx-2 flex flex-col">
          {ideas.map((idea) => (
            <IdeaRow key={idea.id} idea={idea} projectName={nameOf(data.projects, idea.projectId)} providerName={nameOf(data.providers, idea.providerId)} />
          ))}
        </ul>
      </section>
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
      <section className="flex flex-col gap-2 rounded-xl bg-surface-recessed px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Queued ideas start in the last {data.startWithinHours}h before a weekly limit resets, while the projected usage at reset stays under {data.targetPercent}%.
        </p>
        <ul className="flex flex-col gap-1">
          {data.forecasts.map((forecast) => (
            <ForecastRow key={forecast.providerId} forecast={forecast} startWithinHours={data.startWithinHours} targetPercent={data.targetPercent} />
          ))}
        </ul>
      </section>
      <form className="flex flex-col gap-2" onSubmit={submit}>
        <textarea
          className="min-h-20 rounded-md border border-border bg-transparent p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Drop a prompt to run before the week's limit resets"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit(event);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select className={FIELD_CLASS} aria-label="Project" value={project} onChange={(event) => setProjectId(event.target.value)}>
            {data.projects.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <select className={FIELD_CLASS} aria-label="Provider" value={provider} onChange={(event) => setProviderId(event.target.value)}>
            {data.providers.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <button type="submit" className={`${BUTTON_CLASS} ml-auto`} disabled={add.isPending || prompt.trim() === ""}>
            <Icon name="Plus" className="size-3.5" aria-hidden />
            Add idea
          </button>
        </div>
      </form>
      {section("Queued", queued)}
      {section("Started", started)}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "ideas",
    title: "Ideas",
    icon: "Lightbulb",
    path: "ideas",
    component: IdeasPanel,
  });
});
