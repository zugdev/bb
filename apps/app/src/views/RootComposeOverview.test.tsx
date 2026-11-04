// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeThreadListEntry } from "@bb/test-helpers/domain-fixtures";
import {
  ROOT_COMPOSE_NEEDS_YOU_LIMIT,
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
          personalProject: { threads: [asking("ask-1", 1)] },
          projects: [
            {
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
    );
  });

  it("hides Needs you when nothing waits on you", () => {
    render(
      <RootComposeOverview
        sidebarNavigation={{ personalProject: { threads: [] }, projects: [] }}
        projectNamesById={new Map()}
        project={PROJECT}
        onOpenThread={() => undefined}
      />,
    );
    expect(screen.queryByText("Needs you")).toBeNull();
  });
});
