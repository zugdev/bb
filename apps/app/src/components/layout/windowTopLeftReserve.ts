import {
  BROWSER_COLLAPSED_HEADER_RESERVE_CLASS,
  MACOS_COLLAPSED_TOP_LEFT_RESERVE_CLASS,
} from "@/lib/bb-desktop";
import { usesSwipeChrome } from "./useUsesSwipeChrome";

export function resolveWindowTopLeftReserveClassName({
  isCompactViewport,
  isSidebarShowing,
  ownsWindowTopLeft,
  reserveMacosTrafficLights,
  sidebarKeepsCollapsedRail,
  usesDesktopChrome,
}: {
  isCompactViewport: boolean;
  isSidebarShowing: boolean;
  ownsWindowTopLeft: boolean;
  reserveMacosTrafficLights: boolean;
  sidebarKeepsCollapsedRail: boolean;
  usesDesktopChrome: boolean;
}): string | null {
  if (usesSwipeChrome({ isCompactViewport, usesDesktopChrome })) {
    return null;
  }
  if (!ownsWindowTopLeft || (!isCompactViewport && isSidebarShowing)) {
    return null;
  }
  if (sidebarKeepsCollapsedRail) {
    return null;
  }
  return reserveMacosTrafficLights
    ? MACOS_COLLAPSED_TOP_LEFT_RESERVE_CLASS
    : BROWSER_COLLAPSED_HEADER_RESERVE_CLASS;
}
