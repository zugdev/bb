// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompactViewportOverrideProvider } from "@bb/shared-ui/hooks/use-compact-viewport";
import { TooltipProvider } from "@bb/shared-ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import {
  markPluginFrontendsSettled,
  resetPluginFrontendBootStateForTest,
} from "@/lib/plugin-frontend-boot-state";
import { resetPluginSlotStoreForTest } from "@/lib/plugin-slots";
import {
  pluginNavPanelOrderAtom,
  pluginNavVisiblePanelKeysAtom,
} from "@/components/plugin/pluginNavSidebarAtoms";
import { registerNavigationPlugin } from "@/test/fixtures/navigation-plugin";
import { AppSidebar } from "./AppSidebar";
import {
  SidebarTitleBarSlotProvider,
  SidebarTitleBarSlotTarget,
} from "./SidebarChrome";
import {
  sidebarNavigationProviderAtom,
  useResolvedSidebarNavigation,
} from "./sidebarNavigationProvider";

vi.mock("@/views/thread-detail/InboxTabController", () => ({
  useInboxQueueLength: () => 0,
  useIsInboxTabActive: () => false,
}));

vi.mock("@/components/commands/AppCommandProvider", () => ({
  useAppCommandHandler: () => {},
  useAppCommandRunner: () => ({
    dispatch: () => {},
    isCommandAvailable: () => true,
  }),
  useAppCommandShortcut: () => null,
  useAppCommandShortcuts: () => [],
  useIndexedAppCommandHandlers: () => {},
  useIsAppCommandModifierHeld: () => false,
}));

vi.mock("./PluginThreadList", () => ({
  PluginThreadList: () => <div data-testid="thread-list" />,
}));

vi.mock("./ActiveTabThreadsSection", () => ({
  ActiveTabThreadsSection: () => null,
}));

vi.mock("@/components/plugin/PluginSidebarFooterItems", () => ({
  PluginSidebarFooterDisclosure: () => null,
  PluginSidebarFooterItems: ({
    builtInActions,
  }: {
    builtInActions: readonly { id: string }[];
  }) => (
    <>
      {builtInActions.map((action) => (
        <button key={action.id} type="button">
          {action.id}
        </button>
      ))}
    </>
  ),
  usePluginSidebarFooterDisclosure: () => ({
    activeItem: null,
    activeKey: null,
    dismiss: () => {},
    handleCommand: () => {},
  }),
}));

vi.mock("./SidebarPluginAttentionGlyph", () => ({
  SidebarPluginAttentionGlyph: () => null,
}));

vi.mock("./SidebarUpdatesBadge", () => ({
  SidebarUpdatesBadge: () => null,
}));

function Harness() {
  const navigation = useResolvedSidebarNavigation();
  return (
    <AppSidebar
      onResizeMouseDown={() => {}}
      isResizing={false}
      isBodyHidden={false}
      navigation={navigation}
      settingsRoutePath="/settings"
      isSettingsActive={false}
      alternateBody={null}
    />
  );
}

function renderSidebar(preference: string, framed = false, open = true) {
  const store = createStore();
  store.set(sidebarNavigationProviderAtom, preference);
  store.set(pluginNavPanelOrderAtom, ["__bb__/new-thread", "__bb__/skills"]);
  store.set(pluginNavVisiblePanelKeysAtom, ["__bb__/new-thread"]);
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/"]}>
        <CompactViewportOverrideProvider isCompactViewport={false}>
          <TooltipProvider>
            <SidebarProvider framed={framed} open={open}>
              <SidebarTitleBarSlotProvider>
                <SidebarTitleBarSlotTarget />
                <Harness />
              </SidebarTitleBarSlotProvider>
            </SidebarProvider>
          </TooltipProvider>
        </CompactViewportOverrideProvider>
      </MemoryRouter>
    </Provider>,
  );
}

function navigationRegion(): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    "nav[data-sidebar-navigation-placement]",
  );
  if (element === null) throw new Error("Expected the navigation region");
  return element;
}

function footer(): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    '[data-sidebar="footer"]',
  );
  if (element === null) throw new Error("Expected the sidebar footer");
  return element;
}

function followingSiblings(element: Element): Element[] {
  const siblings: Element[] = [];
  for (
    let sibling = element.nextElementSibling;
    sibling !== null;
    sibling = sibling.nextElementSibling
  ) {
    siblings.push(sibling);
  }
  return siblings;
}

beforeEach(async () => {
  window.localStorage.clear();
  resetPluginFrontendBootStateForTest();
  markPluginFrontendsSettled();
  await registerNavigationPlugin();
});

afterEach(() => {
  cleanup();
  resetPluginSlotStoreForTest();
  resetPluginFrontendBootStateForTest();
  window.localStorage.clear();
});

describe("AppSidebar", () => {
  it("puts the framed list header in the window title bar and keeps the small top inset", () => {
    renderSidebar("navigation/top-list", true);

    const reserveRow = screen.getByTestId("app-sidebar-top-reserve-row");
    expect(reserveRow.classList.contains("h-2")).toBe(true);
    const more = screen.getByRole("button", { name: "More" });
    expect(screen.getByTestId("sidebar-title-bar-header").contains(more)).toBe(
      true,
    );
  });

  it("hides the framed list header while the sidebar is collapsed", () => {
    renderSidebar("navigation/top-list", true, false);

    expect(screen.queryByTestId("sidebar-header-slot")).toBeNull();
  });

  it("puts the list header in the sidebar's own header row when the sidebar is not framed", () => {
    renderSidebar("navigation/top-list");

    const more = screen.getByRole("button", { name: "More" });
    expect(
      screen.getByTestId("app-sidebar-top-reserve-row").contains(more),
    ).toBe(true);
    expect(
      screen.getByTestId("sidebar-title-bar-header").childElementCount,
    ).toBe(0);
  });

  it("keeps the framed rail header in the sidebar's own header row", () => {
    renderSidebar("navigation/rail", true);

    expect(
      screen
        .getByTestId("app-sidebar-top-reserve-row")
        .contains(screen.getByTestId("sidebar-header-slot")),
    ).toBe(true);
    expect(
      screen.getByTestId("sidebar-title-bar-header").childElementCount,
    ).toBe(0);
  });

  it.each([
    ["navigation/top-list", false],
    ["navigation/rail", true],
  ])(
    "extends the framed %s sidebar body through the title bar with a leading border only beside a rail",
    (preference, hasLeadingBorder) => {
      renderSidebar(preference, true);

      const body = screen.getByTestId("nav-rail-sidebar-body");
      for (const extension of [
        "before:bottom-full",
        "before:h-(--bb-window-title-bar-height)",
        "before:bg-sidebar",
        "[clip-path:inset(calc(var(--bb-window-title-bar-height)*-1)_-6px_0_0)]",
      ]) {
        expect(body.classList.contains(extension)).toBe(true);
      }
      expect(body.classList.contains("border-l-0")).toBe(!hasLeadingBorder);
    },
  );

  it("keeps the footer after the navigation in one column for list navigation, so docking plugins can inset it", () => {
    renderSidebar("navigation/top-list");

    const region = navigationRegion();
    expect(region.dataset.sidebarNavigationPlacement).toBe("list");
    expect(followingSiblings(region)).toContain(footer());
    expect(screen.getByRole("button", { name: "settings" })).toBeDefined();
  });
});
