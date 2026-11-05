// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { asking, makeProject, makeThread, PERSONAL, WEB } from "./fixtures";
import {
  NEEDS_YOU_LIMIT,
  PROJECT_THREAD_LIMIT,
  RECENT_PROJECT_LIMIT,
} from "./home-overview";
import {
  NewThreadOverview,
  type NewThreadOverviewProps,
} from "./NewThreadOverview";

afterEach(cleanup);

function renderOverview(props: Partial<NewThreadOverviewProps>) {
  return render(
    <NewThreadOverview
      threads={[]}
      projects={[PERSONAL, WEB]}
      projectId={null}
      setProjectId={() => undefined}
      picker={<span>picker</span>}
      cycleShortcutLabel="⌥ O"
      onOpenThread={() => undefined}
      {...props}
    />,
  );
}

function rowTitles(pattern: RegExp): string[] {
  return screen
    .getAllByRole("button")
    .map((button) => pattern.exec(button.textContent ?? "")?.[1])
    .filter((title) => title !== undefined);
}

describe("NewThreadOverview", () => {
  it("lists the threads that need you, newest first, capped, and opens one", () => {
    const onOpenThread = vi.fn();
    renderOverview({
      threads: [
        asking("ask-1", 1, PERSONAL.id),
        asking("ask-2", 2),
        asking("ask-3", 3),
        asking("ask-4", 4),
        makeThread({ id: "quiet", latestAttentionAt: 9 }),
      ],
      onOpenThread,
    });
    const rows = screen
      .getAllByRole("button")
      .filter((button) => button.textContent?.startsWith("ask-"));
    expect(rows).toHaveLength(NEEDS_YOU_LIMIT);
    expect(rows[0]?.textContent).toContain("ask-4");
    expect(rows[0]?.textContent).toContain("Web");
    fireEvent.click(rows[0]!);
    expect(onOpenThread).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ask-4" }),
      { newTab: false },
    );
    fireEvent.click(rows[1]!, { metaKey: true });
    expect(onOpenThread).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "ask-3" }),
      { newTab: true },
    );
    fireEvent.click(rows[2]!, { ctrlKey: true });
    expect(onOpenThread).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "ask-2" }),
      { newTab: true },
    );
  });

  it("hides Needs you when nothing waits on you", () => {
    renderOverview({});
    expect(screen.queryByText("Needs you")).toBeNull();
  });

  it("offers the most recently messaged projects as chips that pick the project", () => {
    const setProjectId = vi.fn();
    const sent = (projectId: string, at: number | null) =>
      makeThread({
        id: `thr-${projectId}`,
        projectId,
        experimental_lastUserMessageAt: at,
      });
    renderOverview({
      projects: [
        PERSONAL,
        ...["old", "never", "newest", "mid", "recent", "older"].map((id) =>
          makeProject(id),
        ),
      ],
      threads: [
        sent(PERSONAL.id, 99),
        sent("old", 1),
        sent("never", null),
        sent("newest", 60),
        sent("mid", 30),
        sent("recent", 50),
        sent("older", 20),
      ],
      projectId: "mid",
      setProjectId,
    });
    const chips = screen
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("aria-pressed"));
    expect(chips.map((chip) => chip.textContent)).toEqual(
      ["newest", "recent", "mid", "older"].slice(0, RECENT_PROJECT_LIMIT),
    );
    expect(chips.map((chip) => chip.getAttribute("aria-pressed"))).toEqual([
      "false",
      "false",
      "true",
      "false",
    ]);
    expect(screen.getByText("⌥ O")).toBeTruthy();
    fireEvent.click(chips[1]!);
    expect(setProjectId).toHaveBeenCalledWith("recent");
  });

  it("disables the chips while the project can't change", () => {
    renderOverview({
      threads: [makeThread({ id: "t", experimental_lastUserMessageAt: 5 })],
      setProjectId: null,
    });
    const chip = screen.getByRole("button", { name: "Web" });
    expect(chip.hasAttribute("disabled")).toBe(true);
  });

  it("shows the selected project's waiting threads and its latest threads by your last message", () => {
    const sent = (id: string, at: number): PluginSidebarThread =>
      makeThread({ id, experimental_lastUserMessageAt: at });
    renderOverview({
      threads: [
        asking("mine", 9, PERSONAL.id),
        asking("web-ask", 1),
        sent("web-1", 10),
        sent("web-6", 60),
        sent("web-3", 30),
        sent("web-5", 50),
        sent("web-2", 20),
      ],
      projectId: WEB.id,
    });
    expect(rowTitles(/^(web-(?:ask|\d)|mine)/)).toEqual([
      "web-ask",
      ...["web-6", "web-5", "web-3", "web-2"].slice(0, PROJECT_THREAD_LIMIT),
    ]);
    expect(screen.queryByText("Nothing waiting")).toBeNull();
    expect(screen.getByText("Latest threads")).toBeTruthy();
  });

  it("says nothing is waiting in a selected project with no pending threads", () => {
    renderOverview({
      threads: [asking("mine", 9, PERSONAL.id)],
      projectId: WEB.id,
    });
    expect(screen.getByText("Needs you")).toBeTruthy();
    expect(screen.getByText("Nothing waiting")).toBeTruthy();
    expect(screen.queryByText("mine")).toBeNull();
    expect(screen.queryByText("Latest threads")).toBeNull();
  });
});
