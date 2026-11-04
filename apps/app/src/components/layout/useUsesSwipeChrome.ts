import { useState } from "react";
import { useIsCompactViewport } from "@bb/shared-ui/hooks/use-compact-viewport";
import {
  getBbDesktopInfo,
  shouldUseMacosDesktopChrome,
} from "@/lib/bb-desktop";

export function usesSwipeChrome({
  isCompactViewport,
  usesDesktopChrome,
}: {
  isCompactViewport: boolean;
  usesDesktopChrome: boolean;
}): boolean {
  return isCompactViewport && !usesDesktopChrome;
}

export function useUsesSwipeChrome(): boolean {
  const isCompactViewport = useIsCompactViewport();
  const [desktopInfo] = useState(getBbDesktopInfo);
  return usesSwipeChrome({
    isCompactViewport,
    usesDesktopChrome: shouldUseMacosDesktopChrome(desktopInfo),
  });
}
