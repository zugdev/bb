import { useAtomValue } from "jotai";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@bb/shared-ui/lib/utils";
import { CHROME_SECTION_LABEL_CLASS } from "@bb/shared-ui/chrome-style-tokens";
import {
  ThreadStatusDot,
  useThreadDescendants,
  useThreadEntriesById,
} from "@/components/thread/ThreadStatusDot";
import { listPanes } from "@/lib/split-layout";
import { splitLayoutAtom } from "@/lib/split-layout/atoms";
import { splitTabsAtom } from "@/lib/split-layout/tabs";
import { getThreadRoutePath, HOME_ROUTE_PATH } from "@/lib/route-paths";
import { getThreadDisplayTitle } from "@/lib/thread-title";
import { useDefaultRequestRename } from "@/lib/thread-actions/thread-action-registry";
import { homeThreadDot } from "@/views/home-overview";

export function ActiveTabThreadsSection({
  onNavigate,
}: {
  onNavigate: () => void;
}) {
  const layout = useAtomValue(splitLayoutAtom);
  const { tabs, activeTabId } = useAtomValue(splitTabsAtom);
  const entries = useThreadEntriesById();
  const descendants = useThreadDescendants();
  const navigate = useNavigate();
  const requestRename = useDefaultRequestRename();
  const isHome = useLocation().pathname === HOME_ROUTE_PATH;
  if (isHome || layout === null) return null;
  const focusedPaneId = layout.focusedPaneId;
  const rows = listPanes(layout.root).flatMap((pane) => {
    if (pane.content.kind !== "thread") return [];
    const entry = entries.get(pane.content.threadId);
    if (entry === undefined) return [];
    return [{ pane, content: pane.content, entry }];
  });
  if (rows.length === 0) return null;
  const tabName = tabs.find((tab) => tab.id === activeTabId)?.name ?? null;
  return (
    <section aria-label="Threads in this tab" className="mb-2 px-2">
      <div
        className={cn(
          CHROME_SECTION_LABEL_CLASS,
          "flex h-7 items-center truncate px-2",
        )}
      >
        {tabName ?? "This tab"}
      </div>
      <ul className="flex flex-col">
        {rows.map(({ pane, content, entry }) => (
          <li key={pane.paneId}>
            <button
              type="button"
              aria-current={pane.paneId === focusedPaneId ? "true" : undefined}
              className={cn(
                "flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                pane.paneId === focusedPaneId && "bg-sidebar-accent",
              )}
              onClick={() => {
                navigate(getThreadRoutePath(content));
                onNavigate();
              }}
              onDoubleClick={() => requestRename(content.threadId)}
            >
              <span className="flex size-3 shrink-0 items-center justify-center">
                <ThreadStatusDot dot={homeThreadDot(entry, descendants)} />
              </span>
              <span className="min-w-0 flex-1 truncate">
                {getThreadDisplayTitle(entry)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
