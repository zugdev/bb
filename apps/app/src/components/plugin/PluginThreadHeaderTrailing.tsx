import { cn } from "@bb/shared-ui/lib/utils";
import { usePluginSlots } from "@/lib/plugin-slots";
import { PluginSlotMount } from "./PluginSlotMount";

export function useHasPluginThreadHeaderTrailing(): boolean {
  return usePluginSlots().threadHeaderTrailings.length > 0;
}

export function PluginThreadHeaderTrailing({
  threadId,
  placement,
  className,
}: {
  threadId: string;
  placement: "inline" | "below";
  className?: string;
}) {
  const { threadHeaderTrailings } = usePluginSlots();
  if (threadHeaderTrailings.length === 0) return null;
  return (
    <div
      data-thread-header-trailing={placement}
      className={cn(
        "flex shrink-0 items-center [&:not(:has(*>*))]:hidden",
        className,
      )}
    >
      {threadHeaderTrailings.map((slot) => {
        const Component = slot.component;
        return (
          <PluginSlotMount
            key={`${slot.pluginId}/${slot.id}/${slot.generation}`}
            pluginId={slot.pluginId}
            slotKind="threadHeaderTrailing"
            slotId={slot.id}
            instanceId={threadId}
            crashFallback={null}
          >
            <Component threadId={threadId} placement={placement} />
          </PluginSlotMount>
        );
      })}
    </div>
  );
}
