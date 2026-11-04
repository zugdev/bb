import { useCallback } from "react";
import { useStore } from "jotai";
import { useNavigate } from "react-router-dom";
import { cn } from "@bb/shared-ui/lib/utils";
import {
  usePluginSlots,
  type ExperimentalThreadHeaderLeadingSlot,
} from "@/lib/plugin-slots";
import { findPaneByThread } from "@/lib/split-layout";
import { splitLayoutAtom } from "@/lib/split-layout/atoms";
import { getThreadRoutePath } from "@/lib/route-paths";
import { usePaneContext } from "@/views/thread-detail/PaneContext";
import { PluginSlotMount } from "./PluginSlotMount";

interface PluginThreadHeaderLeadingProps {
  threadId: string;
  isNarrow: boolean;
  className?: string;
}

export function PluginThreadHeaderLeading(
  props: PluginThreadHeaderLeadingProps,
) {
  const { threadHeaderLeadings } = usePluginSlots();
  if (threadHeaderLeadings.length === 0) return null;
  return <LeadingSlots {...props} slots={threadHeaderLeadings} />;
}

function LeadingSlots({
  threadId,
  isNarrow,
  className,
  slots,
}: PluginThreadHeaderLeadingProps & {
  slots: readonly ExperimentalThreadHeaderLeadingSlot[];
}) {
  const { navigateInPane } = usePaneContext();
  const store = useStore();
  const navigate = useNavigate();
  const openThreadInPane = useCallback(
    (thread: { id: string; projectId: string }) => {
      const target = { projectId: thread.projectId, threadId: thread.id };
      const layout = store.get(splitLayoutAtom);
      if (
        layout !== null &&
        findPaneByThread(layout.root, target.projectId, target.threadId) !==
          null
      ) {
        void navigate(getThreadRoutePath(target));
        return;
      }
      navigateInPane(target);
    },
    [navigate, navigateInPane, store],
  );
  return (
    <div
      data-thread-header-leading=""
      className={cn(
        "flex min-w-0 shrink items-center [&:not(:has(*>*))]:hidden",
        className,
      )}
    >
      {slots.map((slot) => {
        const Component = slot.component;
        return (
          <PluginSlotMount
            key={`${slot.pluginId}/${slot.id}/${slot.generation}`}
            pluginId={slot.pluginId}
            slotKind="threadHeaderLeading"
            slotId={slot.id}
            instanceId={threadId}
            crashFallback={null}
          >
            <Component
              threadId={threadId}
              isNarrow={isNarrow}
              experimental_openThreadInPane={openThreadInPane}
            />
          </PluginSlotMount>
        );
      })}
    </div>
  );
}
