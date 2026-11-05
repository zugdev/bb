// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetPluginSlotStoreForTest,
  setPluginSlotRegistrations,
} from "@/lib/plugin-slots";
import { pinnedTabPanel } from "@/lib/pinned-tab";
import { PINNED_TAB_ROUTE_PATH } from "@/lib/route-paths";
import { makePluginRegistrationSet as registrationSet } from "@/test/fixtures/plugins";
import PinnedTabView from "./PinnedTabView";

vi.mock("./thread-detail/SplitTabBar", () => ({
  SplitTabBar: () => <div>tab bar</div>,
}));

vi.mock("@/lib/plugin-frontend-boot-state", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  usePluginFrontendsSettled: () => true,
}));

afterEach(() => {
  cleanup();
  resetPluginSlotStoreForTest();
});

function panel(id: string, pinned: boolean) {
  return {
    id,
    title: id,
    icon: "Home",
    path: id,
    component: () => <div>{`${id} page`}</div>,
    ...(pinned ? { experimental_pinnedTab: true } : {}),
  };
}

function renderPinnedRoute() {
  render(
    <MemoryRouter initialEntries={[PINNED_TAB_ROUTE_PATH]}>
      <Routes>
        <Route path={PINNED_TAB_ROUTE_PATH} element={<PinnedTabView />} />
        <Route path="/" element={<div>new thread</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PinnedTabView", () => {
  it("renders the first pinned panel under the tab bar", () => {
    setPluginSlotRegistrations(
      "first",
      registrationSet({ navPanels: [panel("plain", false), panel("home", true)] }),
    );
    setPluginSlotRegistrations(
      "second",
      registrationSet({ navPanels: [panel("other", true)] }),
    );
    renderPinnedRoute();
    expect(screen.getByText("tab bar")).toBeDefined();
    expect(screen.getByText("home page")).toBeDefined();
    expect(screen.queryByText("other page")).toBeNull();
    expect(screen.queryByText("plain page")).toBeNull();
  });

  it("sends the pinned route to New thread when no plugin pins a panel", () => {
    setPluginSlotRegistrations(
      "plain",
      registrationSet({ navPanels: [panel("plain", false)] }),
    );
    renderPinnedRoute();
    expect(screen.getByText("new thread")).toBeDefined();
  });
});

describe("pinnedTabPanel", () => {
  it("picks the first pinned registration", () => {
    const panels = [
      { ...panel("plain", false), pluginId: "a", generation: 1 },
      { ...panel("home", true), pluginId: "a", generation: 1 },
      { ...panel("other", true), pluginId: "b", generation: 1 },
    ];
    expect(pinnedTabPanel(panels)?.id).toBe("home");
    expect(pinnedTabPanel([panels[0]!])).toBeNull();
  });
});
