// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginComposerApi } from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { cycleProjectFromComposer } from "./app";
import { asking, makeProject, makeThread, PERSONAL, WEB } from "./fixtures";

afterEach(cleanup);

const app = await loadPluginApp(() => import("./app"));
const section = app.homepageSections[0];
if (section === undefined) throw new Error("overview section not registered");

const API = makeProject("proj_api", "Api");
const THREADS = [
  asking("ask-web", 5),
  makeThread({
    id: "sent-api",
    projectId: API.id,
    experimental_lastUserMessageAt: 20,
  }),
  makeThread({
    id: "sent-web",
    projectId: WEB.id,
    experimental_lastUserMessageAt: 10,
  }),
];

function renderSection(
  setProjectId: ((projectId: string | null) => void) | null,
  projectId: string | null = null,
) {
  return renderSlot(
    section!,
    { projectId, experimental_setProjectId: setProjectId },
    {
      pluginId: "home",
      sidebarThreads: { threads: THREADS, projects: [PERSONAL, WEB, API] },
      commandShortcuts: {
        "cycle-project": { label: "⌥ O", ariaKeyshortcuts: "Alt+O" },
      },
    },
  );
}

function newThreadComposer(): PluginComposerApi {
  return {
    scope: { kind: "new-thread", projectId: null },
  } as PluginComposerApi;
}

describe("home plugin", () => {
  it("registers the overview as the lead section", () => {
    expect(section.experimental_placement).toBe("lead");
  });

  it("opens a thread in the pane, or in a new tab with Cmd or Ctrl", () => {
    const view = renderSection(() => undefined);
    const row = screen.getByRole("button", { name: /ask-web/ });
    fireEvent.click(row);
    fireEvent.click(row, { metaKey: true });
    expect(view.navigateCalls).toEqual([
      { method: "toThread", threadId: "ask-web", options: undefined },
      {
        method: "toThread",
        threadId: "ask-web",
        options: { experimental_tab: true },
      },
    ]);
  });

  it("changes the composer's project from the picker and the chips", () => {
    const setProjectId = vi.fn();
    renderSection(setProjectId, WEB.id);
    fireEvent.change(screen.getByRole("combobox", { name: "Project" }), {
      target: { value: "" },
    });
    expect(setProjectId).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "Api" }));
    expect(setProjectId).toHaveBeenLastCalledWith(API.id);
    expect(screen.getByText("⌥ O")).toBeTruthy();
  });

  it("disables the picker while the composer can't change project", () => {
    renderSection(null);
    expect(
      screen.getByRole("combobox", { name: "Project" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("cycles No project and the recent projects from a New thread composer", () => {
    const setProjectId = vi.fn();
    const view = renderSection(setProjectId, API.id);
    cycleProjectFromComposer(newThreadComposer());
    expect(setProjectId).toHaveBeenLastCalledWith(WEB.id);
    view.unmount();
    cycleProjectFromComposer(newThreadComposer());
    expect(setProjectId).toHaveBeenCalledTimes(1);
  });

  it("leaves the project alone from a thread composer or a hidden tab", () => {
    const setProjectId = vi.fn();
    const view = renderSection(setProjectId);
    cycleProjectFromComposer({
      scope: { kind: "thread", threadId: "thr_1" },
    } as PluginComposerApi);
    view.container.setAttribute("inert", "");
    cycleProjectFromComposer(newThreadComposer());
    expect(setProjectId).not.toHaveBeenCalled();
  });
});
