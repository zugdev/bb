import {
  APP_SURFACE_DESKTOP,
  APP_SURFACE_HEADER_NAME,
  APP_SURFACE_WEB,
  CLIENT_ID_HEADER_NAME,
  parseClientId,
  type RequestAppSurface,
} from "@bb/config/app-surface";
import { isInsideNativeShell } from "@/lib/native-shell";

const APP_SURFACE_MOBILE: RequestAppSurface = "mobile";
const CLIENT_ID_STORAGE_KEY = "bb.client-id";

let memoryClientId: string | null = null;

export function getClientId(): string {
  try {
    const stored = parseClientId(localStorage.getItem(CLIENT_ID_STORAGE_KEY));
    if (stored !== undefined) return stored;
    const created = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, created);
    return created;
  } catch {
    memoryClientId ??= crypto.randomUUID();
    return memoryClientId;
  }
}

export function getAppSurface(): RequestAppSurface {
  if (typeof window !== "undefined" && window.bbDesktop !== undefined) {
    return APP_SURFACE_DESKTOP;
  }
  if (isInsideNativeShell()) {
    return APP_SURFACE_MOBILE;
  }
  return APP_SURFACE_WEB;
}

export function appSurfaceRequestInit(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set(APP_SURFACE_HEADER_NAME, getAppSurface());
  headers.set(CLIENT_ID_HEADER_NAME, getClientId());
  return {
    ...init,
    cache: init?.cache ?? "no-store",
    headers,
  };
}

export function fetchWithAppSurface(
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
): ReturnType<typeof fetch> {
  return fetch(input, appSurfaceRequestInit(init));
}
