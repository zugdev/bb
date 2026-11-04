import type { PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "@bb/shared-ui/icon";
import { CHROME_SUBTLE_ICON_BUTTON_FOREGROUND_CLASS } from "@bb/shared-ui/chrome-style-tokens";
import { cn } from "@bb/shared-ui/lib/utils";
import { MACOS_WINDOW_NO_DRAG_CLASS } from "@/lib/bb-desktop";

export function PaneDragHandle({
  onPointerDown,
  usesDesktopChrome,
}: {
  onPointerDown?: (event: ReactPointerEvent) => void;
  usesDesktopChrome: boolean;
}) {
  return (
    <span
      aria-hidden
      data-pane-drag-handle=""
      className={cn(
        "-ml-1 mr-1 flex shrink-0 cursor-grab touch-none items-center select-none active:cursor-grabbing",
        CHROME_SUBTLE_ICON_BUTTON_FOREGROUND_CLASS,
        usesDesktopChrome && MACOS_WINDOW_NO_DRAG_CLASS,
      )}
      onPointerDown={onPointerDown}
    >
      <Icon name="DragDropVertical" className="size-3.5" />
    </span>
  );
}
