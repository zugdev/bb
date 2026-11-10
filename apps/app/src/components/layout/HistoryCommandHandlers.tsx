import { useAppCommandHandler } from "@/components/commands/AppCommandProvider";
import { useCloseMobileSidebar } from "@/components/ui/sidebar.js";
import { hasUndoToast, undoLatestToast } from "@/components/ui/undo-toast";
import { useRouteStateHistoryNavigation } from "@/lib/app-route-history";
import { isEditableKeyboardTarget } from "@/lib/app-keybindings";

function hasEditableText(target: EventTarget | null): boolean {
  if (!isEditableKeyboardTarget(target) || !(target instanceof HTMLElement)) {
    return false;
  }
  const text =
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      ? target.value
      : target.innerText;
  return text.trim().length > 0;
}

export function HistoryCommandHandlers() {
  const { canGoBack, canGoForward, goBack, goForward } =
    useRouteStateHistoryNavigation();
  const closeOnMobile = useCloseMobileSidebar();

  useAppCommandHandler(
    "history.back",
    () => {
      goBack(closeOnMobile);
      return true;
    },
    0,
    true,
    () => canGoBack,
  );
  useAppCommandHandler(
    "history.forward",
    () => {
      goForward(closeOnMobile);
      return true;
    },
    0,
    true,
    () => canGoForward,
  );
  useAppCommandHandler(
    "thread.undo",
    ({ target }) => !hasEditableText(target) && undoLatestToast(),
    0,
    true,
    hasUndoToast,
  );

  return null;
}
