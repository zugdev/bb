import { describe, expect, it, vi } from "vitest";
import { appToast } from "./app-toast";
import { hasUndoToast, showUndoToast, undoLatestToast } from "./undo-toast";

vi.mock("./app-toast", () => ({
  appToast: { success: vi.fn(() => "toast-1"), dismiss: vi.fn() },
}));

function lastToastOptions() {
  const options = vi.mocked(appToast.success).mock.lastCall?.[1];
  if (options === undefined) throw new Error("Expected an undo toast");
  return options;
}

describe("undo toast", () => {
  it("undoes the latest toast once and only while it is visible", () => {
    const first = vi.fn();
    const second = vi.fn();
    showUndoToast("Thread archived", { undo: first });
    lastToastOptions().onAutoClose?.({ id: "toast-1" });
    expect(hasUndoToast()).toBe(false);
    expect(undoLatestToast()).toBe(false);

    showUndoToast("Thread snoozed", { undo: second });
    expect(lastToastOptions().duration).toBe(5000);
    expect(undoLatestToast()).toBe(true);
    expect(appToast.dismiss).toHaveBeenCalledWith("toast-1");
    expect(undoLatestToast()).toBe(false);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
