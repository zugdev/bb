import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  type MouseEvent,
} from "react";
import {
  definePluginApp,
  experimental_useSidebarThreads,
  ThreadTitle,
  useBbNavigate,
  type ExperimentalThreadHeaderLeadingProps,
} from "@get-bb/plugin-sdk/app";
import {
  findParentLink,
  getNarrowHeaders,
  markHeaderNarrow,
  parentMenuLabel,
  subscribeNarrowHeaders,
} from "./parent.js";

export function ParentThreadLink({
  threadId,
  isNarrow,
  experimental_openThreadInPane: openThreadInPane,
}: ExperimentalThreadHeaderLeadingProps) {
  useEffect(
    () => (isNarrow ? markHeaderNarrow(threadId, openThreadInPane) : undefined),
    [isNarrow, openThreadInPane, threadId],
  );
  const { threads } = experimental_useSidebarThreads();
  const navigate = useBbNavigate();
  const link = useMemo(
    () => findParentLink(threads, threadId),
    [threads, threadId],
  );
  if (isNarrow || link === null) return null;
  const label = link.relationship === "fork" ? "Forked from" : "Parent thread";
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (event.metaKey || event.ctrlKey) {
      navigate.toThread(link.threadId, { experimental_tab: true });
      return;
    }
    openThreadInPane({ id: link.threadId, projectId: link.projectId });
  };
  return (
    <a
      href={link.href}
      data-thread-header-parent-link=""
      title={`${label}: ${link.displayTitle}`}
      onClick={handleClick}
      className="mr-1 flex min-w-0 max-w-48 shrink items-center gap-1 rounded-md px-1.5 py-0.5 text-sm text-muted-foreground hover:bg-state-hover hover:text-foreground"
    >
      <span aria-hidden>↑</span>
      <span className="sr-only">{label}: </span>
      <span className="min-w-0 truncate">
        <ThreadTitle threadId={link.threadId} />
      </span>
      <span aria-hidden className="ml-1 text-muted-foreground/60">
        /
      </span>
    </a>
  );
}

function useMenuData() {
  const { threads } = experimental_useSidebarThreads();
  const narrowHeaders = useSyncExternalStore(
    subscribeNarrowHeaders,
    getNarrowHeaders,
  );
  return { threads, narrowHeaders };
}

export default definePluginApp((app) => {
  app.slots.experimental_threadHeaderLeading({
    id: "parent-link",
    component: ParentThreadLink,
  });
  app.slots.experimental_threadAction({
    id: "go-to-parent",
    title: "Go to parent",
    icon: "ChevronLeft",
    group: "0_parent-link",
    placement: "header",
    useData: useMenuData,
    item: ({ thread, data }) => {
      const openThreadInPane = data.narrowHeaders.get(thread.id);
      const link = findParentLink(data.threads, thread.id);
      if (openThreadInPane === undefined || link === null) return null;
      return {
        icon: "ChevronLeft",
        label: parentMenuLabel(link),
        run: () =>
          openThreadInPane({ id: link.threadId, projectId: link.projectId }),
      };
    },
  });
});
