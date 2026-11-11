import { definePluginApp } from "@get-bb/plugin-sdk/app";
import {
  canStepInbox,
  INBOX_PANEL_PATH,
  InboxController,
  InboxFloatingControls,
  InboxHeaderControls,
  InboxPanel,
  InboxTitleProject,
  openInboxAtTop,
  stepInbox,
  useInboxBadge,
} from "./inbox";
import { InboxSidebarList } from "./sidebar";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "inbox",
    title: "Inbox",
    icon: "Inbox",
    path: INBOX_PANEL_PATH,
    component: InboxPanel,
    experimental_ownTab: true,
    experimental_useBadge: useInboxBadge,
  });
  app.slots.experimental_threadList({
    id: "inbox",
    title: "Inbox",
    description:
      "Threads that need an answer, wait on your reply, are working or are snoozed.",
    component: InboxSidebarList,
  });
  app.slots.experimental_appOverlay({
    id: "inbox-controller",
    component: InboxController,
  });
  app.slots.experimental_threadHeaderLeading({
    id: "inbox-project",
    component: InboxTitleProject,
  });
  app.slots.experimental_threadHeaderTrailing({
    id: "inbox-controls",
    component: InboxHeaderControls,
  });
  app.slots.experimental_threadComposerOverlay({
    id: "inbox-floating-controls",
    component: InboxFloatingControls,
  });
  app.commands.register({
    id: "open",
    title: "Open Inbox",
    defaultShortcut: { key: "i", mod: true },
    run: openInboxAtTop,
  });
  app.commands.register({
    id: "previous",
    title: "Previous thread in Inbox",
    defaultShortcut: { key: "ArrowLeft", mod: true },
    isAvailable: canStepInbox,
    run: () => stepInbox(-1),
  });
  app.commands.register({
    id: "next",
    title: "Next thread in Inbox",
    defaultShortcut: { key: "ArrowRight", mod: true },
    isAvailable: canStepInbox,
    run: () => stepInbox(1),
  });
});
