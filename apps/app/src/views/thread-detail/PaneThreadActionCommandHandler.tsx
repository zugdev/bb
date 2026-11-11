import type { PluginThreadActionTarget } from "@get-bb/plugin-sdk";
import { useIndexedAppCommandHandlers } from "@/components/commands/AppCommandProvider";
import {
  CORE_THREAD_ACTION_OWNER,
  useThreadActionEntries,
} from "@/lib/thread-actions/thread-action-registry";
import { usePaneContext } from "./PaneContext";

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

const SNOOZE_SHORTCUT_PRESET = "1h";

const UNFOCUSED_PANE_ARCHIVE_COMMAND = ["thread.archive"] as const;

export function PaneThreadActionCommandHandler({
  thread,
}: {
  thread: PluginThreadActionTarget;
}) {
  const { isFocused, requestFocus } = usePaneContext();
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
      void entry.action.run(
        PANE_THREAD_ACTION_COMMANDS[index] === "thread.snooze"
          ? SNOOZE_SHORTCUT_PRESET
          : undefined,
      );
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

  return null;
}
