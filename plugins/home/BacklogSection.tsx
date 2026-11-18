import { useState } from "react";
import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import type { BacklogItem } from "./backlog-contract";

const ROW_CLASS =
  "-mx-2 flex h-8 min-w-0 items-center gap-2.5 rounded-md px-2 text-sm transition-colors hover:bg-state-hover";

export interface BacklogSectionProps {
  items: readonly BacklogItem[] | null;
  onAdd: (title: string) => Promise<unknown>;
  onDone: (item: BacklogItem) => Promise<unknown>;
  onStart: (item: BacklogItem) => void;
}

export function BacklogSection({ items, onAdd, onDone, onStart }: BacklogSectionProps) {
  const [draft, setDraft] = useState("");
  return (
    <section className="flex flex-col">
      <h2 className="flex items-baseline gap-2 pb-1.5 text-sm font-medium">
        Backlog
        {items === null || items.length === 0 ? null : (
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{items.length}</span>
        )}
      </h2>
      {(items ?? []).map((item) => (
        <div key={item.id} className={ROW_CLASS}>
          <input
            type="checkbox"
            aria-label={`Done: ${item.title}`}
            onChange={() => void onDone(item)}
            className="size-3.5 shrink-0 cursor-pointer appearance-none rounded-full border border-muted-foreground/60 transition-colors checked:border-foreground checked:bg-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            title="Start a thread with this"
            onClick={() => onStart(item)}
            className="min-w-0 flex-1 truncate text-left focus-visible:outline-none focus-visible:underline"
          >
            {item.title}
          </button>
        </div>
      ))}
      <form
        className={`${ROW_CLASS} text-muted-foreground`}
        onSubmit={(event) => {
          event.preventDefault();
          const title = draft.trim();
          if (title.length === 0) return;
          setDraft("");
          onAdd(title).catch(() => setDraft(title));
        }}
      >
        <Icon name="Plus" aria-hidden className="size-3.5 shrink-0" />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add to backlog"
          aria-label="Add to backlog"
          className="min-w-0 flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </form>
    </section>
  );
}
