import type { PluginHomepageSectionProps } from "@get-bb/plugin-sdk/app";
import {
  usePluginSlots,
  type PluginHomepageSectionSlot,
} from "@/lib/plugin-slots";
import { getPluginHomepageSectionAnchor } from "@/lib/plugin-homepage-section";
import { PluginSlotMount } from "./PluginSlotMount";

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
}: {
  project: HomepageSectionProject;
}) {
  const { homepageSections } = usePluginSlots();
  const lead = homepageSections.filter(isLeadHomepageSection);
  const titled = homepageSections.filter(
    (section) => !isLeadHomepageSection(section),
  );
  return (
    <>
      {lead.length === 0 ? null : (
        <div className="space-y-6">
          {lead.map((section) => (
            <div
              key={`${section.pluginId}/${section.id}/${section.generation}`}
              id={getPluginHomepageSectionAnchor(section.pluginId, section.id)}
            >
              <PluginHomepageSectionBody section={section} project={project} />
            </div>
          ))}
        </div>
      )}
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
