// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createStore, Provider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeThreadWithRuntime } from "@bb/test-helpers/domain-fixtures";
import { threadQueryKey } from "@/hooks/queries/query-keys";
import { PluginContext } from "@/components/plugin/plugin-context";
import { useBbNavigate } from "@/lib/plugin-sdk-hooks";
import { splitLayoutAtom } from "@/lib/split-layout/atoms";
import { LocationProbe } from "@/test/location-probe";
import {
  PaneContext,
  type PaneContextValue,
} from "@/views/thread-detail/PaneContext";

const PARENT = { projectId: "proj_nav", threadId: "thr_parent" };

function OpenParent({ inPane }: { inPane: boolean }) {
  const navigate = useBbNavigate();
  return (
    <button
      type="button"
      onClick={() =>
        navigate.toThread(PARENT.threadId, { experimental_inPane: inPane })
      }
    >
      Open parent
    </button>
  );
}

function renderInPane({
  inPane,
  parentPaneOpen,
}: {
  inPane: boolean;
  parentPaneOpen: boolean;
}) {
  const client = new QueryClient();
  client.setQueryData(
    threadQueryKey(PARENT.threadId),
    makeThreadWithRuntime({ id: PARENT.threadId, projectId: PARENT.projectId }),
  );
  const store = createStore();
  store.set(splitLayoutAtom, {
    root: {
      type: "split",
      dir: "row",
      sizes: [0.5, 0.5],
      children: [
        {
          type: "pane",
          paneId: "pane-1",
          content: {
            kind: "thread",
            projectId: "proj_nav",
            threadId: "thr_child",
          },
        },
        {
          type: "pane",
          paneId: "pane-2",
          content: {
            kind: "thread",
            projectId: "proj_nav",
            threadId: parentPaneOpen ? PARENT.threadId : "thr_other",
          },
        },
      ],
    },
    focusedPaneId: "pane-1",
  });
  const navigateInPane = vi.fn();
  const pane = {
    paneId: "pane-1",
    navigateInPane,
  } as unknown as PaneContextValue;
  render(
    <QueryClientProvider client={client}>
      <Provider store={store}>
        <MemoryRouter initialEntries={["/projects/proj_nav/threads/thr_child"]}>
          <PluginContext.Provider value="parent-link">
            <PaneContext.Provider value={pane}>
              <OpenParent inPane={inPane} />
            </PaneContext.Provider>
          </PluginContext.Provider>
          <LocationProbe />
        </MemoryRouter>
      </Provider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open parent" }));
  return {
    navigateInPane,
    location: screen.getByTestId("location").textContent,
  };
}

afterEach(() => {
  cleanup();
});

describe("useBbNavigate().toThread experimental_inPane", () => {
  it("replaces the caller's pane", () => {
    const { navigateInPane, location } = renderInPane({
      inPane: true,
      parentPaneOpen: false,
    });

    expect(navigateInPane).toHaveBeenCalledWith(PARENT);
    expect(location).toBe("/projects/proj_nav/threads/thr_child");
  });

  it("routes to the pane that already shows the thread", () => {
    const { navigateInPane, location } = renderInPane({
      inPane: true,
      parentPaneOpen: true,
    });

    expect(navigateInPane).not.toHaveBeenCalled();
    expect(location).toBe("/projects/proj_nav/threads/thr_parent");
  });

  it("leaves the pane alone without the option", () => {
    const { navigateInPane } = renderInPane({
      inPane: false,
      parentPaneOpen: false,
    });

    expect(navigateInPane).not.toHaveBeenCalled();
  });
});
