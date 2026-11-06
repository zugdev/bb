import type { ReactNode } from "react";
import type { PluginHomepageSectionProps } from "@get-bb/plugin-sdk/app";
import {
  usePluginSlots,
  type PluginHomepageSectionSlot,
} from "@/lib/plugin-slots";
import { getPluginHomepageSectionAnchor } from "@/lib/plugin-homepage-section";
import { PluginSlotMount } from "./PluginSlotMount";

const HOME_PLUGIN_ID = "home";

export type HomepageSectionProject = Pick<
  PluginHomepageSectionProps,
  "projectId" | "experimental_setProjectId"
>;

export const HOME_SECTION_PROJECT: HomepageSectionProject = {
  projectId: null,
  experimental_setProjectId: null,
};

export function isLeadHomepageSection(
  section: PluginHomepageSectionSlot,
): boolean {
  return section.experimental_placement === "lead";
}

export function PluginHomepageSections({
  project,
  leadAction = null,
}: {
  project: HomepageSectionProject;
  leadAction?: ReactNode;
}) {
  const { homepageSections } = usePluginSlots();
  const lead = homepageSections.filter(isLeadHomepageSection);
  const titled = homepageSections.filter(
    (section) => !isLeadHomepageSection(section),
  );
  const homeIndex = lead.findIndex(
    (section) => section.pluginId === HOME_PLUGIN_ID,
  );
  const focusIndex = homeIndex === -1 ? 0 : homeIndex;
  return (
    <>
      <div className="space-y-6">
        {lead.map((section, index) => (
          <div
            key={`${section.pluginId}/${section.id}/${section.generation}`}
            id={getPluginHomepageSectionAnchor(section.pluginId, section.id)}
            className={index === focusIndex ? "space-y-3" : undefined}
          >
            {index === focusIndex ? leadAction : null}
            <PluginHomepageSectionBody section={section} project={project} />
          </div>
        ))}
        {lead.length === 0 ? leadAction : null}
      </div>
      {titled.length === 0 ? null : (
        <div className="mt-6 space-y-6" data-testid="plugin-homepage-sections">
          {titled.map((section) => (
            <PluginHomepageSection
              key={`${section.pluginId}/${section.id}/${section.generation}`}
              section={section}
              project={project}
            />
          ))}
        </div>
      )}
    </>
  );
}

export function PluginHomepageSection({
  section,
  project,
}: {
  section: PluginHomepageSectionSlot;
  project: HomepageSectionProject;
}) {
  return (
    <section
      id={getPluginHomepageSectionAnchor(section.pluginId, section.id)}
      className="space-y-3"
    >
      <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
      <PluginHomepageSectionBody section={section} project={project} />
    </section>
  );
}

function PluginHomepageSectionBody({
  section,
  project,
}: {
  section: PluginHomepageSectionSlot;
  project: HomepageSectionProject;
}) {
  return (
    <PluginSlotMount
      pluginId={section.pluginId}
      slotKind="homepageSection"
      slotId={section.id}
    >
      <section.component
        projectId={project.projectId}
        experimental_setProjectId={project.experimental_setProjectId}
      />
    </PluginSlotMount>
  );
}
