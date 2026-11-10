import { useUsesSwipeChrome } from "@/components/layout/useUsesSwipeChrome";
import { usePluginSlots } from "@/lib/plugin-slots";
import { PluginSlotMount } from "./PluginSlotMount";

export function PluginThreadComposerOverlay({
  threadId,
}: {
  threadId: string;
}) {
  const { threadComposerOverlays } = usePluginSlots();
  const isPhone = useUsesSwipeChrome();
  if (threadComposerOverlays.length === 0) return null;
  return (
    <div
      data-thread-composer-overlay=""
      className="pointer-events-none absolute inset-x-0 bottom-full z-10 flex flex-col"
    >
      {threadComposerOverlays.map((slot) => {
        const Component = slot.component;
        return (
          <PluginSlotMount
            key={`${slot.pluginId}/${slot.id}/${slot.generation}`}
            pluginId={slot.pluginId}
            slotKind="threadComposerOverlay"
            slotId={slot.id}
            instanceId={threadId}
            crashFallback={null}
          >
            <Component threadId={threadId} isPhone={isPhone} />
          </PluginSlotMount>
        );
      })}
    </div>
  );
}
