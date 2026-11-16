import { useCallback, useLayoutEffect } from "react";
import {
  definePluginApp,
  experimental_useRpcMutation,
  experimental_useThreadSearch,
} from "@get-bb/plugin-sdk/app";
import { threadFinderRpcContract } from "./contract.js";

const DESCRIPTION_MODE = "description";

let openDescriptionSearch: (() => void) | null = null;

function ThreadSearchOpener() {
  const threadSearch = experimental_useThreadSearch();
  useLayoutEffect(() => {
    openDescriptionSearch = () =>
      threadSearch.open(document.activeElement instanceof HTMLElement ? document.activeElement : null, {
        experimental_mode: DESCRIPTION_MODE,
      });
    return () => {
      openDescriptionSearch = null;
    };
  }, [threadSearch]);
  return null;
}

function useDescriptionSearch() {
  const { mutate } = experimental_useRpcMutation({ contract: threadFinderRpcContract, method: "find" });
  return useCallback(
    async (description: string) => (await mutate({ description })).matches.map((match) => match.threadId),
    [mutate],
  );
}

export default definePluginApp((app) => {
  if ("experimental_threadSearchMode" in app.slots) {
    app.slots.experimental_threadSearchMode({
      id: DESCRIPTION_MODE,
      label: "Description",
      placeholder: "Describe the thread, then press Enter…",
      useSearch: useDescriptionSearch,
    });
  }
  app.slots.experimental_appOverlay({ id: "thread-search-opener", component: ThreadSearchOpener });
  app.commands.register({
    id: "find",
    title: "Find thread by description",
    defaultShortcut: { key: "k", mod: true, shift: true },
    run: () => openDescriptionSearch?.(),
  });
});
