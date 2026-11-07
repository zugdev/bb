// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { asking, makeProject, makeThread, PERSONAL, WEB } from "./fixtures";
import {
  DEFAULT_HOME_THREAD_FILTER,
  NEEDS_YOU_LIMIT,
  RECENT_PROJECT_LIMIT,
} from "./home-overview";
import {
  NewThreadOverview,
  type NewThreadOverviewProps,
} from "./NewThreadOverview";

beforeAll(installTestPluginRuntime);
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
      order={{
        sort: "message",
        setSort: () => undefined,
        isOldestFirst: false,
        setIsOldestFirst: () => undefined,
      }}
      filter={DEFAULT_HOME_THREAD_FILTER}
      setFilter={() => undefined}
      showArchived={false}
      onArchiveThreads={() => Promise.resolve()}
      pullRequests={[]}
      onSelectPullRequest={() => undefined}
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
    expect(screen.queryByRole("heading", { name: "Needs you" })).toBeNull();
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
      .filter(
        (button) =>
          button.hasAttribute("aria-pressed") &&
          button.closest('[aria-label="Thread filters"]') === null,
      );
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

  it("lists every project's threads, latest project first, when no project is picked", () => {
    renderOverview({
      projects: [PERSONAL, WEB, makeProject("api"), makeProject("empty")],
      threads: [
        makeThread({ id: "web-old", experimental_lastUserMessageAt: 10 }),
        makeThread({
          id: "api-new",
          projectId: "api",
          experimental_lastUserMessageAt: 40,
        }),
        makeThread({
          id: "mine",
          projectId: PERSONAL.id,
          experimental_lastUserMessageAt: 20,
        }),
      ],
    });
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["api", PERSONAL.name, WEB.name]);
    expect(rowTitles(/^(web-old|api-new|mine)/)).toEqual([
      "api-new",
      "mine",
      "web-old",
    ]);
  });

  it("shows the selected project's waiting threads and then all of its threads by your last message", () => {
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
      "web-6",
      "web-5",
      "web-3",
      "web-2",
      "web-1",
    ]);
    expect(screen.queryByText("Nothing waiting")).toBeNull();
  });

  it("says nothing is waiting in a selected project with no pending threads", () => {
    renderOverview({
      threads: [asking("mine", 9, PERSONAL.id)],
      projectId: WEB.id,
    });
    expect(screen.getByRole("heading", { name: "Needs you" })).toBeTruthy();
    expect(screen.getByText("Nothing waiting")).toBeTruthy();
    expect(screen.queryByText("mine")).toBeNull();
    expect(screen.getByRole("button", { name: "New thread" })).toBeTruthy();
  });

  it("archives the idle threads older than the age filter", () => {
    const DAY = 86_400_000;
    const now = Date.now();
    const onArchiveThreads = vi.fn((_threads: readonly PluginSidebarThread[]) =>
      Promise.resolve(),
    );
    renderOverview({
      threads: [
        makeThread({ id: "stale", updatedAt: now - 10 * DAY }),
        makeThread({ id: "pinned", updatedAt: now - 10 * DAY, isPinned: true }),
        makeThread({
          id: "busy",
          updatedAt: now - 10 * DAY,
          status: "active",
          runtimeStatus: "active",
        }),
        makeThread({ id: "fresh", updatedAt: now - DAY }),
      ],
      filter: { status: "all", olderThanDays: 7 },
      onArchiveThreads,
    });
    expect(screen.queryByText("fresh")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Archive 1 idle" }));
    expect(onArchiveThreads.mock.calls[0]?.[0].map((t) => t.id)).toEqual([
      "stale",
    ]);
  });

  it("hides the filters without a setter and lists archived threads only when asked", () => {
    const threads = [
      makeThread({ id: "live" }),
      makeThread({ id: "gone", archivedAt: 1 }),
    ];
    renderOverview({ threads, setFilter: null });
    expect(screen.queryByRole("group", { name: "Thread filters" })).toBeNull();
    expect(screen.getByText("live")).toBeTruthy();
    expect(screen.queryByText("gone")).toBeNull();
    cleanup();

    renderOverview({ threads, showArchived: true });
    expect(screen.getByText("gone")).toBeTruthy();
  });

  it("lists the selected project's pull requests and selects one on click", () => {
    const pr = {
      number: 42,
      title: "Ship the overview",
      headRefName: "overview",
      isDraft: false,
      checks: "failing" as const,
      review: "pending" as const,
      url: "https://github.com/o/r/pull/1",
      worktreePath: null,
    };
    const onSelectPullRequest = vi.fn();
    renderOverview({
      projectId: WEB.id,
      pullRequests: [pr],
      onSelectPullRequest,
    });
    expect(screen.getByRole("img", { name: "Checks failed" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Awaiting review" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open #42 on GitHub" }).getAttribute("href"),
    ).toBe("https://github.com/o/r/pull/1");
    fireEvent.click(screen.getByRole("button", { name: /Ship the overview/u }));
    expect(onSelectPullRequest).toHaveBeenCalledWith(pr);
    cleanup();

    renderOverview({ projectId: null, pullRequests: [pr] });
    expect(screen.queryByText("Your pull requests")).toBeNull();
  });
});
