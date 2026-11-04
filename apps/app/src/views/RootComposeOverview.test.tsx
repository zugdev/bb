// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeThreadListEntry } from "@bb/test-helpers/domain-fixtures";
import {
  ROOT_COMPOSE_NEEDS_YOU_LIMIT,
  ROOT_COMPOSE_PROJECT_THREAD_LIMIT,
  ROOT_COMPOSE_RECENT_PROJECT_LIMIT,
  RootComposeOverview,
} from "./RootComposeOverview";

afterEach(cleanup);

const PROJECT = {
  options: [{ id: "proj_web", name: "Web" }],
  value: null,
  onChange: () => undefined,
  createProject: { onCreate: () => undefined },
  disabled: false,
};

function asking(id: string, latestAttentionAt: number) {
  return makeThreadListEntry({
    id,
    title: id,
    projectId: "proj_web",
    hasPendingInteraction: true,
    latestAttentionAt,
  });
}

describe("RootComposeOverview", () => {
  it("lists the threads that need you, newest first, capped, and opens one", () => {
    const onOpenThread = vi.fn();
    render(
      <RootComposeOverview
        sidebarNavigation={{
          personalProject: { id: "proj_me", threads: [asking("ask-1", 1)] },
          projects: [
            {
              id: "proj_web",
              name: "Web",
              threads: [
                asking("ask-2", 2),
                asking("ask-3", 3),
                asking("ask-4", 4),
                makeThreadListEntry({ id: "quiet", latestAttentionAt: 9 }),
              ],
            },
          ],
        }}
        projectNamesById={new Map([["proj_web", "Web"]])}
        project={PROJECT}
        onOpenThread={onOpenThread}
        isFocusedPane
      />,
    );
    expect(
      screen.getByRole("button", { name: "Project: No project" }),
    ).toBeTruthy();
    const rows = screen
      .getAllByRole("button")
      .filter((button) => button.textContent?.startsWith("ask-"));
    expect(rows).toHaveLength(ROOT_COMPOSE_NEEDS_YOU_LIMIT);
    expect(rows[0]?.textContent).toContain("ask-4");
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
  });

  it("hides Needs you when nothing waits on you", () => {
    render(
      <RootComposeOverview
        sidebarNavigation={{
          personalProject: { id: "proj_me", threads: [] },
          projects: [],
        }}
        projectNamesById={new Map()}
        project={PROJECT}
        onOpenThread={() => undefined}
        isFocusedPane
      />,
    );
    expect(screen.queryByText("Needs you")).toBeNull();
  });

  it("offers the most recently messaged projects as chips that pick the project", () => {
    const onChange = vi.fn();
    const project = (id: string, lastUserMessageAt: number | null) => ({
      id,
      name: id,
      threads: [makeThreadListEntry({ id: `thr-${id}`, lastUserMessageAt })],
    });
    render(
      <RootComposeOverview
        sidebarNavigation={{
          personalProject: { id: "proj_me", threads: [] },
          projects: [
            project("old", 1),
            project("never", null),
            project("newest", 60),
            project("mid", 30),
            project("recent", 50),
            project("older", 20),
          ],
        }}
        projectNamesById={new Map()}
        project={{ ...PROJECT, value: "mid", onChange }}
        onOpenThread={() => undefined}
        isFocusedPane
      />,
    );
    const chips = screen
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("aria-pressed"));
    expect(chips.map((chip) => chip.textContent)).toEqual(
      ["newest", "recent", "mid", "older"].slice(
        0,
        ROOT_COMPOSE_RECENT_PROJECT_LIMIT,
      ),
    );
    expect(chips.map((chip) => chip.getAttribute("aria-pressed"))).toEqual([
      "false",
      "false",
      "true",
      "false",
    ]);
    fireEvent.click(chips[1]!);
    expect(onChange).toHaveBeenCalledWith("recent");
  });

  it("shows the selected project's waiting threads and its latest threads by your last message", () => {
    const onOpenThread = vi.fn();
    const sent = (id: string, lastUserMessageAt: number) =>
      makeThreadListEntry({
        id,
        title: id,
        projectId: "proj_web",
        lastUserMessageAt,
      });
    render(
      <RootComposeOverview
        sidebarNavigation={{
          personalProject: { id: "proj_me", threads: [asking("mine", 9)] },
          projects: [
            {
              id: "proj_web",
              name: "Web",
              threads: [
                asking("web-ask", 1),
                sent("web-1", 10),
                sent("web-6", 60),
                sent("web-3", 30),
                sent("web-5", 50),
                sent("web-2", 20),
              ],
            },
          ],
        }}
        projectNamesById={new Map([["proj_web", "Web"]])}
        project={{ ...PROJECT, value: "proj_web" }}
        onOpenThread={onOpenThread}
        isFocusedPane
      />,
    );
    const titles = screen
      .getAllByRole("button")
      .map((button) => button.textContent ?? "")
      .map((text) => /^(web-(?:ask|\d)|mine)/.exec(text)?.[1])
      .filter((title) => title !== undefined);
    expect(titles).toEqual([
      "web-ask",
      ...["web-6", "web-5", "web-3", "web-2"].slice(
        0,
        ROOT_COMPOSE_PROJECT_THREAD_LIMIT,
      ),
    ]);
    expect(screen.queryByText("Nothing waiting")).toBeNull();
    expect(screen.getByText("Latest threads")).toBeTruthy();
  });

  it("says nothing is waiting in a selected project with no pending threads", () => {
    render(
      <RootComposeOverview
        sidebarNavigation={{
          personalProject: { id: "proj_me", threads: [asking("mine", 9)] },
          projects: [{ id: "proj_web", name: "Web", threads: [] }],
        }}
        projectNamesById={new Map()}
        project={{ ...PROJECT, value: "proj_web" }}
        onOpenThread={() => undefined}
        isFocusedPane
      />,
    );
    expect(screen.getByText("Needs you")).toBeTruthy();
    expect(screen.getByText("Nothing waiting")).toBeTruthy();
    expect(screen.queryByText("mine")).toBeNull();
    expect(screen.queryByText("Latest threads")).toBeNull();
  });
});
