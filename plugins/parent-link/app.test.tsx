// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BbNavigate,
  ExperimentalPanelController,
  PluginBrowserBbSdk,
  PluginSidebarThread,
  PluginThreadActionTarget,
} from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { ParentThreadLink } from "./app.js";
import {
  findParentLink,
  getNarrowHeaders,
  markHeaderNarrow,
} from "./parent.js";

function sidebarThread(
  overrides: Partial<PluginSidebarThread> & { id: string },
): PluginSidebarThread {
  return {
    projectId: "proj_a",
    title: null,
    titleFallback: null,
    displayTitle: overrides.id,
    parentThreadId: null,
    lifecycleOwnerThreadId: null,
    parentNotifications: "auto",
    sourceThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "claude-code",
    status: "idle",
    runtimeStatus: "idle",
    queuedWork: "none",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    pinnedAt: null,
    pinSortKey: null,
    isArchived: false,
    archivedAt: null,
    href: `/projects/${overrides.projectId ?? "proj_a"}/threads/${overrides.id}`,
    isHidden: false,
    environment: null,
    host: null,
    createdAt: 0,
    updatedAt: 0,
    lastReadAt: null,
    latestAttentionAt: 0,
    ...overrides,
  };
}

const PARENT = sidebarThread({
  id: "thr_parent",
  title: "Orchestrator",
  displayTitle: "Orchestrator",
});
const CHILD = sidebarThread({ id: "thr_child", parentThreadId: "thr_parent" });

function renderLink(
  threads: readonly PluginSidebarThread[],
  isNarrow = false,
  threadId = CHILD.id,
) {
  return renderSlot(
    { component: ParentThreadLink },
    { threadId, isNarrow },
    { sidebarThreads: { status: "ready", threads } },
  );
}

afterEach(() => {
  cleanup();
});

describe("ParentThreadLink", () => {
  it("opens the parent in the header's pane on click", () => {
    const slot = renderLink([PARENT, CHILD]);

    fireEvent.click(screen.getByRole("link", { name: /Orchestrator/ }));

    expect(slot.navigateCalls).toEqual([
      {
        method: "toThread",
        threadId: "thr_parent",
        options: { experimental_inPane: true },
      },
    ]);
  });

  it.each([{ metaKey: true }, { ctrlKey: true }])(
    "opens the parent in a new tab on %o click",
    (modifier) => {
      const slot = renderLink([PARENT, CHILD]);

      fireEvent.click(
        screen.getByRole("link", { name: /Orchestrator/ }),
        modifier,
      );

      expect(slot.navigateCalls).toEqual([
        {
          method: "toThread",
          threadId: "thr_parent",
          options: { experimental_tab: true },
        },
      ]);
    },
  );

  it("links to the parent route", () => {
    renderLink([PARENT, CHILD]);

    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "/projects/proj_a/threads/thr_parent",
    );
  });

  it("waits for the parent thread to load", () => {
    renderLink([CHILD]);

    expect(screen.queryByRole("link")).toBeNull();
  });

  it("leaves the parent link to the thread menu in a narrow header", () => {
    renderLink([PARENT, CHILD], true);

    expect(screen.queryByRole("link")).toBeNull();
    expect(getNarrowHeaders().has(CHILD.id)).toBe(true);
    cleanup();
    expect(getNarrowHeaders().has(CHILD.id)).toBe(false);
  });
});

describe("findParentLink", () => {
  it("keeps the link on an archived child", () => {
    expect(
      findParentLink([PARENT, { ...CHILD, isArchived: true }], CHILD.id)
        ?.threadId,
    ).toBe("thr_parent");
  });

  it("hides archived parents", () => {
    expect(
      findParentLink([{ ...PARENT, isArchived: true }, CHILD], CHILD.id),
    ).toBeNull();
  });

  it("labels a fork with its source and hides a source in another project", () => {
    const source = sidebarThread({ id: "thr_source", displayTitle: "Source" });
    const fork = sidebarThread({
      id: "thr_fork",
      originKind: "fork",
      parentThreadId: "thr_source",
      sourceThreadId: "thr_source",
    });

    expect(findParentLink([source, fork], fork.id)?.relationship).toBe("fork");
    expect(
      findParentLink([{ ...source, projectId: "proj_b" }, fork], fork.id),
    ).toBeNull();
  });
});

describe("Go to parent header action", () => {
  async function headerAction() {
    const app = await loadPluginApp(() => import("./app.js"));
    const action = app.threadActions.find(
      (registration) => registration.id === "go-to-parent",
    );
    if (action === undefined) throw new Error("go-to-parent is not registered");
    return action;
  }

  function itemInput(narrowHeaders: ReturnType<typeof getNarrowHeaders>) {
    const thread: PluginThreadActionTarget = {
      id: CHILD.id,
      projectId: "proj_a",
      parentThreadId: "thr_parent",
      parentNotifications: "auto",
      archivedAt: null,
      pinnedAt: null,
      sectionId: null,
      isUnread: false,
      status: "idle",
      environment: null,
    };
    return {
      thread,
      data: { threads: [PARENT, CHILD], narrowHeaders },
      sdk: {} as PluginBrowserBbSdk,
      navigate: {} as BbNavigate,
      experimental_panel: {} as ExperimentalPanelController,
    };
  }

  it("shows only while the thread's header is narrow", async () => {
    const action = await headerAction();

    expect(action.placement).toBe("header");
    expect(action.item(itemInput(new Map()))).toBeNull();
  });

  it("opens the parent from the narrow header menu", async () => {
    const action = await headerAction();
    const toThread = vi.fn();
    const release = markHeaderNarrow(CHILD.id, {
      toThread,
    } as unknown as BbNavigate);
    const item = action.item(itemInput(getNarrowHeaders()));
    release();

    expect(item?.label).toBe("Go to parent: Orchestrator");
    void item?.run({} as never);
    expect(toThread).toHaveBeenCalledWith("thr_parent", {
      experimental_inPane: true,
    });
  });
});
