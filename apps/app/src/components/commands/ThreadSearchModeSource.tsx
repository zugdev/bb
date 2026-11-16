import { useLayoutEffect, type RefObject } from "react";
import type { ExperimentalThreadSearchModeSearch } from "@get-bb/plugin-sdk/app";
import type { ExperimentalThreadSearchModeSlot } from "@/lib/plugin-slots";
import { PluginSlotMount } from "@/components/plugin/PluginSlotMount";

function SearchHookSource({
  useSearch,
  searchRef,
}: {
  useSearch: ExperimentalThreadSearchModeSlot["useSearch"];
  searchRef: RefObject<ExperimentalThreadSearchModeSearch | null>;
}) {
  const search = useSearch();
  useLayoutEffect(() => {
    searchRef.current = search;
    return () => {
      searchRef.current = null;
    };
  }, [search, searchRef]);
  return null;
}

export function threadSearchModeKey(mode: ExperimentalThreadSearchModeSlot) {
  return `${mode.pluginId}/${mode.id}`;
}

export function ThreadSearchModeSource({
  mode,
  searchRef,
}: {
  mode: ExperimentalThreadSearchModeSlot;
  searchRef: RefObject<ExperimentalThreadSearchModeSearch | null>;
}) {
  return (
    <PluginSlotMount
      key={`${threadSearchModeKey(mode)}/${mode.generation}`}
      pluginId={mode.pluginId}
      slotKind="threadSearchMode"
      slotId={mode.id}
      crashFallback={null}
    >
      <SearchHookSource useSearch={mode.useSearch} searchRef={searchRef} />
    </PluginSlotMount>
  );
}
