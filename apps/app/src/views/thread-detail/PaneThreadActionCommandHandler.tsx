import { useState } from "react";
import type { PluginThreadActionTarget } from "@get-bb/plugin-sdk";
import { useIndexedAppCommandHandlers } from "@/components/commands/AppCommandProvider";
import {
  CORE_THREAD_ACTION_OWNER,
  useThreadActionEntries,
} from "@/lib/thread-actions/thread-action-registry";
import { usePaneContext } from "./PaneContext";
import { SnoozePicker } from "./SnoozePicker";

const PANE_THREAD_ACTION_COMMANDS = [
  "thread.pin",
  "thread.markRead",
  "thread.archive",
  "thread.snooze",
] as const;

const PANE_THREAD_ACTION_KEYS = [
  `${CORE_THREAD_ACTION_OWNER}/pin`,
  `${CORE_THREAD_ACTION_OWNER}/read`,
  `${CORE_THREAD_ACTION_OWNER}/archive`,
  `${CORE_THREAD_ACTION_OWNER}/snooze`,
];

const UNFOCUSED_PANE_ARCHIVE_COMMAND = ["thread.archive"] as const;

export function PaneThreadActionCommandHandler({
  thread,
}: {
  thread: PluginThreadActionTarget;
}) {
  const { isFocused, paneId, requestFocus } = usePaneContext();
  const [isPickingSnooze, setIsPickingSnooze] = useState(false);
  const entries = useThreadActionEntries(thread, {
    keys: PANE_THREAD_ACTION_KEYS,
  });
  const isArchiveOfArchivedThread = (index: number) =>
    PANE_THREAD_ACTION_COMMANDS[index] === "thread.archive" &&
    thread.archivedAt !== null;
  const entryFor = (index: number) => {
    if (isArchiveOfArchivedThread(index)) return undefined;
    const key = PANE_THREAD_ACTION_KEYS[index];
    return entries.find((entry) => entry.key === key);
  };

  useIndexedAppCommandHandlers(
    PANE_THREAD_ACTION_COMMANDS,
    (index) => {
      const entry = entryFor(index);
      if (entry === undefined) return isArchiveOfArchivedThread(index);
      if (PANE_THREAD_ACTION_COMMANDS[index] === "thread.snooze") {
        setIsPickingSnooze(true);
        return true;
      }
      void entry.action.run(undefined);
      return true;
    },
    0,
    isFocused,
    (index) =>
      entryFor(index) !== undefined || isArchiveOfArchivedThread(index),
  );

  const archiveIndex = PANE_THREAD_ACTION_COMMANDS.indexOf("thread.archive");
  useIndexedAppCommandHandlers(
    UNFOCUSED_PANE_ARCHIVE_COMMAND,
    () => {
      const entry = entryFor(archiveIndex);
      if (entry === undefined || requestFocus === undefined) return false;
      requestFocus();
      void entry.action.run(undefined);
      return true;
    },
    -1,
    !isFocused && requestFocus !== undefined,
    () => entryFor(archiveIndex) !== undefined,
  );

  const snooze = entryFor(PANE_THREAD_ACTION_COMMANDS.indexOf("thread.snooze"));
  const snoozeChoices = snooze?.action.choices?.items;
  if (!isPickingSnooze || snooze === undefined || snoozeChoices === undefined) {
    return null;
  }
  return (
    <SnoozePicker
      paneId={paneId}
      choices={snoozeChoices}
      onSelect={(choiceId) => void snooze.action.run(choiceId)}
      onDone={() => setIsPickingSnooze(false)}
    />
  );
}
