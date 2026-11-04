import { useCallback, useMemo } from "react";
import { useStore } from "jotai";
import { useNavigate } from "react-router-dom";
import type { ThreadResponse } from "@bb/server-contract";
import type { ThreadPromptParentThreadSection } from "@/components/promptbox/banner/ThreadPromptContextBanner";
import { useThread } from "@/hooks/queries/thread-queries";
import {
  getThreadRoutePath,
  type ThreadRoutePathArgs,
} from "@/lib/route-paths";
import { getThreadDisplayTitle } from "@/lib/thread-title";
import { openThreadInTab } from "@/lib/split-layout/tabs";
import { findPaneByThread } from "@/lib/split-layout";
import { splitLayoutAtom } from "@/lib/split-layout/atoms";
import { usePaneContext } from "./PaneContext";

export interface ParentThreadSection extends ThreadPromptParentThreadSection {
  target: ThreadRoutePathArgs;
  isLoaded: boolean;
}

export function useParentThreadSection(
  thread: ThreadResponse | undefined,
  enabled: boolean,
): ParentThreadSection | null {
  const threadOriginKind = thread?.originKind ?? null;
  const threadParentThreadId = thread?.parentThreadId ?? null;
  const threadProjectId = thread?.projectId ?? "";
  const threadSourceThreadId =
    thread?.sourceThreadId ?? (threadOriginKind ? threadParentThreadId : null);
  const { data: parentThread } = useThread(
    enabled ? (threadParentThreadId ?? "") : "",
  );
  const { data: sourceThread } = useThread(
    enabled ? (threadSourceThreadId ?? "") : "",
  );
  return useMemo(() => {
    const relatedThreadId =
      threadOriginKind !== null ? threadSourceThreadId : threadParentThreadId;
    if (!enabled || !relatedThreadId) return null;
    const relationship = threadOriginKind === "fork" ? "fork" : "parent";
    const relatedThread =
      relationship === "parent" ? parentThread : sourceThread;
    const target = {
      projectId: relatedThread?.projectId ?? threadProjectId,
      threadId: relatedThreadId,
    };
    const href = getThreadRoutePath(target);
    if (relatedThread === undefined) {
      return {
        parentThreadTitle: relatedThreadId.slice(0, 8),
        href,
        relationship,
        target,
        isLoaded: false,
      };
    }
    if (
      relatedThread.archivedAt !== null ||
      relatedThread.deletedAt !== null ||
      (relationship !== "parent" &&
        relatedThread.projectId !== threadProjectId)
    ) {
      return null;
    }
    return {
      parentThreadTitle: getThreadDisplayTitle(relatedThread),
      href,
      relationship,
      target,
      isLoaded: true,
    };
  }, [
    enabled,
    parentThread,
    sourceThread,
    threadParentThreadId,
    threadProjectId,
    threadOriginKind,
    threadSourceThreadId,
  ]);
}

export function useOpenParentThread(): (
  parentThread: ParentThreadSection,
  inNewTab: boolean,
) => void {
  const { navigateInPane } = usePaneContext();
  const store = useStore();
  const navigate = useNavigate();
  return useCallback(
    (parentThread, inNewTab) => {
      if (inNewTab) {
        openThreadInTab(store, navigate, parentThread.target);
        return;
      }
      const { projectId, threadId } = parentThread.target;
      const layout = store.get(splitLayoutAtom);
      if (
        layout !== null &&
        findPaneByThread(layout.root, projectId, threadId) !== null
      ) {
        void navigate(parentThread.href);
        return;
      }
      navigateInPane(parentThread.target);
    },
    [navigate, navigateInPane, store],
  );
}
