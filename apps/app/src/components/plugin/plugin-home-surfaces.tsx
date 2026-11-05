import { useMemo } from "react";
import type {
  ExperimentalThreadSearch,
  ExperimentalAddProject,
  ExperimentalHomepageSectionInfo,
  ExperimentalHomepageSectionProps,
} from "@get-bb/plugin-sdk/app";
import {
  useAppCommandRunner,
  useAppCommandShortcut,
} from "@/components/commands/AppCommandProvider";
import { useQuickCreateProjectController } from "@/hooks/useQuickCreateProject";
import { usePluginSlots } from "@/lib/plugin-slots";
import {
  HOME_SECTION_PROJECT,
  PluginHomepageSection,
} from "./PluginHomepageSections";

export function useHomepageSectionInfos(): readonly ExperimentalHomepageSectionInfo[] {
  const { homepageSections } = usePluginSlots();
  return useMemo(
    () =>
      homepageSections.map((section) => ({
        pluginId: section.pluginId,
        id: section.id,
        title: section.title,
        experimental_placement: section.experimental_placement ?? null,
      })),
    [homepageSections],
  );
}

export function PluginHomepageSectionById({
  pluginId,
  sectionId,
}: ExperimentalHomepageSectionProps) {
  const section = usePluginSlots().homepageSections.find(
    (candidate) => candidate.pluginId === pluginId && candidate.id === sectionId,
  );
  return section === undefined ? null : (
    <PluginHomepageSection section={section} project={HOME_SECTION_PROJECT} />
  );
}

export function usePluginAddProject(): ExperimentalAddProject {
  const { isAvailable, isCreating, openCreateDialog } =
    useQuickCreateProjectController();
  return useMemo(
    () => ({ isAvailable, isCreating, open: openCreateDialog }),
    [isAvailable, isCreating, openCreateDialog],
  );
}

export function usePluginThreadSearch(): ExperimentalThreadSearch {
  const commandRunner = useAppCommandRunner();
  const shortcut = useAppCommandShortcut("thread.search");
  return useMemo(
    () => ({
      shortcut,
      open: (anchor) => commandRunner.dispatch("thread.search", anchor),
    }),
    [commandRunner, shortcut],
  );
}
