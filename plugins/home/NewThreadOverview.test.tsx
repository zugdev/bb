// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { asking, makeProject, makeThread, PERSONAL, WEB } from "./fixtures";
import { DEFAULT_HOME_THREAD_FILTER } from "./home-overview";
import {
  NewThreadOverview,
  ProjectChips,
  type NewThreadOverviewProps,
  type ProjectChipsProps,
} from "./NewThreadOverview";

beforeAll(installTestPluginRuntime);
afterEach(cleanup);

function renderOverview(
  props: Partial<NewThreadOverviewProps & ProjectChipsProps>,
) {
  const merged = {
    threads: [],
    projects: [PERSONAL, WEB],
    projectId: null,
    setProjectId: () => undefined,
    picker: <span>picker</span>,
    cycleShortcutLabel: "⌥ O",
    order: {
      sort: "message" as const,
      setSort: () => undefined,
      isOldestFirst: false,
      setIsOldestFirst: () => undefined,
    },
    filter: DEFAULT_HOME_THREAD_FILTER,
    setFilter: () => undefined,
    showArchived: false,
    setShowArchived: () => undefined,
    onArchiveThreads: () => Promise.resolve(),
    pullRequests: [],
    pullRequestsExpanded: true,
    setPullRequestsExpanded: () => undefined,
    onSelectPullRequest: () => undefined,
    onOpenThread: () => undefined,
    ...props,
  };
  return render(
    <>
      <ProjectChips {...merged} />
      <NewThreadOverview {...merged} />
    </>,
  );
}

function rowTitles(pattern: RegExp): string[] {
  return screen
    .getAllByRole("button")
    .map((button) => pattern.exec(button.textContent ?? "")?.[1])
    .filter((title) => title !== undefined);
}

describe("NewThreadOverview", () => {
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
          button.textContent !== "Archived" &&
          button.closest('[aria-label="Thread filters"]') === null,
      );
    expect(chips.map((chip) => chip.textContent)).toEqual(
      ["No project", "newest", "recent", "mid", "older", "old", "never"],
    );
    expect(chips.map((chip) => chip.getAttribute("aria-pressed"))).toEqual([
      "false",
      "false",
      "false",
      "true",
      "false",
      "false",
      "false",
    ]);
    expect(screen.getByText("⌥ O")).toBeTruthy();
    fireEvent.click(chips[2]!);
    expect(setProjectId).toHaveBeenCalledWith("recent");
    fireEvent.click(chips[0]!);
    expect(setProjectId).toHaveBeenCalledWith(null);
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

  it("shows all of the selected project's threads by your last message", () => {
    const sent = (id: string, at: number): PluginSidebarThread =>
      makeThread({ id, experimental_lastUserMessageAt: at });
    renderOverview({
      threads: [
        asking("mine", 9, PERSONAL.id),
        sent("web-1", 10),
        sent("web-6", 60),
        sent("web-3", 30),
        sent("web-5", 50),
        sent("web-2", 20),
      ],
      projectId: WEB.id,
    });
    expect(rowTitles(/^(web-\d|mine)/)).toEqual([
      "web-6",
      "web-5",
      "web-3",
      "web-2",
      "web-1",
    ]);
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
    cleanup();

    const setShowArchived = vi.fn();
    renderOverview({ threads, setShowArchived });
    fireEvent.click(screen.getByRole("button", { name: "Archived" }));
    expect(setShowArchived).toHaveBeenCalledWith(true);
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
    cleanup();

    const setPullRequestsExpanded = vi.fn();
    renderOverview({
      projectId: WEB.id,
      pullRequests: null,
      pullRequestsExpanded: false,
      setPullRequestsExpanded,
    });
    expect(screen.queryByText("Loading…")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Your pull requests/u }));
    expect(setPullRequestsExpanded).toHaveBeenCalledWith(true);
  });
});
