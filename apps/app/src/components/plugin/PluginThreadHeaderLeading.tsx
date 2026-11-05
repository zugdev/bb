import { cn } from "@bb/shared-ui/lib/utils";
import { usePluginSlots } from "@/lib/plugin-slots";
import { PluginSlotMount } from "./PluginSlotMount";

export function PluginThreadHeaderLeading({
  threadId,
  isNarrow,
  className,
}: {
  threadId: string;
  isNarrow: boolean;
  className?: string;
}) {
  const { threadHeaderLeadings } = usePluginSlots();
  if (threadHeaderLeadings.length === 0) return null;
  return (
    <div
      data-thread-header-leading=""
      className={cn(
        "flex min-w-0 shrink items-center [&:not(:has(*>*))]:hidden",
        className,
      )}
    >
      {threadHeaderLeadings.map((slot) => {
        const Component = slot.component;
        return (
          <PluginSlotMount
            key={`${slot.pluginId}/${slot.id}/${slot.generation}`}
            pluginId={slot.pluginId}
            slotKind="threadHeaderLeading"
            slotId={slot.id}
            instanceId={threadId}
            crashFallback={null}
          >
            <Component threadId={threadId} isNarrow={isNarrow} />
          </PluginSlotMount>
        );
      })}
    </div>
  );
}
