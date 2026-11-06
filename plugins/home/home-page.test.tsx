// @vitest-environment jsdom

import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { HOME_LAYOUT_KEY } from "./app";
import { asking, makeProject, makeThread, PERSONAL, WEB } from "./fixtures";

const app = await loadPluginApp(() => import("./app"));
const panel = app.navPanels.find((candidate) => candidate.id === "home");
if (panel === undefined) throw new Error("Home panel not registered");

const API = {
  ...makeProject("proj_api", "Api"),
  experimental_gitRemoteUrl: "git@github.com:zugdev/api.git",
};
const ASSISTANT = {
  pluginId: "assistant",
  id: "assistant",
  title: "Assistant",
  experimental_placement: null,
};
const OVERVIEW = {
  pluginId: "home",
  id: "new-thread-overview",
  title: "New thread overview",
  experimental_placement: "lead" as const,
};

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

function renderHome(
  options: {
    open?: () => void;
    openSearch?: (anchor: HTMLElement | null) => void;
  } = {},
) {
  return renderSlot(
    panel!,
    { subPath: "" },
    {
      pluginId: "home",
      sidebarThreads: {
        threads: [
          asking("ask-web", 5),
          makeThread({
            id: "sent-api",
            projectId: API.id,
            experimental_lastUserMessageAt: 20,
          }),
        ],
        projects: [WEB, API, PERSONAL],
      },
      homepageSections: [OVERVIEW, ASSISTANT],
      experimental_addProject: { open: options.open ?? (() => undefined) },
      experimental_threadSearch: {
        shortcut: { label: "⌘ K", ariaKeyshortcuts: "Meta+K" },
        open: options.openSearch ?? (() => undefined),
      },
    },
  );
}

function sectionHeadings(): string[] {
  return screen
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent ?? "");
}

describe("Home page", () => {
  it("pins Home as the first pane tab", () => {
    expect(panel.experimental_pinnedTab).toBe(true);
    expect(panel.title).toBe("Home");
    expect(panel.icon).toBe("Home");
  });

  it("shows Needs you, other plugins' titled sections and every project, personal first", () => {
    renderHome();
    expect(sectionHeadings()).toEqual([
      "Needs you1",
      "Latest replies",
      "Assistant",
      "Personal",
      "Web",
      "Api",
    ]);
    expect(screen.queryByText("New thread overview")).toBeNull();
    expect(
      screen
        .getAllByRole("link", { name: "Open repository" })
        .map((link) => link.getAttribute("href")),
    ).toEqual(["https://github.com/zugdev/api"]);
  });

  it("opens threads and new threads in tabs, and runs bb's search and Add project", () => {
    const open = vi.fn();
    const openSearch = vi.fn();
    const view = renderHome({ open, openSearch });
    fireEvent.click(screen.getAllByRole("button", { name: /ask-web/ })[0]!);
    const web = screen
      .getByRole("heading", { name: "Web" })
      .closest("section")!;
    fireEvent.click(within(web).getByRole("button", { name: "New thread" }));
    expect(view.navigateCalls).toEqual([
      {
        method: "toThread",
        threadId: "ask-web",
        options: { experimental_tab: true },
      },
      {
        method: "toCompose",
        options: { projectId: WEB.id, experimental_tab: true },
      },
    ]);
    const search = screen.getByRole("button", { name: /Search threads/ });
    expect(search.textContent).toContain("⌘ K");
    fireEvent.click(search);
    expect(openSearch).toHaveBeenCalledWith(search);
    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("reads and writes the saved layout under bb.home.layout", () => {
    window.localStorage.setItem(
      HOME_LAYOUT_KEY,
      JSON.stringify({
        order: ["project:proj_api", "plugin:assistant/assistant", "attention"],
        hidden: [],
      }),
    );
    renderHome();
    expect(sectionHeadings().slice(0, 2)).toEqual(["Api", "Assistant"]);
    fireEvent.click(screen.getByRole("button", { name: "Edit Home" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide Assistant" }));
    expect(JSON.parse(window.localStorage.getItem(HOME_LAYOUT_KEY)!)).toEqual({
      order: [
        "project:proj_api",
        "plugin:assistant/assistant",
        "attention",
        "project:proj_personal",
        "project:proj_web",
      ],
      hidden: ["plugin:assistant/assistant"],
    });
  });
});
