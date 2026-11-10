import { describe, expect, it } from "vitest";
import {
  createSidebarNavigationRows,
  resolveActiveSidebarNavigationItemId,
} from "./sidebarNavigationItems";

const rows = createSidebarNavigationRows([
  {
    chrome: {
      pluginId: "inbox",
      id: "inbox",
      path: "inbox",
      title: "Inbox",
      icon: "Inbox",
    },
    panel: null,
  },
]);

describe("resolveActiveSidebarNavigationItemId", () => {
  it("marks a panel's row active while its own tab shows a thread", () => {
    expect(
      resolveActiveSidebarNavigationItemId({
        rows,
        pathname: "/projects/p1/threads/t1",
        activeTabOwner: {
          kind: "panel",
          panel: { pluginId: "inbox", panelPath: "inbox" },
        },
      }),
    ).toBe("inbox/inbox");
  });

  it("marks no row for a thread in an ordinary tab", () => {
    expect(
      resolveActiveSidebarNavigationItemId({
        rows,
        pathname: "/projects/p1/threads/t1",
        activeTabOwner: null,
      }),
    ).toBeNull();
  });
});
