// @vitest-environment jsdom

import { useEffect } from "react";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  BrowserRouter,
  useLocation,
  useNavigate,
  type NavigateFunction,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultAppSettings,
  type AppDefaultKeybinding,
  type KeyboardCommandId,
} from "@bb/domain";
import {
  AppCommandProvider,
  useAppCommandRunner,
  type AppCommandRunner,
} from "@/components/commands/AppCommandProvider";
import { HistoryNavigationButtons } from "@/test/history-navigation-buttons";
import { resetAppRouteHistoryForTest } from "@/lib/app-route-history";
import { HistoryCommandHandlers } from "./HistoryCommandHandlers";

const mocks = vi.hoisted(() => {
  function webBinding(
    command: "history.back" | "history.forward",
    key: string,
  ): AppDefaultKeybinding {
    return {
      command,
      desktopOnly: false,
      shortcut: {
        key,
        mod: true,
        meta: false,
        control: false,
        alt: false,
        shift: false,
      },
      when: { all: ["mainSurface"], none: [] },
    };
  }
  return {
    backBinding: webBinding("history.back", "["),
    forwardBinding: webBinding("history.forward", "]"),
    closeMobileSidebar: vi.fn(),
  };
});

vi.mock("@/hooks/queries/system-queries", () => ({
  useSystemConfig: () => ({
    data: {
      generalSettings: { ...defaultAppSettings },
      keybindings: [mocks.backBinding, mocks.forwardBinding],
      defaultKeybindings: [mocks.backBinding, mocks.forwardBinding],
    },
  }),
}));

vi.mock("@/lib/bb-desktop", () => ({
  getBbDesktopInfo: () => null,
}));

vi.mock("@/components/ui/sidebar.js", () => ({
  useCloseMobileSidebar: () => mocks.closeMobileSidebar,
}));

const harness: {
  runner: AppCommandRunner | null;
  navigate: NavigateFunction | null;
} = { runner: null, navigate: null };

function Harness() {
  const runner = useAppCommandRunner();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    harness.runner = runner;
    harness.navigate = navigate;
  }, [navigate, runner]);
  return (
    <>
      <HistoryCommandHandlers />
      <HistoryNavigationButtons />
      <span data-testid="location">{location.pathname}</span>
    </>
  );
}

function renderAt(pathname: string) {
  window.history.replaceState(null, "", pathname);
  render(
    <BrowserRouter>
      <AppCommandProvider>
        <Harness />
      </AppCommandProvider>
    </BrowserRouter>,
  );
}

function open(pathname: string) {
  act(() => {
    void harness.navigate?.(pathname);
  });
}

function dispatch(command: KeyboardCommandId): boolean {
  let handled = false;
  act(() => {
    handled = harness.runner?.dispatch(command, null) ?? false;
  });
  return handled;
}

function available(command: KeyboardCommandId): boolean {
  return harness.runner?.isCommandAvailable(command, null) ?? false;
}

async function expectPath(pathname: string) {
  await waitFor(() =>
    expect(screen.getByTestId("location").textContent).toBe(pathname),
  );
}

const A = "/projects/proj_1/threads/thr_a";
const B = "/settings";

describe("HistoryCommandHandlers", () => {
  beforeEach(() => {
    mocks.closeMobileSidebar.mockClear();
  });

  afterEach(() => {
    cleanup();
    harness.runner = null;
    harness.navigate = null;
    resetAppRouteHistoryForTest();
    window.history.replaceState(null, "", "/");
  });

  it("moves through the sidebar's route history and closes the mobile sidebar", async () => {
    renderAt(A);

    expect(available("history.back")).toBe(false);
    expect(available("history.forward")).toBe(false);
    expect(dispatch("history.back")).toBe(false);
    expect(dispatch("history.forward")).toBe(false);
    expect(mocks.closeMobileSidebar).not.toHaveBeenCalled();

    open(B);
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Go back" })
          .getAttribute("aria-disabled") === "true",
      ).toBe(false),
    );
    expect(available("history.back")).toBe(true);
    expect(available("history.forward")).toBe(false);

    expect(dispatch("history.back")).toBe(true);
    await expectPath(A);
    expect(mocks.closeMobileSidebar).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Go forward" })
          .getAttribute("aria-disabled") === "true",
      ).toBe(false),
    );
    expect(dispatch("history.back")).toBe(false);

    expect(dispatch("history.forward")).toBe(true);
    await expectPath(B);
    expect(mocks.closeMobileSidebar).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Go forward" })
          .getAttribute("aria-disabled") === "true",
      ).toBe(true),
    );
    expect(dispatch("history.forward")).toBe(false);
  });
});
