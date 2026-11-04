import { preloadThreadSecondaryPanel } from "@/components/secondary-panel/lazySecondaryPanelComponents";
import {
  ThreadStatusDot,
  useThreadDot,
} from "@/components/thread/ThreadStatusDot";
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@bb/shared-ui/button";
import { useAtomValue } from "jotai";
import type {
  PluginThreadActionEntry,
  PluginThreadActionTarget,
} from "@get-bb/plugin-sdk";
import { COARSE_POINTER_TOOLBAR_ACTION_BUTTON_CLASS } from "@bb/shared-ui/coarse-pointer-sizing";
import { Icon } from "@bb/shared-ui/icon";
import { SplitButton } from "@/components/ui/split-button.js";
import {
  AppPageHeader,
  HEADER_ICON_BUTTON_CLASS,
  HEADER_PANE_ACTION_ICON_BUTTON_CLASS,
} from "@/components/layout/AppPageHeader";
import {
  getBbDesktopInfo,
  MACOS_WINDOW_NO_DRAG_CLASS,
  shouldUseMacosDesktopChrome,
} from "@/lib/bb-desktop";
import { cn } from "@bb/shared-ui/lib/utils";
import {
  useAppCommandHandler,
  useAppCommandShortcut,
} from "@/components/commands/AppCommandProvider";
import { useSidebarRename } from "@/components/sidebar/SidebarInlineRename";
import { useThreadActions } from "@/components/thread/ThreadActionsProvider";
import { ThreadTitle } from "@/components/thread/ThreadTitleMentions";
import { useThreadHeaderActionEntries } from "@/lib/thread-actions/thread-action-registry";
import { SecondaryPanelHostLayoutContext } from "@/components/secondary-panel/SecondaryPanelHostLayoutContext";
import {
  RIGHT_PANEL_TOGGLE_BUTTON_CLASS,
  RIGHT_PANEL_TOGGLE_ICON_NAME,
  RIGHT_PANEL_TOGGLE_SHORTCUT_HINT_CLASS,
} from "@/components/secondary-panel/panelToggleControlState";
import { AppCommandShortcutHint } from "@/components/commands/AppCommandShortcutHint";
import { CHROME_SUBTLE_ICON_BUTTON_FOREGROUND_CLASS } from "@bb/shared-ui/chrome-style-tokens";
import { useIsCompactViewport } from "@bb/shared-ui/hooks/use-compact-viewport";
import { dimInactiveSplitsAtom } from "@/lib/split-layout/atoms";
import {
  CONTEXT_INACTIVE_TEXT_CLASS,
  CONTEXT_SELECTION_SURFACE_CLASS,
} from "@bb/shared-ui/context-selection";
import { useRootComposePinnedPanelToggleBoxClassName } from "@/views/RootComposeSecondaryContent";
import { usePaneContext } from "./PaneContext";
import { PaneMaximizeButton } from "./PaneMaximizeButton";
import { PaneDragHandle } from "./PaneDragHandle";
import {
  useOpenParentThread,
  type ParentThreadSection,
} from "./useParentThreadSection";

const THREAD_HEADER_ACTION_BUTTON_CLASS = cn(
  COARSE_POINTER_TOOLBAR_ACTION_BUTTON_CLASS,
  "border-border/70 bg-transparent font-normal hover:bg-state-hover",
);
const NARROW_SPLIT_HEADER_MAX_WIDTH = 560;

export interface ThreadDetailHeaderActionsMenuArgs {
  includeResponsiveActions: boolean;
  headerActions: readonly PluginThreadActionEntry[];
  requestRename: (threadId: string) => void;
  onCloseAutoFocus: (event: Event) => void;
}

interface ThreadDetailHeaderProps {
  actionsMenu: ((args: ThreadDetailHeaderActionsMenuArgs) => ReactNode) | null;
  contextCardButton?: ReactNode;
  isSecondaryPanelOpen: boolean;
  onClosePane?: () => void;
  onToggleSecondaryPanel: () => void;
  parentThread?: ParentThreadSection | null;
  pluginActions?: ReactNode;
  thread: PluginThreadActionTarget;
  threadTitle: string;
}

export function ThreadDetailHeader({
  actionsMenu,
  isSecondaryPanelOpen,
  onClosePane,
  onToggleSecondaryPanel,
  parentThread = null,
  pluginActions,
  thread,
  threadTitle,
  contextCardButton,
}: ThreadDetailHeaderProps) {
  const isCompactViewport = useIsCompactViewport();
  const threadId = thread.id;
  const threadDot = useThreadDot(threadId);
  const headerActions = useThreadHeaderActionEntries(thread);
  const [primaryAction, ...secondaryActions] = headerActions;
  const { renameThreadAsync } = useThreadActions();
  const handleRename = useCallback(
    (nextTitle: string) => renameThreadAsync(threadId, nextTitle),
    [renameThreadAsync, threadId],
  );
  const {
    editor,
    isEditing,
    startEditing,
    startEditingFromDoubleClick,
    startEditingFromMenu,
    onCloseAutoFocus,
  } = useSidebarRename({
    kind: "thread",
    id: threadId,
    name: threadTitle,
    label: "Thread name",
    onSave: handleRename,
  });
  const [desktopInfo] = useState(getBbDesktopInfo);
  const dimsInactiveSplits = useAtomValue(dimInactiveSplitsAtom);
  const panelShortcut = useAppCommandShortcut("panel.toggle");
  const usesDesktopChrome = shouldUseMacosDesktopChrome(desktopInfo);
  const headerRef = useRef<HTMLElement>(null!);
  const {
    beginPaneDrag,
    isFocused,
    isSplitPane,
    reservesWindowPanelToggle,
    secondaryPanelHost,
  } = usePaneContext();
  const pageToggleBoxClassName = useRootComposePinnedPanelToggleBoxClassName();
  useAppCommandHandler("thread.rename", () => {
    if (!isFocused) return false;
    startEditing();
    return true;
  });
  const hostLayout = useContext(SecondaryPanelHostLayoutContext);
  const isWindowPanelOpen = hostLayout?.isOpen === true;
  const pressedWhileUnfocusedRef = useRef(false);
  const isSplitPaneHeader = beginPaneDrag !== undefined;
  const [measuredPaneWidth, setMeasuredPaneWidth] = useState(0);
  const usesResponsiveActionOverflow =
    isCompactViewport ||
    (isSplitPaneHeader &&
      measuredPaneWidth > 0 &&
      measuredPaneWidth < NARROW_SPLIT_HEADER_MAX_WIDTH);
  useLayoutEffect(() => {
    if (!isSplitPaneHeader) {
      return;
    }

    const header = headerRef.current;
    const pane = header.closest<HTMLElement>("[data-split-pane-id]");
    const measuredElement = pane ?? header;
    const measure = () => {
      const width = measuredElement.getBoundingClientRect().width;
      if (width > 0) {
        setMeasuredPaneWidth(width);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(measuredElement);
    return () => {
      observer.disconnect();
    };
  }, [isSplitPaneHeader]);
  const handleTitlePointerDown = (event: ReactPointerEvent) => {
    if (isEditing || !beginPaneDrag || event.button !== 0) {
      return;
    }
    beginPaneDrag(event, threadTitle);
  };
  const handleTitleDoubleClick = () => {
    if (!isEditing) startEditingFromDoubleClick();
  };
  const rightPanelIconName = RIGHT_PANEL_TOGGLE_ICON_NAME;
  const isHostedSplitPane = secondaryPanelHost !== null;
  const pinsToggleToPage = !isSplitPane && !isCompactViewport;
  const showRightPanelToggle = isHostedSplitPane
    ? hostLayout?.isSuppressed !== true
    : !isSecondaryPanelOpen || isCompactViewport;
  const isRightPanelOpen = isHostedSplitPane
    ? isFocused && isWindowPanelOpen
    : isSecondaryPanelOpen;
  const rightPanelLabel =
    isRightPanelOpen && showRightPanelToggle
      ? "Hide right panel"
      : "Show right panel";
  const handleRightPanelTogglePointerDown = () => {
    preloadThreadSecondaryPanel();
    pressedWhileUnfocusedRef.current = !isFocused;
  };
  const handleRightPanelToggleClick = () => {
    const focusShowsPanel =
      isHostedSplitPane &&
      pressedWhileUnfocusedRef.current &&
      isWindowPanelOpen;
    pressedWhileUnfocusedRef.current = false;
    if (!focusShowsPanel) onToggleSecondaryPanel();
  };

  const rightPanelToggle = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        RIGHT_PANEL_TOGGLE_BUTTON_CLASS,
        "relative",
        usesDesktopChrome && MACOS_WINDOW_NO_DRAG_CLASS,
        !showRightPanelToggle && "hidden",
      )}
      inert={!showRightPanelToggle}
      aria-label={
        panelShortcut
          ? `${rightPanelLabel} (${panelShortcut.label})`
          : rightPanelLabel
      }
      aria-keyshortcuts={panelShortcut?.ariaKeyshortcuts}
      aria-expanded={isRightPanelOpen}
      onPointerEnter={preloadThreadSecondaryPanel}
      onFocus={preloadThreadSecondaryPanel}
      onPointerDown={handleRightPanelTogglePointerDown}
      onClick={handleRightPanelToggleClick}
    >
      <Icon name={rightPanelIconName} />
      <AppCommandShortcutHint
        shortcut={panelShortcut}
        className={RIGHT_PANEL_TOGGLE_SHORTCUT_HINT_CLASS}
      />
    </Button>
  );

  const center = (
    <>
      {parentThread?.isLoaded && !usesResponsiveActionOverflow ? (
        <ThreadParentLink
          parentThread={parentThread}
          usesDesktopChrome={usesDesktopChrome}
        />
      ) : null}
      <div
        data-pane-header-focus-tab={
          isSplitPaneHeader && isFocused ? "" : undefined
        }
        className={cn(
          "relative min-w-0",
          isSplitPaneHeader &&
            "-my-1 -ml-2 flex items-center rounded-md px-2 py-1",
          isSplitPaneHeader && isFocused && CONTEXT_SELECTION_SURFACE_CLASS,
        )}
      >
        {beginPaneDrag && !isEditing ? (
          <PaneDragHandle
            onPointerDown={handleTitlePointerDown}
            usesDesktopChrome={usesDesktopChrome}
          />
        ) : null}
        {isSplitPaneHeader && !isEditing ? (
          <ThreadStatusDot dot={threadDot} className="mr-1.5" />
        ) : null}
        <p
          className={cn(
            "relative min-w-0 text-sm font-normal transition-colors",
            isEditing && "overflow-visible",
            isSplitPaneHeader &&
              !isFocused &&
              dimsInactiveSplits &&
              CONTEXT_INACTIVE_TEXT_CLASS,
            usesDesktopChrome && MACOS_WINDOW_NO_DRAG_CLASS,
            beginPaneDrag && !isEditing && "cursor-grab touch-none select-none",
          )}
          onDoubleClick={handleTitleDoubleClick}
          onPointerDown={beginPaneDrag ? handleTitlePointerDown : undefined}
        >
          {isEditing ? editor : <ThreadTitle title={threadTitle} />}
        </p>
      </div>
      {actionsMenu == null ? null : (
        <span
          className={cn(
            "flex items-center",
            usesDesktopChrome && MACOS_WINDOW_NO_DRAG_CLASS,
          )}
        >
          {actionsMenu({
            includeResponsiveActions: usesResponsiveActionOverflow,
            headerActions,
            requestRename: startEditingFromMenu,
            onCloseAutoFocus,
          })}
        </span>
      )}
    </>
  );

  const actions = (
    <>
      <div
        className="flex items-center gap-1"
        data-thread-header-workflow-actions=""
      >
        {pluginActions}
        {!usesResponsiveActionOverflow && primaryAction ? (
          <span className="inline-flex" data-thread-header-responsive-action="">
            {secondaryActions.length > 0 ? (
              <SplitButton
                className={THREAD_HEADER_ACTION_BUTTON_CLASS}
                primaryAction={{
                  disabled: primaryAction.action.disabled,
                  label: primaryAction.action.label,
                  onSelect: () => void primaryAction.action.run(),
                }}
                secondaryActions={secondaryActions.map(({ key, action }) => ({
                  id: key,
                  disabled: action.disabled,
                  label: action.label,
                  onSelect: () => void action.run(),
                }))}
              />
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={THREAD_HEADER_ACTION_BUTTON_CLASS}
                disabled={primaryAction.action.disabled}
                onClick={() => void primaryAction.action.run()}
              >
                {primaryAction.action.label}
              </Button>
            )}
          </span>
        ) : null}
      </div>
      <div
        className="ml-1 flex items-center gap-0.5"
        data-thread-header-pane-actions=""
      >
        <PaneMaximizeButton />
        {onClosePane ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              HEADER_PANE_ACTION_ICON_BUTTON_CLASS,
              CHROME_SUBTLE_ICON_BUTTON_FOREGROUND_CLASS,
            )}
            aria-label="Close pane"
            onClick={onClosePane}
          >
            <Icon name="CloseThreadPane" />
          </Button>
        ) : null}
        {contextCardButton}
        {pinsToggleToPage
          ? createPortal(
              <div
                className={cn(
                  pageToggleBoxClassName,
                  "z-40",
                  usesDesktopChrome && MACOS_WINDOW_NO_DRAG_CLASS,
                )}
              >
                {rightPanelToggle}
              </div>,
              document.body,
            )
          : rightPanelToggle}
        {reservesWindowPanelToggle && !isWindowPanelOpen ? (
          <span aria-hidden className={HEADER_ICON_BUTTON_CLASS} />
        ) : null}
      </div>
    </>
  );

  return (
    <AppPageHeader
      headerRef={headerRef}
      center={center}
      actions={actions}
      isWindowDragRegion={false}
      ownsWindowTopLeft={false}
      className={cn(beginPaneDrag && "z-[21]")}
    />
  );
}

function ThreadParentLink({
  parentThread,
  usesDesktopChrome,
}: {
  parentThread: ParentThreadSection;
  usesDesktopChrome: boolean;
}) {
  const openParentThread = useOpenParentThread();
  const label =
    parentThread.relationship === "fork" ? "Forked from" : "Parent thread";
  const handleClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openParentThread(parentThread, event.metaKey || event.ctrlKey);
  };
  return (
    <a
      href={parentThread.href}
      data-thread-header-parent-link=""
      title={`${label}: ${parentThread.parentThreadTitle}`}
      onClick={handleClick}
      className={cn(
        "mr-1 flex min-w-0 max-w-48 shrink items-center gap-1 rounded-md px-1.5 py-0.5 text-sm text-muted-foreground hover:bg-state-hover hover:text-foreground",
        usesDesktopChrome && MACOS_WINDOW_NO_DRAG_CLASS,
      )}
    >
      <span aria-hidden>↑</span>
      <span className="sr-only">{label}: </span>
      <span className="min-w-0 truncate">
        <ThreadTitle title={parentThread.parentThreadTitle} />
      </span>
      <span aria-hidden className="ml-1 text-muted-foreground/60">
        /
      </span>
    </a>
  );
}
