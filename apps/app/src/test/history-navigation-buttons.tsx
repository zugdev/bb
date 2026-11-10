import { useRouteStateHistoryNavigation } from "@/lib/app-route-history";

export function HistoryNavigationButtons() {
  const { canGoBack, canGoForward, goBack, goForward } =
    useRouteStateHistoryNavigation();
  return (
    <>
      <button
        type="button"
        aria-disabled={!canGoBack || undefined}
        onClick={() => canGoBack && goBack()}
      >
        Go back
      </button>
      <button
        type="button"
        aria-disabled={!canGoForward || undefined}
        onClick={() => canGoForward && goForward()}
      >
        Go forward
      </button>
    </>
  );
}
