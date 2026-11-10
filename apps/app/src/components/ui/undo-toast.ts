import type { ReactNode } from "react";
import { appToast, type AppToastOptions } from "./app-toast";

interface UndoToastOptions extends Pick<
  AppToastOptions,
  "description" | "id"
> {
  undo: () => void;
}

interface UndoEntry {
  id: string | number;
  undo: () => void;
}

const UNDO_TOAST_DURATION_MS = 5000;

let latest: UndoEntry | null = null;

export function showUndoToast(
  title: ReactNode,
  { undo, ...options }: UndoToastOptions,
): void {
  const entry: UndoEntry = { id: "", undo };
  const forget = () => {
    if (latest === entry) latest = null;
  };
  entry.id = appToast.success(title, {
    ...options,
    duration: UNDO_TOAST_DURATION_MS,
    cancel: {
      label: "Undo",
      onClick: () => {
        forget();
        undo();
      },
    },
    onAutoClose: forget,
    onDismiss: forget,
  });
  latest = entry;
}

export function hasUndoToast(): boolean {
  return latest !== null;
}

export function undoLatestToast(): boolean {
  const entry = latest;
  if (entry === null) return false;
  latest = null;
  appToast.dismiss(entry.id);
  entry.undo();
  return true;
}
