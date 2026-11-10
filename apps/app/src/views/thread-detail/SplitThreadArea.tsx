import { focusPaneComposer } from "@/lib/pane-composer-focus";
import { cn } from "@bb/shared-ui/lib/utils";
import {
  PANE_DIRECTION_APP_COMMAND_IDS,
  PANE_FOCUS_APP_COMMAND_IDS,
} from "@bb/domain";
import { useAtom, useAtomValue, useStore } from "jotai";
import { createPortal } from "react-dom";
import {
  Fragment,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useRouteState } from "@/hooks/useRouteState";
import {
  getRootComposeRoutePath,
  getThreadRoutePath,
  type ThreadRoutePathArgs,
} from "@/lib/route-paths";
import { useIsMutating } from "@tanstack/react-query";
import { BbHttpError } from "@/lib/sdk";
import { useThread } from "@/hooks/queries/thread-queries";
import { useIsSidebarFramed } from "@/components/ui/sidebar.js";
import { useSplitWorkspaceActive } from "@/hooks/useSplitWorkspaceActive";
import {
  dimInactiveSplitsAtom,
  maximizedPaneIdAtom,
  splitLayoutAtom,
} from "@/lib/split-layout/atoms";
import {
  activateSplitTabsAtom,
  bindActiveTabProjectAtom,
  canMovePaneAcrossTabs,
  closeSplitTabAtom,
  closeThreadsInAllTabsAtom,
  focusThreadInOtherTabAtom,
  landOwnedPanelRedirectAtom,
  openOutsideOwnedTabAtom,
  openOwnedTabAtom,
  movePaneAcrossTabsAtom,
  movePaneToTabAtom,
  recordClosedPaneAtom,
  seedSplitComposeProjectAtom,
  selectSplitTabAtom,
  splitTabsAtom,
} from "@/lib/split-layout/tabs";
import {
  createSplitTabHoverSwitch,
  resolveSplitTabDropTarget,
} from "./SplitTabBar";
import { useIsInboxTabActive } from "./InboxTabController";
import {
  computePaneRects,
  countPanes,
  findPane,
  isSamePaneContent,
  listPanes,
  movePane,
  removePane,
  replacePaneContent,
  resizeSplit,
  setFocus,
  splitPane,
  swapPanes,
} from "@/lib/split-layout";
import {
  createSplitResizeFlexPair,
  createSplitResizeSnapSession,
} from "@/lib/split-resize-snap";
import type {
  LayoutNode,
  PaneContent,
  PaneNode,
  PaneRect,
  SplitLayout,
  SplitPath,
  SplitSide,
} from "@/lib/split-layout";
import {
  beginSplitDrag,
  decidePaneDrop,
  SPLIT_PANE_DATA_ATTR,
} from "@/lib/split-drag";
import {
  useAppCommandContext,
  useAppCommandHandler,
  useIndexedAppCommandHandlers,
} from "@/components/commands/AppCommandProvider";
import {
  DefaultPaneContextProvider,
  PaneContext,
  createPaneSecondaryPanelRegistry,
  useOptionalPaneContext,
  type PaneContextValue,
  type PaneSecondaryPanelRegistration,
  type PaneSecondaryPanelRegistry,
} from "./PaneContext";
import { LazyThreadDetailView as ThreadDetailView } from "./LazyThreadDetailView";
import { LazyRootComposeView as RootComposeView } from "@/views/LazyRootComposeView";
import { PaneDragHandle } from "./PaneDragHandle";
import { splitDirectionAtom } from "@/lib/split-layout/split-direction";
import { PluginPanelView } from "@/views/PluginPanelView";
import {
  AppPageHeader,
  HEADER_ICON_BUTTON_CLASS,
  HEADER_PANE_ACTION_ICON_BUTTON_CLASS,
} from "@/components/layout/AppPageHeader";
import { PluginPageTitleHost } from "@/components/plugin/PluginPageTitleHost";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import { CHROME_SUBTLE_ICON_BUTTON_FOREGROUND_CLASS } from "@bb/shared-ui/chrome-style-tokens";
import { usePluginNavPanelChrome } from "@/lib/plugin-nav-panel-chrome";
import { usePluginSlots } from "@/lib/plugin-slots";
import {
  PluginPanelHeaderActions,
  PluginPanelHeaderCenter,
} from "@/components/plugin/PluginPanelHeader";
import { getAdjacentPaneId, getDirectionalPaneId } from "./splitPaneCommands";
import {
  applyThreadPaneActionToLayout,
  createSinglePaneLayout,
  focusedPaneRoute,
  paneContentRoute,
  placeThreadBesideSplit,
  placeThreadInProjectTab,
  reconcileLayoutForContent,
  replaceOriginPaneContent,
  threadPaneContent,
} from "./splitThreadNavigation";
import { ThreadDetailWorkerPoolProvider } from "./ThreadDetailWorkerPoolProvider";
import {
  getBbDesktopInfo,
  MACOS_WINDOW_NO_DRAG_CLASS,
  shouldUseMacosDesktopChrome,
} from "@/lib/bb-desktop";
import { SplitWorkspaceSecondaryPanelHost } from "./SplitWorkspaceSecondaryPanelHost";
import { SecondaryPanelHostLayoutContext } from "@/components/secondary-panel/SecondaryPanelHostLayoutContext";
import {
  CONTEXT_INACTIVE_TEXT_CLASS,
  CONTEXT_SELECTION_SURFACE_CLASS,
} from "@bb/shared-ui/context-selection";
import { PaneMaximizeButton } from "./PaneMaximizeButton";
import { wsManager } from "@/lib/ws";
import { useImmediateRouteNavigate } from "@/components/ui/app-route-anchor";
import { PluginDetailOpenerBoundary } from "@/components/plugin/plugin-detail-opener";
import { defineSplit } from "@/lib/define-split";
import { LazyPluginDetailPaneView } from "@/views/ToolsViewSplits";

const LazyPluginPanelRightPanelHost = defineSplit<
  ComponentProps<
    typeof import("@/components/plugin/PluginPanelRightPanelHost").PluginPanelRightPanelHost
  >
>({
  id: "plugin-panel-right-panel-host",
  load: () =>
    import("@/components/plugin/PluginPanelRightPanelHost").then(
      (module) => module.PluginPanelRightPanelHost,
    ),
  loading: () => null,
  tier: "intent",
});

function PluginPagePanelHost({
  children,
  ...props
}: {
  children: ReactNode;
  flushPageInsets?: boolean;
  paneId?: string;
  panelPath: string;
  pluginId: string;
  subPath: string;
}) {
  const pane = useOptionalPaneContext();
  return (
    <PluginDetailOpenerBoundary
      key={`${props.pluginId}/${props.panelPath}`}
      isFocused={pane?.isFocused ?? true}
    >
      <LazyPluginPanelRightPanelHost {...props}>
        {children}
      </LazyPluginPanelRightPanelHost>
    </PluginDetailOpenerBoundary>
  );
}

const PANE_DRAG_ENGAGE_DISTANCE_PX = 7;

type BeginPaneDrag = (
  paneId: string,
  event: ReactPointerEvent,
  label: string,
) => void;

const EMPTY_PATH: SplitPath = [];

type NavigateInPane = (
  paneId: string,
  originContent: PaneContent,
  thread: ThreadRoutePathArgs,
) => void;

interface SplitThreadAreaProps {
  routeContent?: PaneContent;
}

interface PreservedScrollPosition {
  left: number;
  top: number;
}

function usePreservedSplitScrollPositions(maximizedPaneId: string | null) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef(new Map<HTMLElement, PreservedScrollPosition>());
  const previousMaximizedPaneIdRef = useRef(maximizedPaneId);

  const captureVisibleScrollPositions = useCallback(() => {
    const workspace = workspaceRef.current;
    if (workspace === null) {
      return;
    }
    for (const pane of workspace.querySelectorAll<HTMLElement>(
      `[${SPLIT_PANE_DATA_ATTR}]:not([aria-hidden="true"])`,
    )) {
      for (const element of pane.querySelectorAll<HTMLElement>("*")) {
        if (element.scrollLeft === 0 && element.scrollTop === 0) {
          positionsRef.current.delete(element);
          continue;
        }
        positionsRef.current.set(element, {
          left: element.scrollLeft,
          top: element.scrollTop,
        });
      }
    }
  }, []);

  useLayoutEffect(() => {
    if (previousMaximizedPaneIdRef.current === maximizedPaneId) {
      return;
    }
    previousMaximizedPaneIdRef.current = maximizedPaneId;

    const restore = (): boolean => {
      const workspace = workspaceRef.current;
      let corrected = false;
      for (const [element, position] of positionsRef.current) {
        if (workspace === null || !workspace.contains(element)) {
          positionsRef.current.delete(element);
          continue;
        }
        if (
          element.scrollLeft === position.left &&
          element.scrollTop === position.top
        ) {
          continue;
        }
        element.scrollLeft = position.left;
        element.scrollTop = position.top;
        corrected = true;
      }
      return corrected;
    };

    restore();
    let frame: number | null = null;
    let framesRemaining = 5;
    const restoreUntilSettled = () => {
      const corrected = restore();
      framesRemaining -= 1;
      frame =
        corrected && framesRemaining > 0
          ? window.requestAnimationFrame(restoreUntilSettled)
          : null;
    };
    frame = window.requestAnimationFrame(restoreUntilSettled);
    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [maximizedPaneId]);

  return { captureVisibleScrollPositions, workspaceRef };
}

export function SplitThreadArea(props: SplitThreadAreaProps = {}) {
  return (
    <ThreadDetailWorkerPoolProvider>
      <SplitThreadAreaContent {...props} />
      <OpenThreadStaleWatchers />
    </ThreadDetailWorkerPoolProvider>
  );
}

function SplitThreadAreaContent({ routeContent }: SplitThreadAreaProps) {
  const { projectId, threadId } = useRouteState();
  const splitWorkspaceActive = useSplitWorkspaceActive();
  const navigate = useImmediateRouteNavigate();
  const store = useStore();
  const navPanels = usePluginSlots().navPanels;
  const [storedLayout, setLayout] = useAtom(splitLayoutAtom);
  const dimsInactiveSplits = useAtomValue(dimInactiveSplitsAtom);
  const [maximizedPaneId, setMaximizedPaneIdAtom] =
    useAtom(maximizedPaneIdAtom);
  const splitTabs = useAtomValue(splitTabsAtom);
  const recentTabIds = useRecentSplitTabIds(splitTabs.activeTabId);
  const registryForTab = useTabSecondaryPanelRegistries(splitTabs.tabs);

  const routeThread = useMemo<ThreadRoutePathArgs | null>(
    () => (projectId && threadId ? { projectId, threadId } : null),
    [projectId, threadId],
  );
  const currentContent = useMemo<PaneContent | null>(
    () => routeContent ?? (routeThread ? threadPaneContent(routeThread) : null),
    [routeContent, routeThread],
  );

  useEffect(() => {
    if (currentContent === null) {
      return;
    }
    if (currentContent.kind === "plugin-panel") {
      const panel = navPanels.find(
        (candidate) =>
          candidate.experimental_ownTab === true &&
          candidate.pluginId === currentContent.pluginId &&
          candidate.path === currentContent.panelPath,
      );
      const layout =
        panel === undefined
          ? null
          : store.set(openOwnedTabAtom, {
              owner: {
                kind: "panel",
                panel: {
                  pluginId: currentContent.pluginId,
                  panelPath: currentContent.panelPath,
                },
              },
              content: currentContent,
            });
      const focused =
        layout === null ? null : findPane(layout.root, layout.focusedPaneId);
      if (
        focused !== null &&
        !isSamePaneContent(focused.content, currentContent)
      ) {
        navigate(paneContentRoute(focused.content), { replace: true });
        return;
      }
    }
    if (currentContent.kind === "thread") {
      if (store.set(landOwnedPanelRedirectAtom, currentContent)) {
        setLayout((previous) =>
          reconcileLayoutForContent(previous, currentContent),
        );
        return;
      }
      if (store.set(focusThreadInOtherTabAtom, currentContent)) return;
      if (store.set(openOutsideOwnedTabAtom, currentContent)) return;
      const projectTab = splitWorkspaceActive
        ? placeThreadInProjectTab(
            store.get(splitTabsAtom),
            store.get(splitLayoutAtom),
            currentContent,
          )
        : null;
      if (projectTab !== null) {
        store.set(activateSplitTabsAtom, projectTab);
        return;
      }
      const beside = splitWorkspaceActive
        ? placeThreadBesideSplit(
            store.get(splitTabsAtom),
            store.get(splitLayoutAtom),
            currentContent,
          )
        : null;
      if (beside !== null) {
        store.set(activateSplitTabsAtom, beside);
        return;
      }
      store.set(bindActiveTabProjectAtom, currentContent.projectId);
    }
    setLayout((previous) =>
      reconcileLayoutForContent(previous, currentContent),
    );
  }, [
    currentContent,
    navPanels,
    navigate,
    setLayout,
    splitWorkspaceActive,
    store,
  ]);

  const layout: SplitLayout | null =
    storedLayout ??
    (currentContent?.kind === "thread" && routeThread
      ? createSinglePaneLayout(routeThread)
      : currentContent
        ? reconcileLayoutForContent(null, currentContent)
        : null);
  const panes = layout === null ? [] : listPanes(layout.root);
  const keptTabs = splitTabs.tabs.flatMap((tab) => {
    const isActive = tab.id === splitTabs.activeTabId;
    if (!isActive && !recentTabIds.includes(tab.id)) return [];
    const tabLayout = isActive ? layout : tab.layout;
    if (tabLayout === null || countPanes(tabLayout.root) < 2) return [];
    return [{ id: tab.id, isActive, layout: tabLayout }];
  });
  const paneHost = usePaneHosts(
    keptTabs.flatMap((tab) =>
      listPanes(tab.layout.root).map((pane) => tabPaneKey(tab.id, pane.paneId)),
    ),
  );
  const isSplitActive = splitWorkspaceActive && panes.length > 1;
  const maximizedPane =
    layout !== null && maximizedPaneId !== null
      ? findPane(layout.root, maximizedPaneId)
      : null;
  const effectiveMaximizedPaneId =
    layout !== null &&
    countPanes(layout.root) > 1 &&
    maximizedPaneId !== null &&
    maximizedPane !== null
      ? maximizedPaneId
      : null;
  const {
    captureVisibleScrollPositions,
    workspaceRef: preservedScrollWorkspaceRef,
  } = usePreservedSplitScrollPositions(effectiveMaximizedPaneId);
  const setMaximizedPaneId = useCallback(
    (next: SetStateAction<string | null>) => {
      captureVisibleScrollPositions();
      setMaximizedPaneIdAtom(next);
    },
    [captureVisibleScrollPositions, setMaximizedPaneIdAtom],
  );

  useEffect(
    () =>
      wsManager.onThreadPaneAction((signal) => {
        const current = store.get(splitLayoutAtom);
        if (current === null) {
          return;
        }
        const previousMaximizedPaneId = store.get(maximizedPaneIdAtom);
        const next = applyThreadPaneActionToLayout(
          current,
          previousMaximizedPaneId,
          { projectId: signal.projectId, threadId: signal.threadId },
          signal.action,
        );
        if (next.layout !== current) {
          store.set(splitLayoutAtom, next.layout);
          const route = focusedPaneRoute(next.layout);
          if (route !== null) {
            navigate(route, { replace: true });
          }
        }
        if (next.maximizedPaneId !== previousMaximizedPaneId) {
          setMaximizedPaneId(next.maximizedPaneId);
        }
        if (next.dimInactiveSplits !== null) {
          store.set(dimInactiveSplitsAtom, next.dimInactiveSplits);
        }
      }),
    [navigate, setMaximizedPaneId, store],
  );

  useEffect(() => {
    if (maximizedPaneId === null) return;
    if (
      layout === null ||
      countPanes(layout.root) < 2 ||
      maximizedPane === null
    ) {
      setMaximizedPaneId(null);
      return;
    }
    if (layout.focusedPaneId !== maximizedPaneId) {
      setMaximizedPaneId(layout.focusedPaneId);
    }
  }, [layout, maximizedPane, maximizedPaneId, setMaximizedPaneId]);

  const workspaceMountedRef = useRef(false);
  useEffect(() => {
    workspaceMountedRef.current = true;
    return () => {
      workspaceMountedRef.current = false;
    };
  }, []);

  const navigateInPane = useCallback<NavigateInPane>(
    (paneId, originContent, thread) => {
      const current = store.get(splitLayoutAtom);
      if (current === null) return;
      const next = replaceOriginPaneContent(
        current,
        paneId,
        originContent,
        threadPaneContent(thread),
      );
      if (next === null) return;
      store.set(splitLayoutAtom, next);
      if (workspaceMountedRef.current && next.focusedPaneId === paneId) {
        navigate(getThreadRoutePath(thread));
      }
    },
    [navigate, store],
  );

  const [keyboardFocusRequest, setKeyboardFocusRequest] = useState<{
    paneId: string;
  } | null>(null);
  const [shownTabId, setShownTabId] = useState(splitTabs.activeTabId);
  if (shownTabId !== splitTabs.activeTabId) {
    setShownTabId(splitTabs.activeTabId);
    if (layout !== null) {
      setKeyboardFocusRequest({ paneId: layout.focusedPaneId });
    }
  }
  useEffect(() => {
    if (keyboardFocusRequest === null) return;
    const paneId = keyboardFocusRequest.paneId;
    const pane = layout === null ? null : findPane(layout.root, paneId);
    const workspace = preservedScrollWorkspaceRef.current;
    const root = Array.from(
      workspace?.querySelectorAll<HTMLElement>("[data-split-pane-id]") ?? [],
    ).find((element) => element.dataset.splitPaneId === paneId);
    if (!root || !pane || layout?.focusedPaneId !== paneId) return;
    let observer: MutationObserver | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      observer?.disconnect();
      clearTimeout(timeout);
    };
    const finish = () => {
      cancelAnimationFrame(frame);
      cancel();
      setKeyboardFocusRequest((current) =>
        current === keyboardFocusRequest ? null : current,
      );
    };
    const focus = () => {
      if (!root.isConnected || root.getAttribute("aria-hidden") === "true")
        return false;
      return focusPaneComposer(root) && root.contains(document.activeElement);
    };
    const frame = requestAnimationFrame(() => {
      if (focus()) {
        finish();
        return;
      }
      const content =
        root.querySelector<HTMLElement>("[data-pane-content]") ?? root;
      const control =
        pane.content.kind === "thread"
          ? null
          : content.querySelector<HTMLElement>(
              "input:not(:disabled), textarea:not(:disabled), [contenteditable='true'], button:not(:disabled), a[href], [tabindex='0']",
            );
      (control ?? root).focus({ preventScroll: true });
      observer = new MutationObserver(() => {
        if (document.activeElement !== root) {
          finish();
          return;
        }
        if (focus()) finish();
      });
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["contenteditable", "disabled"],
      });
      timeout = setTimeout(finish, 1000);
    });
    document.addEventListener("pointerdown", finish, true);
    document.addEventListener("keydown", finish, true);
    return () => {
      cancelAnimationFrame(frame);
      cancel();
      document.removeEventListener("pointerdown", finish, true);
      document.removeEventListener("keydown", finish, true);
    };
  }, [keyboardFocusRequest, layout, preservedScrollWorkspaceRef]);

  const focusPane = useCallback(
    (paneId: string) => {
      const current = store.get(splitLayoutAtom);
      if (current === null || current.focusedPaneId === paneId) {
        return;
      }
      const pane = findPane(current.root, paneId);
      store.set(splitLayoutAtom, setFocus(current, paneId));
      if (store.get(maximizedPaneIdAtom) !== null) {
        setMaximizedPaneId(paneId);
      }
      if (pane !== null) {
        navigate(paneContentRoute(pane.content), { replace: true });
      }
    },
    [navigate, setMaximizedPaneId, store],
  );

  const splitFocusedPane = useCallback(
    (side: SplitSide) => {
      const current = store.get(splitLayoutAtom);
      if (current === null) return;
      const next = splitPane(current, current.focusedPaneId, side, {
        kind: "new-thread",
      });
      if (next === current) return;
      store.set(
        seedSplitComposeProjectAtom,
        findPane(current.root, current.focusedPaneId)?.content,
      );
      store.set(splitLayoutAtom, next);
      if (store.get(maximizedPaneIdAtom) !== null) setMaximizedPaneId(null);
      setKeyboardFocusRequest({ paneId: next.focusedPaneId });
      navigate(paneContentRoute({ kind: "new-thread" }));
    },
    [navigate, setMaximizedPaneId, store],
  );

  const showTabLayout = useCallback(
    (next: SplitLayout | null) => {
      if (next === null) return;
      setKeyboardFocusRequest({ paneId: next.focusedPaneId });
      const route = focusedPaneRoute(next);
      if (route !== null) navigate(route, { replace: true });
    },
    [navigate],
  );

  const closePane = useCallback(
    (paneId: string) => {
      const current = store.get(splitLayoutAtom);
      if (current === null) {
        return;
      }
      const pane = findPane(current.root, paneId);
      if (pane === null) return;
      if (
        countPanes(current.root) === 1 &&
        store.get(splitTabsAtom).tabs.length > 1
      ) {
        showTabLayout(
          store.set(closeSplitTabAtom, store.get(splitTabsAtom).activeTabId),
        );
        return;
      }
      store.set(recordClosedPaneAtom, pane.content);
      if (countPanes(current.root) === 1) {
        if (pane.content.kind === "new-thread") return;
        store.set(
          splitLayoutAtom,
          replacePaneContent(current, paneId, { kind: "new-thread" }),
        );
        setMaximizedPaneId(null);
        navigate(paneContentRoute({ kind: "new-thread" }), { replace: true });
        return;
      }
      const next = removePane(current, paneId);
      if (next === current) {
        return;
      }
      store.set(splitLayoutAtom, next);
      if (store.get(maximizedPaneIdAtom) === paneId) {
        setMaximizedPaneId(null);
      }
      if (next.focusedPaneId !== current.focusedPaneId) {
        const route = focusedPaneRoute(next);
        if (route !== null) {
          navigate(route, { replace: true });
        }
      }
    },
    [navigate, setMaximizedPaneId, showTabLayout, store],
  );

  const toggleMaximizePane = useCallback(
    (paneId: string) => {
      const current = store.get(splitLayoutAtom);
      const pane = current === null ? null : findPane(current.root, paneId);
      if (current === null || countPanes(current.root) < 2 || pane === null) {
        return;
      }
      if (current.focusedPaneId !== paneId) {
        const next = setFocus(current, paneId);
        store.set(splitLayoutAtom, next);
        const route = focusedPaneRoute(next);
        if (route !== null) navigate(route, { replace: true });
      }
      setMaximizedPaneId((previous) => (previous === paneId ? null : paneId));
    },
    [navigate, setMaximizedPaneId, store],
  );

  const movePaneToSide = useCallback(
    (paneId: string, side: SplitSide) => {
      const current = store.get(splitLayoutAtom);
      if (current === null || countPanes(current.root) < 2) return;

      const rects = computePaneRects(current.root);
      const candidates = listPanes(current.root).filter(
        (pane) => pane.paneId !== paneId,
      );
      const edgePosition = (candidateId: string) => {
        const rect = rects.get(candidateId);
        if (rect === undefined) return 0;
        switch (side) {
          case "left":
            return rect.x;
          case "right":
            return -(rect.x + rect.w);
          case "top":
            return rect.y;
          case "bottom":
            return -(rect.y + rect.h);
        }
      };
      const target = candidates.sort(
        (first, second) =>
          edgePosition(first.paneId) - edgePosition(second.paneId),
      )[0];
      if (target === undefined) return;

      const next = movePane(current, paneId, target.paneId, side);
      if (next === current) return;
      store.set(splitLayoutAtom, next);
      const route = focusedPaneRoute(next);
      if (route !== null) navigate(route, { replace: true });
    },
    [navigate, store],
  );

  const resize = useCallback(
    (splitPath: SplitPath, childIndex: number, fraction: number) => {
      setLayout((previous) =>
        previous === null
          ? previous
          : resizeSplit(previous, splitPath, childIndex, fraction),
      );
    },
    [setLayout],
  );

  const beginPaneDrag = useCallback<BeginPaneDrag>(
    (paneId, event, label) => {
      if (store.get(splitLayoutAtom) === null) {
        return;
      }
      const sourceTabId = store.get(splitTabsAtom).activeTabId;
      const isInSourceTab = () =>
        store.get(splitTabsAtom).activeTabId === sourceTabId;
      const hoverSwitch = createSplitTabHoverSwitch((tabId) =>
        showTabLayout(store.set(selectSplitTabAtom, tabId)),
      );
      const restoreMaximizeAfterDrag =
        store.get(maximizedPaneIdAtom) === paneId;
      const sourceEl =
        event.currentTarget instanceof Element
          ? event.currentTarget.closest<HTMLElement>(
              `[${SPLIT_PANE_DATA_ATTR}]`,
            )
          : null;
      const startX = event.clientX;
      const startY = event.clientY;
      beginSplitDrag({
        ghostLabel: label,
        sourceEl,
        shouldEngage: (x, y) =>
          Math.hypot(x - startX, y - startY) > PANE_DRAG_ENGAGE_DISTANCE_PX,
        onEngage: restoreMaximizeAfterDrag
          ? () => setMaximizedPaneId(null)
          : undefined,
        onEnd: () => {
          hoverSwitch.cancel();
          if (!restoreMaximizeAfterDrag || !isInSourceTab()) return;
          const current = store.get(splitLayoutAtom);
          if (
            current !== null &&
            findPane(current.root, current.focusedPaneId) !== null
          ) {
            setMaximizedPaneId(current.focusedPaneId);
          }
        },
        resolveAuxiliaryTarget: (x, y) => {
          hoverSwitch.update(x, y);
          return isInSourceTab()
            ? resolveSplitTabDropTarget(x, y, (tabId) =>
                showTabLayout(store.set(movePaneToTabAtom, { paneId, tabId })),
              )
            : null;
        },
        decide: (targetPaneId, zone) => {
          if (isInSourceTab()) {
            return decidePaneDrop({ zone, isSelf: targetPaneId === paneId });
          }
          const move = { sourceTabId, paneId, targetPaneId, zone };
          return canMovePaneAcrossTabs(
            store.get(splitTabsAtom),
            store.get(splitLayoutAtom),
            move,
          )
            ? { zone, label: zone === "center" ? "Move here" : `Move ${zone}` }
            : null;
        },
        onDrop: (target) => {
          if (!isInSourceTab()) {
            showTabLayout(
              store.set(movePaneAcrossTabsAtom, {
                sourceTabId,
                paneId,
                targetPaneId: target.paneId,
                zone: target.zone,
              }),
            );
            return;
          }
          const current = store.get(splitLayoutAtom);
          if (current === null) {
            return;
          }
          const next =
            target.zone === "center"
              ? swapPanes(current, paneId, target.paneId)
              : movePane(current, paneId, target.paneId, target.zone);
          if (next === current) {
            return;
          }
          store.set(splitLayoutAtom, next);
          const route = focusedPaneRoute(next);
          if (route !== null) {
            navigate(route, { replace: true });
          }
        },
      });
    },
    [navigate, setMaximizedPaneId, showTabLayout, store],
  );

  if (layout === null || currentContent === null) return null;
  const firstPane = panes[0];
  const singlePane =
    panes.length === 1 && firstPane !== undefined ? firstPane : null;
  const keepsSinglePane =
    singlePane !== null &&
    (currentContent.kind === "thread" || currentContent.kind === "new-thread");
  if (!splitWorkspaceActive && !keepsSinglePane) {
    return (
      <StandalonePaneContent
        content={currentContent}
        paneId={layout.focusedPaneId}
        onRequestClose={
          currentContent.kind === "thread" ||
          currentContent.kind === "new-thread"
            ? null
            : () => closePane(layout.focusedPaneId)
        }
        onNavigateInPane={navigateInPane}
      />
    );
  }

  const commandHandlers = splitWorkspaceActive ? (
    <SplitPaneCommandHandlers
      closePane={closePane}
      focusPane={(paneId) => {
        focusPane(paneId);
        setKeyboardFocusRequest({ paneId });
      }}
      isSplitActive={isSplitActive}
      layout={layout}
      maximizedPaneId={effectiveMaximizedPaneId}
      panes={panes}
      splitFocusedPane={splitFocusedPane}
      toggleMaximizePane={toggleMaximizePane}
    />
  ) : null;

  const activeWorkspaceTab = keptTabs.find((tab) => tab.isActive) ?? null;
  const shownTabFocusedPaneId =
    effectiveMaximizedPaneId ?? layout.focusedPaneId;
  const onFocusPane = (paneId: string) => {
    setKeyboardFocusRequest(null);
    focusPane(paneId);
  };
  const workspace =
    keptTabs.length === 0 ? null : (
      <div
        key="workspace"
        ref={preservedScrollWorkspaceRef}
        aria-hidden={activeWorkspaceTab === null || undefined}
        inert={activeWorkspaceTab === null}
        style={activeWorkspaceTab === null ? HIDDEN_TAB_STYLE : undefined}
        className={cn(
          "relative -m-4 flex min-h-0 min-w-0 flex-1 overflow-hidden md:-m-5",
          activeWorkspaceTab === null &&
            "pointer-events-none invisible absolute inset-0",
        )}
      >
        <SplitWorkspaceSecondaryPanelHost
          focusedPaneId={
            activeWorkspaceTab === null
              ? (keptTabs[0]?.layout.focusedPaneId ?? layout.focusedPaneId)
              : shownTabFocusedPaneId
          }
          isPaneMaximized={
            activeWorkspaceTab !== null && effectiveMaximizedPaneId !== null
          }
          registry={registryForTab(
            activeWorkspaceTab?.id ?? keptTabs[0]?.id ?? splitTabs.activeTabId,
          )}
        >
          {keptTabs.map((tab) => {
            const tabProps = {
              isTopRow: true,
              isBottomRow: true,
              isLeftEdge: true,
              isRightEdge: true,
              dimsInactiveSplits,
              isTabActive: tab.isActive,
              focusedPaneId: tab.isActive ? shownTabFocusedPaneId : null,
              maximizedPaneId: tab.isActive ? effectiveMaximizedPaneId : null,
              secondaryPanelRegistry: registryForTab(tab.id),
              onFocusPane,
              onClosePane: closePane,
              onToggleMaximizePane: toggleMaximizePane,
              onMovePaneToSide: movePaneToSide,
              onResize: resize,
              onNavigateInPane: navigateInPane,
              onBeginPaneDrag: beginPaneDrag,
              paneHost: (paneId: string) =>
                paneHost(tabPaneKey(tab.id, paneId)),
            };
            const rects = computePaneRects(tab.layout.root);
            return (
              <Fragment key={tab.id}>
                <div
                  aria-hidden={!tab.isActive || undefined}
                  inert={!tab.isActive}
                  style={tab.isActive ? undefined : HIDDEN_TAB_STYLE}
                  className={cn(
                    "flex min-h-0 min-w-0 flex-1",
                    !tab.isActive &&
                      "pointer-events-none invisible absolute inset-0",
                  )}
                >
                  <SplitTree
                    {...tabProps}
                    node={tab.layout.root}
                    path={EMPTY_PATH}
                  />
                </div>
                {listPanes(tab.layout.root).map((pane) =>
                  createPortal(
                    <SplitPaneLeaf
                      {...tabProps}
                      {...paneEdges(rects.get(pane.paneId))}
                      node={pane}
                    />,
                    paneHost(tabPaneKey(tab.id, pane.paneId)),
                    tabPaneKey(tab.id, pane.paneId),
                  ),
                )}
              </Fragment>
            );
          })}
        </SplitWorkspaceSecondaryPanelHost>
      </div>
    );

  if (singlePane !== null) {
    const singlePaneContent = splitWorkspaceActive
      ? singlePane.content
      : currentContent;
    return (
      <>
        {commandHandlers}
        <WorkspacePaneContent
          key="single"
          content={singlePaneContent}
          paneId={singlePane.paneId}
          isFocused
          isSplitPane={false}
          timelineEnabled
          secondaryPanelRegistry={null}
          onClosePane={
            singlePaneContent.kind === "thread" ||
            singlePaneContent.kind === "new-thread"
              ? null
              : closePane
          }
          isMaximized={false}
          onToggleMaximizePane={null}
          isBoundedPane={false}
          isTopRow
          ownsWindowTopLeft
          onNavigateInPane={navigateInPane}
          onBeginPaneDrag={
            singlePaneContent.kind === "thread" ? beginPaneDrag : undefined
          }
        />
        {workspace}
      </>
    );
  }

  return (
    <>
      {commandHandlers}
      {workspace}
    </>
  );
}

interface SplitPaneCommandHandlersProps {
  closePane: (paneId: string) => void;
  focusPane: (paneId: string) => void;
  isSplitActive: boolean;
  layout: SplitLayout;
  maximizedPaneId: string | null;
  panes: readonly PaneNode[];
  splitFocusedPane: (side: SplitSide) => void;
  toggleMaximizePane: (paneId: string) => void;
}

function SplitPaneCommandHandlers({
  closePane,
  focusPane,
  isSplitActive,
  layout,
  maximizedPaneId,
  panes,
  splitFocusedPane,
  toggleMaximizePane,
}: SplitPaneCommandHandlersProps) {
  useAppCommandContext("splitActive", isSplitActive);
  const splitDirection = useAtomValue(splitDirectionAtom);
  const isInboxTab = useIsInboxTabActive();
  const directionalTargets = useMemo(
    () =>
      (["left", "right", "top", "bottom"] as const).map((direction) =>
        isSplitActive
          ? getDirectionalPaneId(layout.root, layout.focusedPaneId, direction)
          : null,
      ),
    [isSplitActive, layout.root, layout.focusedPaneId],
  );
  useEffect(() => {
    getBbDesktopInfo()?.setSplitNavigationEnabled?.(
      isSplitActive,
      PANE_DIRECTION_APP_COMMAND_IDS.filter(
        (_, index) => directionalTargets[index] !== null,
      ),
    );
  }, [isSplitActive, directionalTargets]);
  useIndexedAppCommandHandlers(PANE_DIRECTION_APP_COMMAND_IDS, (index) => {
    const paneId = directionalTargets[index];
    if (!paneId) return false;
    focusPane(paneId);
    return true;
  });
  useAppCommandHandler("pane.focus.previous", () => {
    if (!isSplitActive) return false;
    const paneId = getAdjacentPaneId(panes, layout.focusedPaneId, -1);
    if (paneId !== null) focusPane(paneId);
    return true;
  });
  useAppCommandHandler("pane.focus.next", () => {
    if (!isSplitActive) return false;
    const paneId = getAdjacentPaneId(panes, layout.focusedPaneId, 1);
    if (paneId !== null) focusPane(paneId);
    return true;
  });
  useIndexedAppCommandHandlers(PANE_FOCUS_APP_COMMAND_IDS, (index) => {
    if (!isSplitActive) return false;
    const paneId = panes[index]?.paneId ?? null;
    if (paneId !== null) focusPane(paneId);
    return true;
  });
  useAppCommandHandler("pane.split.right", () => {
    if (isInboxTab) return true;
    splitFocusedPane(splitDirection === "down" ? "bottom" : "right");
    return true;
  });
  useAppCommandHandler("pane.split.down", () => {
    if (isInboxTab) return true;
    splitFocusedPane(splitDirection === "down" ? "right" : "bottom");
    return true;
  });
  useAppCommandHandler("pane.close", () => {
    closePane(layout.focusedPaneId);
    return true;
  });
  useAppCommandHandler("pane.maximize.toggle", () => {
    if (!isSplitActive) return false;
    toggleMaximizePane(maximizedPaneId ?? layout.focusedPaneId);
    return true;
  });
  return null;
}

interface SplitTreeProps {
  node: LayoutNode;
  path: SplitPath;
  dimsInactiveSplits: boolean;
  isTopRow: boolean;
  isBottomRow: boolean;
  isLeftEdge: boolean;
  isRightEdge: boolean;
  isTabActive: boolean;
  focusedPaneId: string | null;
  maximizedPaneId: string | null;
  secondaryPanelRegistry: PaneSecondaryPanelRegistry;
  onFocusPane: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  onToggleMaximizePane: (paneId: string) => void;
  onMovePaneToSide: (paneId: string, side: SplitSide) => void;
  onResize: (
    splitPath: SplitPath,
    childIndex: number,
    fraction: number,
  ) => void;
  onNavigateInPane: NavigateInPane;
  onBeginPaneDrag: BeginPaneDrag;
  paneHost: (paneId: string) => HTMLElement;
}

function SplitTree(props: SplitTreeProps) {
  const { node, path, isTopRow, isBottomRow, isLeftEdge, isRightEdge } = props;

  if (node.type === "pane") {
    return <PaneSlot host={props.paneHost(node.paneId)} />;
  }

  return (
    <div
      data-split-resize-grid-root=""
      className={cn(
        "flex min-h-0 min-w-0 flex-1 [&:has(>[data-dragging])>*]:transition-none",
        node.dir === "col" ? "flex-col" : "flex-row",
      )}
    >
      {node.children.map((child, index) => (
        <Fragment key={paneKey(child)}>
          {index > 0 ? (
            <SplitDivider
              boundaryIndex={index}
              childCount={node.children.length}
              dir={node.dir}
              hidden={props.maximizedPaneId !== null}
              onResize={(fraction) => props.onResize(path, index - 1, fraction)}
            />
          ) : null}
          <div
            className="flex min-h-0 min-w-0 transition-[flex-grow] duration-150 ease-out motion-reduce:transition-none"
            style={{ flex: `${node.sizes[index] ?? 1} 1 0` }}
          >
            <SplitTree
              {...props}
              node={child}
              path={[...path, index]}
              isTopRow={isTopRow && (node.dir === "row" || index === 0)}
              isBottomRow={
                isBottomRow &&
                (node.dir === "row" || index === node.children.length - 1)
              }
              isLeftEdge={isLeftEdge && (node.dir === "col" || index === 0)}
              isRightEdge={
                isRightEdge &&
                (node.dir === "col" || index === node.children.length - 1)
              }
            />
          </div>
        </Fragment>
      ))}
    </div>
  );
}

interface SplitPaneLeafProps extends Omit<
  SplitTreeProps,
  "node" | "path" | "onResize" | "paneHost"
> {
  node: PaneNode;
}

function SplitPaneLeaf(props: SplitPaneLeafProps) {
  const { node, isTopRow, isBottomRow, isLeftEdge, focusedPaneId } = props;
  const isSidebarFramed = useIsSidebarFramed();
  const isFocused = node.paneId === focusedPaneId;
  const isMaximized = node.paneId === props.maximizedPaneId;
  const isHiddenByMaximize = props.maximizedPaneId !== null && !isMaximized;
  return (
    <div
      onPointerDown={() => props.onFocusPane(node.paneId)}
      aria-hidden={isHiddenByMaximize || undefined}
      style={isHiddenByMaximize ? { contentVisibility: "hidden" } : undefined}
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 overflow-hidden",
        isHiddenByMaximize && "invisible pointer-events-none",
        isMaximized && "absolute inset-0 z-30",
        !isMaximized && !isBottomRow && "[--bb-content-bottom-inset:0px]",
      )}
      tabIndex={-1}
      data-split-pane-id={props.isTabActive ? node.paneId : undefined}
      data-focused={isFocused ? "true" : "false"}
      data-maximized={isMaximized ? "true" : undefined}
    >
      <WorkspacePaneContent
        content={node.content}
        paneId={node.paneId}
        isFocused={isFocused}
        isSplitPane
        timelineEnabled={props.isTabActive && !isHiddenByMaximize}
        secondaryPanelRegistry={props.secondaryPanelRegistry}
        onClosePane={props.onClosePane}
        isMaximized={isMaximized}
        onToggleMaximizePane={props.onToggleMaximizePane}
        onMovePaneToSide={props.onMovePaneToSide}
        isBoundedPane
        isTopRow={isMaximized || isTopRow}
        ownsWindowTopLeft={
          props.maximizedPaneId !== null ? isMaximized : isTopRow && isLeftEdge
        }
        onNavigateInPane={props.onNavigateInPane}
        onBeginPaneDrag={props.onBeginPaneDrag}
      />
      <div
        aria-hidden
        data-pane-focus-scrim=""
        className={cn(
          "pointer-events-none absolute inset-0 z-20 transition-colors",
          isSidebarFramed &&
            (isMaximized || isTopRow) &&
            "top-[calc(var(--bb-window-frame-top)_+_1px)]",
          isFocused || !props.dimsInactiveSplits
            ? "bg-transparent"
            : "bg-background/30",
        )}
      />
    </div>
  );
}

const KEPT_SPLIT_TAB_COUNT = 3;

const HIDDEN_TAB_STYLE = { contentVisibility: "hidden" } as const;

function tabPaneKey(tabId: string, paneId: string): string {
  return `${tabId}/${paneId}`;
}

function useRecentSplitTabIds(activeTabId: string): readonly string[] {
  const [recent, setRecent] = useState<readonly string[]>([activeTabId]);
  if (recent[0] !== activeTabId) {
    setRecent(
      [activeTabId, ...recent.filter((id) => id !== activeTabId)].slice(
        0,
        KEPT_SPLIT_TAB_COUNT,
      ),
    );
  }
  return recent;
}

function useTabSecondaryPanelRegistries(tabs: readonly { id: string }[]) {
  const registriesRef = useRef(new Map<string, PaneSecondaryPanelRegistry>());
  const liveKey = tabs.map((tab) => tab.id).join("\n");
  useEffect(() => {
    const live = new Set(liveKey.split("\n"));
    for (const tabId of registriesRef.current.keys()) {
      if (!live.has(tabId)) registriesRef.current.delete(tabId);
    }
  }, [liveKey]);
  return useCallback((tabId: string) => {
    const existing = registriesRef.current.get(tabId);
    if (existing !== undefined) return existing;
    const registry = createPaneSecondaryPanelRegistry();
    registriesRef.current.set(tabId, registry);
    return registry;
  }, []);
}

function usePaneHosts(paneIds: readonly string[]) {
  const hostsRef = useRef(new Map<string, HTMLDivElement>());
  const getHost = useCallback((paneId: string) => {
    const existing = hostsRef.current.get(paneId);
    if (existing !== undefined) return existing;
    const host = document.createElement("div");
    host.style.display = "contents";
    hostsRef.current.set(paneId, host);
    return host;
  }, []);
  const liveKey = paneIds.join("\n");
  useEffect(() => {
    const live = new Set(liveKey.split("\n"));
    for (const paneId of hostsRef.current.keys()) {
      if (!live.has(paneId)) hostsRef.current.delete(paneId);
    }
  }, [liveKey]);
  return getHost;
}

function PaneSlot({ host }: { host: HTMLElement }) {
  const slotRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (slot !== null && host.parentNode !== slot) slot.appendChild(host);
  }, [host]);
  return <div ref={slotRef} className="contents" />;
}

const EDGE_EPSILON = 1e-6;

function paneEdges(rect: PaneRect | undefined) {
  if (rect === undefined) {
    return {
      isTopRow: true,
      isBottomRow: true,
      isLeftEdge: true,
      isRightEdge: true,
    };
  }
  return {
    isTopRow: rect.y < EDGE_EPSILON,
    isBottomRow: rect.y + rect.h > 1 - EDGE_EPSILON,
    isLeftEdge: rect.x < EDGE_EPSILON,
    isRightEdge: rect.x + rect.w > 1 - EDGE_EPSILON,
  };
}

interface WorkspacePaneContentProps {
  content: PaneContent;
  paneId: string;
  isFocused: boolean;
  isSplitPane: boolean;
  timelineEnabled: boolean;
  secondaryPanelRegistry: PaneSecondaryPanelRegistry | null;
  onClosePane: ((paneId: string) => void) | null;
  isMaximized: boolean;
  onToggleMaximizePane: ((paneId: string) => void) | null;
  onMovePaneToSide?: (paneId: string, side: SplitSide) => void;
  isBoundedPane: boolean;
  isTopRow: boolean;
  ownsWindowTopLeft: boolean;
  onNavigateInPane: NavigateInPane;
  onBeginPaneDrag?: BeginPaneDrag;
}

const WorkspacePaneContent = memo(function WorkspacePaneContent({
  content,
  paneId,
  isFocused,
  isSplitPane,
  timelineEnabled,
  secondaryPanelRegistry,
  onClosePane,
  isMaximized,
  onToggleMaximizePane,
  onMovePaneToSide,
  isBoundedPane,
  isTopRow,
  ownsWindowTopLeft,
  onNavigateInPane,
  onBeginPaneDrag,
}: WorkspacePaneContentProps) {
  const onRequestClose = useMemo(
    () => (onClosePane === null ? null : () => onClosePane(paneId)),
    [onClosePane, paneId],
  );
  const onToggleMaximize = useMemo(
    () =>
      onToggleMaximizePane === null ? null : () => onToggleMaximizePane(paneId),
    [onToggleMaximizePane, paneId],
  );
  const onMoveToSide = useMemo(
    () =>
      onMovePaneToSide === undefined
        ? undefined
        : (side: SplitSide) => onMovePaneToSide(paneId, side),
    [onMovePaneToSide, paneId],
  );
  const navigateInPane = useCallback(
    (thread: ThreadRoutePathArgs) => onNavigateInPane(paneId, content, thread),
    [content, onNavigateInPane, paneId],
  );
  const beginPaneDrag = useMemo(
    () =>
      onBeginPaneDrag
        ? (event: ReactPointerEvent, label: string) =>
            onBeginPaneDrag(paneId, event, label)
        : undefined,
    [onBeginPaneDrag, paneId],
  );
  const secondaryPanelHost = useMemo<PaneSecondaryPanelRegistration | null>(
    () =>
      secondaryPanelRegistry === null
        ? null
        : {
            publish: (model) => secondaryPanelRegistry.publish(paneId, model),
            clear: () => secondaryPanelRegistry.clear(paneId),
          },
    [paneId, secondaryPanelRegistry],
  );
  const value = useMemo<PaneContextValue>(
    () => ({
      paneId,
      isFocused,
      isSplitPane,
      secondaryPanelHost,
      reservesWindowPanelToggle: false,
      onRequestClose,
      isMaximized,
      onToggleMaximize,
      onMoveToSide,
      isBoundedPane,
      isTopRow,
      ownsWindowTopLeft,
      navigateInPane,
      beginPaneDrag,
    }),
    [
      beginPaneDrag,
      isBoundedPane,
      isFocused,
      isSplitPane,
      isTopRow,
      ownsWindowTopLeft,
      navigateInPane,
      onRequestClose,
      isMaximized,
      onToggleMaximize,
      onMoveToSide,
      paneId,
      secondaryPanelHost,
    ],
  );
  const panelTabValue = useMemo<PaneContextValue>(
    () => ({ ...value, secondaryPanelHost: null }),
    [value],
  );

  if (content.kind === "thread-panel-tab") {
    return (
      <PaneContext.Provider value={panelTabValue}>
        <SecondaryPanelHostLayoutContext.Provider value={null}>
          <ThreadDetailView
            surface="pane"
            projectId={content.projectId}
            threadId={content.threadId}
            timelineEnabled={false}
            panelTabId={content.tabId}
          />
        </SecondaryPanelHostLayoutContext.Provider>
      </PaneContext.Provider>
    );
  }

  if (content.kind !== "thread") {
    return (
      <PaneContext.Provider value={value}>
        <NonThreadPaneContent
          content={content}
          onRequestClose={onRequestClose}
          beginPaneDrag={beginPaneDrag}
          isBoundedPane={isBoundedPane}
        />
      </PaneContext.Provider>
    );
  }

  return (
    <PaneContext.Provider value={value}>
      <ThreadDetailView
        surface="pane"
        projectId={content.projectId}
        threadId={content.threadId}
        timelineEnabled={timelineEnabled}
      />
    </PaneContext.Provider>
  );
});

function StandalonePaneContent({
  content,
  paneId,
  onRequestClose,
  onNavigateInPane,
}: {
  content: PaneContent;
  paneId: string;
  onRequestClose: (() => void) | null;
  onNavigateInPane: NavigateInPane;
}) {
  const navPanelChrome = usePluginNavPanelChrome();
  const navigateInPane = useCallback(
    (thread: ThreadRoutePathArgs) => onNavigateInPane(paneId, content, thread),
    [content, onNavigateInPane, paneId],
  );
  if (content.kind === "thread" || content.kind === "new-thread") {
    return (
      <DefaultPaneContextProvider
        paneId={paneId}
        onRequestClose={onRequestClose}
        navigateInPane={navigateInPane}
      >
        {content.kind === "thread" ? (
          <ThreadDetailView surface="page" />
        ) : (
          <RootComposeView />
        )}
      </DefaultPaneContextProvider>
    );
  }
  if (content.kind === "thread-panel-tab") {
    return (
      <DefaultPaneContextProvider
        paneId={paneId}
        onRequestClose={onRequestClose}
        navigateInPane={navigateInPane}
      >
        <ThreadDetailView
          surface="pane"
          projectId={content.projectId}
          threadId={content.threadId}
          timelineEnabled={false}
          panelTabId={content.tabId}
        />
      </DefaultPaneContextProvider>
    );
  }
  if (content.kind === "plugin-detail") {
    return <LazyPluginDetailPaneView pluginId={content.pluginId} />;
  }
  const panelEntry = navPanelChrome.find(
    (candidate) =>
      candidate.chrome.pluginId === content.pluginId &&
      candidate.chrome.path === content.panelPath,
  );
  const panel = panelEntry?.panel ?? undefined;
  const panelChrome = panelEntry?.chrome;
  const body = (
    <PluginPanelView
      pluginId={content.pluginId}
      panelPath={content.panelPath}
      subPath={content.subPath}
    />
  );
  const paneActions = onRequestClose ? (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        HEADER_PANE_ACTION_ICON_BUTTON_CLASS,
        CHROME_SUBTLE_ICON_BUTTON_FOREGROUND_CLASS,
      )}
      aria-label="Close pane"
      onClick={onRequestClose}
    >
      <Icon name="ClosePluginPane" />
    </Button>
  ) : null;
  return (
    <PluginPageTitleHost
      pluginId={content.pluginId}
      panelPath={content.panelPath}
      subPath={content.subPath}
    >
      <PluginPagePanelHost
        flushPageInsets
        pluginId={content.pluginId}
        panelPath={content.panelPath}
        paneId={paneId}
        subPath={content.subPath}
      >
        {panelChrome ? (
          <div className="flex h-full min-h-0 flex-col">
            <AppPageHeader
              center={<PluginPanelHeaderCenter chrome={panelChrome} />}
              actions={
                panel ? (
                  <PluginPanelHeaderActions
                    panel={panel}
                    paneId={paneId}
                    subPath={content.subPath}
                    paneActions={paneActions}
                  />
                ) : (
                  paneActions
                )
              }
            />
            <div className="flex min-h-0 flex-1 flex-col p-4 md:p-5">
              {body}
            </div>
          </div>
        ) : (
          body
        )}
      </PluginPagePanelHost>
    </PluginPageTitleHost>
  );
}

function NonThreadPaneContent({
  content,
  onRequestClose,
  beginPaneDrag,
  isBoundedPane,
}: {
  content: Exclude<PaneContent, { kind: "thread" | "thread-panel-tab" }>;
  onRequestClose: (() => void) | null;
  beginPaneDrag?: (event: ReactPointerEvent, label: string) => void;
  isBoundedPane: boolean;
}) {
  const navPanelChrome = usePluginNavPanelChrome();
  const dimsInactiveSplits = useAtomValue(dimInactiveSplitsAtom);
  const { reservesWindowPanelToggle, isFocused } = useOptionalPaneContext() ?? {
    reservesWindowPanelToggle: false,
    isFocused: true,
  };
  const hostLayout = useContext(SecondaryPanelHostLayoutContext);
  const showsWindowPanelToggle = hostLayout?.pinsCornerToggle === true;
  const [desktopInfo] = useState(getBbDesktopInfo);
  const usesDesktopChrome = shouldUseMacosDesktopChrome(desktopInfo);
  const panelEntry =
    content.kind === "plugin-panel"
      ? navPanelChrome.find(
          (candidate) =>
            candidate.chrome.pluginId === content.pluginId &&
            candidate.chrome.path === content.panelPath,
        )
      : undefined;
  const panel = panelEntry?.panel ?? undefined;
  const panelChrome = panelEntry?.chrome;
  const label =
    panelChrome?.title ??
    (content.kind === "plugin-detail" ? "Extension" : "New thread");
  const handlePointerDown = (event: ReactPointerEvent) => {
    if (
      event.target instanceof Element &&
      event.target.closest("a, button") !== null
    ) {
      return;
    }
    if (event.button === 0) beginPaneDrag?.(event, label);
  };
  const paneActions = (
    <>
      <PaneMaximizeButton />
      {onRequestClose ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            HEADER_PANE_ACTION_ICON_BUTTON_CLASS,
            CHROME_SUBTLE_ICON_BUTTON_FOREGROUND_CLASS,
          )}
          aria-label="Close pane"
          onClick={onRequestClose}
        >
          <Icon
            name={
              content.kind === "new-thread"
                ? "CloseThreadPane"
                : "ClosePluginPane"
            }
          />
        </Button>
      ) : null}
    </>
  );
  const actions = (
    <>
      {panel ? (
        <PluginPanelHeaderActions
          panel={panel}
          subPath={content.kind === "plugin-panel" ? content.subPath : ""}
          paneActions={paneActions}
        />
      ) : (
        paneActions
      )}
      {reservesWindowPanelToggle && showsWindowPanelToggle ? (
        <span aria-hidden className={HEADER_ICON_BUTTON_CLASS} />
      ) : null}
    </>
  );

  const contentMarkup = (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        !isBoundedPane && content.kind === "new-thread" && "-m-4 md:-m-5",
        !isBoundedPane &&
          !panel &&
          content.kind !== "new-thread" &&
          "pt-(--bb-window-frame-top)",
      )}
    >
      {isBoundedPane || panel ? (
        <AppPageHeader
          isWindowDragRegion={false}
          ownsWindowTopLeft={false}
          className={isBoundedPane ? "z-[21]" : undefined}
          center={
            <div
              data-pane-header-focus-tab={
                isBoundedPane && isFocused ? "" : undefined
              }
              className={cn(
                "relative flex min-w-0 flex-1 items-center",
                isBoundedPane && "-my-1 -ml-2 rounded-md px-2 py-1",
                isBoundedPane && isFocused && CONTEXT_SELECTION_SURFACE_CLASS,
                beginPaneDrag &&
                  cn(
                    "cursor-grab touch-none select-none",
                    usesDesktopChrome && MACOS_WINDOW_NO_DRAG_CLASS,
                  ),
              )}
              onPointerDown={beginPaneDrag ? handlePointerDown : undefined}
            >
              {beginPaneDrag ? (
                <PaneDragHandle usesDesktopChrome={usesDesktopChrome} />
              ) : null}
              {panelChrome ? (
                <PluginPanelHeaderCenter chrome={panelChrome} />
              ) : (
                <p
                  className={cn(
                    "relative truncate text-sm font-normal transition-colors",
                    isBoundedPane &&
                      !isFocused &&
                      dimsInactiveSplits &&
                      CONTEXT_INACTIVE_TEXT_CLASS,
                  )}
                >
                  {content.kind === "plugin-detail"
                    ? "Extension"
                    : "New thread"}
                </p>
              )}
            </div>
          }
          actions={actions}
        />
      ) : null}
      <div
        data-pane-content=""
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col p-4 md:p-5",
          isBoundedPane && content.kind === "plugin-panel" && "isolate",
        )}
      >
        {content.kind === "new-thread" ? (
          <RootComposeView />
        ) : content.kind === "plugin-detail" ? (
          <LazyPluginDetailPaneView pluginId={content.pluginId} />
        ) : (
          <PluginPanelView
            pluginId={content.pluginId}
            panelPath={content.panelPath}
            subPath={content.subPath}
          />
        )}
      </div>
    </div>
  );

  return content.kind === "plugin-panel" ? (
    <PluginPageTitleHost
      pluginId={content.pluginId}
      panelPath={content.panelPath}
      subPath={content.subPath}
      focused={isFocused}
    >
      <PluginPagePanelHost
        flushPageInsets={!isBoundedPane}
        pluginId={content.pluginId}
        panelPath={content.panelPath}
        subPath={content.subPath}
      >
        {contentMarkup}
      </PluginPagePanelHost>
    </PluginPageTitleHost>
  ) : (
    contentMarkup
  );
}

interface SplitDividerProps {
  boundaryIndex: number;
  childCount: number;
  dir: "row" | "col";
  hidden: boolean;
  onResize: (fraction: number) => void;
}

interface FrozenTimelineRow {
  containIntrinsicBlockSize: string;
  contentVisibility: string;
  element: HTMLElement;
  height: string;
}

function findVerticalScrollViewport(element: HTMLElement): HTMLElement | null {
  let candidate = element.parentElement;
  while (candidate !== null) {
    const overflowY = window.getComputedStyle(candidate).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      candidate.scrollHeight > candidate.clientHeight
    ) {
      return candidate;
    }
    candidate = candidate.parentElement;
  }
  return null;
}

function freezeOffscreenTimelineRows(
  previous: HTMLElement,
  next: HTMLElement,
): () => void {
  const rows = [
    ...previous.querySelectorAll<HTMLElement>("[data-timeline-row-id]"),
    ...next.querySelectorAll<HTMLElement>("[data-timeline-row-id]"),
  ];
  const frozenRows: FrozenTimelineRow[] = [];
  const viewportRects = new Map<HTMLElement, DOMRect>();

  for (const row of rows) {
    const viewport = findVerticalScrollViewport(row);
    if (viewport === null) continue;
    const rowRect = row.getBoundingClientRect();
    let viewportRect = viewportRects.get(viewport);
    if (viewportRect === undefined) {
      viewportRect = viewport.getBoundingClientRect();
      viewportRects.set(viewport, viewportRect);
    }
    const overscan = viewportRect.height;
    const isOffscreen =
      rowRect.bottom < viewportRect.top - overscan ||
      rowRect.top > viewportRect.bottom + overscan;
    if (!isOffscreen || rowRect.height <= 0) continue;
    frozenRows.push({
      containIntrinsicBlockSize: row.style.containIntrinsicBlockSize,
      contentVisibility: row.style.contentVisibility,
      element: row,
      height: `${rowRect.height}px`,
    });
  }

  for (const { element, height } of frozenRows) {
    element.style.containIntrinsicBlockSize = height;
    element.style.contentVisibility = "hidden";
  }

  return () => {
    for (const {
      containIntrinsicBlockSize,
      contentVisibility,
      element,
    } of frozenRows) {
      element.style.containIntrinsicBlockSize = containIntrinsicBlockSize;
      element.style.contentVisibility = contentVisibility;
    }
  };
}

function SplitDivider({
  boundaryIndex,
  childCount,
  dir,
  hidden,
  onResize,
}: SplitDividerProps) {
  const horizontal = dir === "row";
  const isSidebarFramed = useIsSidebarFramed();
  const finishResizeRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      finishResizeRef.current?.();
    },
    [],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      finishResizeRef.current?.();
      const hitTarget = event.currentTarget;
      const divider = hitTarget.parentElement;
      if (!(divider instanceof HTMLDivElement)) {
        return;
      }
      const previous = divider.previousElementSibling;
      const next = divider.nextElementSibling;
      if (
        !(previous instanceof HTMLElement) ||
        !(next instanceof HTMLElement)
      ) {
        return;
      }
      const previousRect = previous.getBoundingClientRect();
      const nextRect = next.getBoundingClientRect();
      const start = horizontal ? previousRect.left : previousRect.top;
      const end = horizontal ? nextRect.right : nextRect.bottom;
      const span = end - start;
      if (span <= 0) {
        return;
      }

      hitTarget.setPointerCapture(event.pointerId);
      divider.dataset.dragging = "true";
      const pointerId = event.pointerId;
      const snapSession = createSplitResizeSnapSession(
        divider,
        horizontal ? "x" : "y",
        { boundaryIndex, childCount },
      );
      const pointerDownPosition = horizontal ? event.clientX : event.clientY;
      snapSession.resolve({ end, pointer: pointerDownPosition, start });

      const pair = createSplitResizeFlexPair(previous, next);
      const restoreTimelineRows = freezeOffscreenTimelineRows(previous, next);
      let pendingFraction: number | null = null;
      let finished = false;

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const pointer = horizontal ? moveEvent.clientX : moveEvent.clientY;
        const { fraction } = snapSession.resolve({
          end,
          pointer,
          start,
        });
        pendingFraction = fraction;

        pair.apply(fraction);
      };
      const finish = (commit: boolean) => {
        if (finished) return;
        finished = true;
        finishResizeRef.current = null;
        delete divider.dataset.dragging;
        hitTarget.removeEventListener("pointermove", onMove);
        hitTarget.removeEventListener("pointerup", onUp);
        hitTarget.removeEventListener("pointercancel", onCancel);
        hitTarget.removeEventListener("lostpointercapture", onLostCapture);
        if (hitTarget.hasPointerCapture?.(pointerId)) {
          hitTarget.releasePointerCapture(pointerId);
        }
        snapSession.clear();
        restoreTimelineRows();
        if (commit && pendingFraction !== null) {
          onResize(pendingFraction);
          return;
        }
        pair.restore();
      };
      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        finish(true);
      };
      const onCancel = (cancelEvent: PointerEvent) => {
        if (cancelEvent.pointerId !== pointerId) return;
        finish(false);
      };
      const onLostCapture = (lostEvent: PointerEvent) => {
        if (lostEvent.pointerId !== pointerId) return;
        finish(false);
      };
      hitTarget.addEventListener("pointermove", onMove);
      hitTarget.addEventListener("pointerup", onUp);
      hitTarget.addEventListener("pointercancel", onCancel);
      hitTarget.addEventListener("lostpointercapture", onLostCapture);
      finishResizeRef.current = () => finish(false);
    },
    [boundaryIndex, childCount, horizontal, onResize],
  );

  return (
    <div
      role="separator"
      data-split-resize-grid-boundary={boundaryIndex}
      data-split-resize-grid-count={childCount}
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      className={cn(
        "group relative z-[25] flex-shrink-0 transition-colors",
        isSidebarFramed ? "bg-border" : "bg-border-seam",
        "hover:bg-ring/40 data-[dragging]:bg-ring/40",
        hidden && "invisible pointer-events-none",
        horizontal ? "w-px cursor-col-resize" : "h-px cursor-row-resize",
      )}
    >
      <div
        aria-hidden
        data-split-divider-hit-target=""
        onPointerDown={handlePointerDown}
        className={cn(
          "absolute z-10 touch-none bg-transparent",
          horizontal
            ? "-left-1.5 top-0 h-full w-3 cursor-col-resize"
            : "left-0 -top-1.5 h-3 w-full cursor-row-resize",
        )}
      />
    </div>
  );
}

function layoutThreadIds(layout: SplitLayout | null): string[] {
  return layout === null
    ? []
    : listPanes(layout.root).flatMap((pane) =>
        pane.content.kind === "thread" ||
        pane.content.kind === "thread-panel-tab"
          ? [pane.content.threadId]
          : [],
      );
}

function OpenThreadStaleWatchers() {
  const { threadId: routeThreadId } = useRouteState();
  const navigate = useImmediateRouteNavigate();
  const store = useStore();
  const activeLayout = useAtomValue(splitLayoutAtom);
  const splitTabs = useAtomValue(splitTabsAtom);
  const threadIds = new Set([
    ...(routeThreadId ? [routeThreadId] : []),
    ...layoutThreadIds(activeLayout),
    ...splitTabs.tabs.flatMap((tab) =>
      tab.id === splitTabs.activeTabId ? [] : layoutThreadIds(tab.layout),
    ),
  ]);
  const closeThread = (threadId: string) => {
    const layoutBefore = store.get(splitLayoutAtom);
    const shownInActiveTab =
      layoutBefore === null || layoutThreadIds(layoutBefore).includes(threadId);
    const result = store.set(closeThreadsInAllTabsAtom, [threadId]);
    if (result.focusedRoute !== null) {
      if (result.focusedRoute.threadId !== routeThreadId) {
        navigate(getThreadRoutePath(result.focusedRoute), { replace: true });
      }
    } else if (shownInActiveTab && routeThreadId === threadId) {
      navigate(getRootComposeRoutePath(), { replace: true });
    }
  };
  return [...threadIds].map((threadId) => (
    <PaneStaleWatcher
      key={threadId}
      threadId={threadId}
      onStale={() => closeThread(threadId)}
    />
  ));
}

interface PaneStaleWatcherProps {
  threadId: string;
  onStale: () => void;
}

function PaneStaleWatcher({ threadId, onStale }: PaneStaleWatcherProps) {
  const { data: thread, isSuccess, isError, error } = useThread(threadId);
  const hasObservedUnarchived = useRef(false);
  const unarchivesInFlight = useIsMutating({
    mutationKey: ["unarchive-thread"],
  });
  const archivesInFlight = useIsMutating({
    predicate: (mutation) =>
      mutation.options.meta?.lifecycleOperation === "archive_thread",
  });
  const isGone =
    isError && error instanceof BbHttpError && error.status === 404;
  const isDeleted =
    isSuccess && thread !== undefined && thread.deletedAt !== null;
  const isConfirmedArchived =
    isSuccess &&
    thread !== undefined &&
    thread.archivedAt !== null &&
    archivesInFlight === 0;
  const isUnarchived =
    isSuccess && thread !== undefined && thread.archivedAt === null;

  const onStaleRef = useRef(onStale);
  useEffect(() => {
    onStaleRef.current = onStale;
  }, [onStale]);
  useEffect(() => {
    if (isUnarchived && unarchivesInFlight === 0) {
      hasObservedUnarchived.current = true;
    }
    if (
      isGone ||
      isDeleted ||
      (isConfirmedArchived && hasObservedUnarchived.current)
    ) {
      onStaleRef.current();
    }
  }, [
    isConfirmedArchived,
    isDeleted,
    isGone,
    isUnarchived,
    unarchivesInFlight,
  ]);

  return null;
}

function paneKey(node: LayoutNode): string {
  return node.type === "pane"
    ? node.paneId
    : listPanes(node)
        .map((pane) => pane.paneId)
        .join("-");
}
