import { useMemo } from "react";
import { pluginCommandId } from "@bb/domain";
import type {
  ExperimentalProjectPickerProps,
  ExperimentalShortcutPresentation,
} from "@get-bb/plugin-sdk/app";
import { useAppCommandShortcut } from "@/components/commands/AppCommandProvider";
import { ProjectSelector } from "@/components/pickers/ProjectSelector";
import { usePluginId } from "@/components/plugin/plugin-context";
import { useSidebarNavigation } from "@/hooks/queries/sidebar-navigation-query";
import { useQuickCreateProjectController } from "@/hooks/useQuickCreateProject";

export function PluginProjectPicker({
  value,
  onChange,
  disabled,
}: ExperimentalProjectPickerProps) {
  const { data } = useSidebarNavigation();
  const quickCreateProject = useQuickCreateProjectController();
  const options = useMemo(
    () => data?.projects.map(({ id, name }) => ({ id, name })) ?? [],
    [data],
  );
  return (
    <ProjectSelector
      projects={options}
      value={value}
      onChange={onChange}
      allowNoProject
      variant="outline"
      createProject={{
        onCreate: quickCreateProject.openCreateDialog,
        disabled:
          !quickCreateProject.isAvailable || quickCreateProject.isCreating,
        isCreating: quickCreateProject.isCreating,
      }}
      disabled={disabled}
      isLoading={data === undefined}
    />
  );
}

export function usePluginCommandShortcut(
  id: string,
): ExperimentalShortcutPresentation | null {
  return useAppCommandShortcut(pluginCommandId(usePluginId(), id));
}
