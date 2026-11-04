// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  installTestPluginRuntime,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import { makePluginProject, makeSidebarThread } from "../model/fixtures.js";
import { preferencesReadyAtom } from "../preferences/preferences-sync.js";
import { sidebarOrganizationModeAtom } from "../preferences/atoms.js";

installTestPluginRuntime();
const { ProjectList } = await import("./ProjectList.js");
const { resetSidebarDataCacheForTest } =
  await import("../model/use-sidebar-data.js");

afterEach(() => {
  cleanup();
  resetSidebarDataCacheForTest();
});

function Harness({
  children,
  store,
}: {
  children: ReactNode;
  store: ReturnType<typeof createStore>;
}) {
  return (
    <TooltipProvider>
      <Provider store={store}>{children}</Provider>
    </TooltipProvider>
  );
}

describe("the personal project group in project mode", () => {
  it("shows with its New thread action while it has no threads", async () => {
    const store = createStore();
    store.set(preferencesReadyAtom(), true);
    store.set(sidebarOrganizationModeAtom, "project");
    const { inspection } = renderSlot(
      { component: Harness },
      { children: <ProjectList activeThreadId={null} />, store },
      {
        sidebarThreads: {
          threads: [makeSidebarThread({ id: "thr_alpha" })],
          projects: [
            makePluginProject(),
            makePluginProject({
              id: "proj_personal",
              name: "Personal",
              isPersonal: true,
            }),
          ],
        },
      },
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "New thread in Threads" }),
    );

    expect(inspection.navigateCalls).toContainEqual(
      expect.objectContaining({
        method: "toCompose",
        options: expect.objectContaining({ projectId: "proj_personal" }),
      }),
    );
  });
});
