import { useState, useSyncExternalStore, type FormEvent } from "react";
import {
  definePluginApp,
  experimental_Icon as Icon,
  experimental_useRpcMutation,
  useBbNavigate,
} from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { threadFinderRpcContract, type ThreadMatch } from "./contract.js";

let open = false;
const listeners = new Set<() => void>();

function setOpen(next: boolean): void {
  open = next;
  for (const listener of listeners) listener();
}

function useOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
  );
}

function MatchRow({
  match,
  autoFocus,
  onOpen,
}: {
  match: ThreadMatch;
  autoFocus: boolean;
  onOpen: (match: ThreadMatch, split: boolean) => void;
}) {
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      className="flex w-full min-w-0 flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-state-hover focus-visible:bg-state-hover focus-visible:outline-none"
      onClick={(event) => onOpen(match, event.metaKey || event.ctrlKey)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onOpen(match, true);
          return;
        }
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const sibling =
          event.key === "ArrowDown"
            ? event.currentTarget.nextElementSibling
            : event.currentTarget.previousElementSibling;
        if (sibling instanceof HTMLElement) sibling.focus();
      }}
    >
      <span className="w-full truncate text-sm text-foreground">{match.title}</span>
      <span className="w-full truncate text-xs text-subtle-foreground">
        {match.projectName}
        {match.archived ? " · Archived" : ""}
      </span>
    </button>
  );
}

function FinderBody() {
  const navigate = useBbNavigate();
  const find = experimental_useRpcMutation({ contract: threadFinderRpcContract, method: "find" });
  const [description, setDescription] = useState("");
  const [matches, setMatches] = useState<ThreadMatch[] | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (description.trim() === "" || find.isPending) return;
    setMatches(null);
    find.mutate({ description }).then((result) => setMatches(result.matches), () => undefined);
  };

  const openMatch = (match: ThreadMatch, split: boolean) => {
    setOpen(false);
    navigate.toThread(match.threadId, { split });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Find a thread</DialogTitle>
        <DialogDescription>Describe what you remember about it. Claude matches it against your threads' titles and first prompts.</DialogDescription>
      </DialogHeader>
      <form className="flex gap-2" onSubmit={submit}>
        <Input
          autoFocus
          aria-label="Describe the thread"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Button type="submit" disabled={find.isPending || description.trim() === ""}>
          {find.isPending ? "Searching" : "Find"}
        </Button>
      </form>
      {find.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="Loader" className="size-3.5 animate-spin" aria-hidden />
          Reading your threads
        </p>
      ) : find.error ? (
        <p className="whitespace-pre-wrap text-sm text-destructive">{find.error.message}</p>
      ) : matches === null ? null : matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching threads</p>
      ) : (
        <div role="list" aria-label="Matching threads" className="flex max-h-80 flex-col overflow-y-auto">
          {matches.map((match, index) => (
            <MatchRow key={match.threadId} match={match} autoFocus={index === 0} onOpen={openMatch} />
          ))}
        </div>
      )}
    </>
  );
}

function FinderDialog() {
  const isOpen = useOpen();
  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">{isOpen ? <FinderBody /> : null}</DialogContent>
    </Dialog>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "dialog", component: FinderDialog });
  app.commands.register({
    id: "find",
    title: "Find thread by description",
    defaultShortcut: { key: "k", mod: true, shift: true },
    run: () => setOpen(true),
  });
});
