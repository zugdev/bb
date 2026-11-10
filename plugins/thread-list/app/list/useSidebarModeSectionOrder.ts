import { useCallback, useMemo } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
  sidebarHiddenGroupsAtom,
  sidebarManualSectionOrderAtom,
  sidebarMachineSectionOrderAtom,
  sidebarSectionOrderAtom,
} from "../preferences/atoms.js";
import type { OrganizationMode as SidebarOrganizationMode } from "../../shared/preferences.js";
import type { SidebarSectionId } from "../model/sidebar-section-id.js";
import {
  applyEntityOrder,
  applyVisibleSidebarSectionOrder,
  findMovedEntity,
  normalizeSidebarSectionOrder,
  type LegacySidebarEntityAnchor,
  type SidebarEntityMove,
} from "../model/sidebar-section-order.js";

const MODE_SECTION_ORDER_CONFIG: Record<
  SidebarOrganizationMode,
  {
    atom: typeof sidebarSectionOrderAtom;
    entityKind: "project" | "section" | "machine";
    legacyEntityAnchor: LegacySidebarEntityAnchor;
  }
> = {
  project: {
    atom: sidebarSectionOrderAtom,
    entityKind: "project",
    legacyEntityAnchor: "projects",
  },
  chronological: {
    atom: sidebarManualSectionOrderAtom,
    entityKind: "section",
    legacyEntityAnchor: "sections",
  },
  machine: {
    atom: sidebarMachineSectionOrderAtom,
    entityKind: "machine",
    legacyEntityAnchor: "machines",
  },
};

interface UseSidebarModeSectionOrderArgs {
  entitySectionIds: readonly SidebarSectionId[];
  hasThreadsSection?: boolean;
  mode: SidebarOrganizationMode;
  onEntityMove?: (move: SidebarEntityMove) => void;
  showPinnedSection: boolean;
}

interface UseSidebarModeSectionOrderResult {
  onOrderChange: (order: SidebarSectionId[]) => void;
  order: SidebarSectionId[];
  persistedOrder: SidebarSectionId[];
}

export function useSidebarModeSectionOrder({
  entitySectionIds,
  hasThreadsSection,
  mode,
  onEntityMove,
  showPinnedSection,
}: UseSidebarModeSectionOrderArgs): UseSidebarModeSectionOrderResult {
  const config = MODE_SECTION_ORDER_CONFIG[mode];
  const [storedOrder, setStoredOrder] = useAtom(config.atom);
  const hiddenGroups = useAtomValue(sidebarHiddenGroupsAtom);
  const hiddenGroupIds = useMemo(
    () => new Set<string>(hiddenGroups),
    [hiddenGroups],
  );
  const followsEntityOrder = onEntityMove !== undefined;
  const persistedOrder = useMemo(() => {
    const normalized = normalizeSidebarSectionOrder({
      storedOrder,
      entitySectionIds,
      legacyEntityAnchor: config.legacyEntityAnchor,
      hasPinnedSection: true,
      ...(hasThreadsSection === undefined ? {} : { hasThreadsSection }),
    });
    return followsEntityOrder
      ? applyEntityOrder(normalized, entitySectionIds)
      : normalized;
  }, [
    config.legacyEntityAnchor,
    entitySectionIds,
    followsEntityOrder,
    hasThreadsSection,
    storedOrder,
  ]);
  const order = useMemo(
    () =>
      persistedOrder.filter(
        (sectionId) =>
          (sectionId !== "pinned" || showPinnedSection) &&
          !hiddenGroupIds.has(sectionId),
      ),
    [hiddenGroupIds, persistedOrder, showPinnedSection],
  );
  const onOrderChange = useCallback(
    (nextOrder: SidebarSectionId[]) => {
      if (onEntityMove !== undefined) {
        const entitySet = new Set(entitySectionIds);
        const nextEntities = nextOrder.filter((id) => entitySet.has(id));
        const movedSet = new Set(nextEntities);
        const move = findMovedEntity(
          persistedOrder.filter((id) => movedSet.has(id)),
          nextEntities,
        );
        if (move !== null) onEntityMove(move);
      }
      setStoredOrder(
        (current) =>
          applyVisibleSidebarSectionOrder({
            storedOrder: current,
            nextVisibleOrder: nextOrder,
            entitySectionIds,
            entityKind: config.entityKind,
            legacyEntityAnchor: config.legacyEntityAnchor,
            hasThreadsSection,
          }) ?? current,
      );
    },
    [
      config,
      entitySectionIds,
      hasThreadsSection,
      onEntityMove,
      persistedOrder,
      setStoredOrder,
    ],
  );
  return { onOrderChange, order, persistedOrder };
}
