import { useMemo, useRef } from "react";
import type { PluginThreadActionChoice } from "@get-bb/plugin-sdk";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@bb/shared-ui/command";
import { Icon } from "@bb/shared-ui/icon";
import { Popover, PopoverAnchor, PopoverContent } from "@bb/shared-ui/popover";

const SNOOZE_PICKER_TOP_OFFSET_PX = 48;

function paneTopCenter(paneId: string): DOMRect {
  const pane = document.querySelector(
    `[data-split-pane-id="${CSS.escape(paneId)}"]`,
  );
  const bounds = pane?.getBoundingClientRect() ?? {
    left: 0,
    top: 0,
    width: window.innerWidth,
  };
  return new DOMRect(
    bounds.left + bounds.width / 2,
    bounds.top + SNOOZE_PICKER_TOP_OFFSET_PX,
    0,
    0,
  );
}

export function SnoozePicker({
  paneId,
  choices,
  onSelect,
  onDone,
}: {
  paneId: string;
  choices: readonly PluginThreadActionChoice[];
  onSelect: (choiceId: string) => void;
  onDone: () => void;
}) {
  const commandRef = useRef<HTMLDivElement>(null);
  const anchor = useMemo(
    () => ({ current: { getBoundingClientRect: () => paneTopCenter(paneId) } }),
    [paneId],
  );
  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) onDone();
      }}
    >
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        align="center"
        aria-label="Snooze"
        mobileTitle="Snooze"
        className="w-52 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          commandRef.current?.focus();
        }}
      >
        <Command ref={commandRef} label="Snooze for">
          <CommandList>
            <CommandGroup heading="Snooze for">
              {choices.map((choice) => (
                <CommandItem
                  key={choice.id}
                  value={choice.id}
                  keywords={[choice.label]}
                  onSelect={() => {
                    onSelect(choice.id);
                    onDone();
                  }}
                  className="py-[0.3125rem] text-xs max-md:pointer-coarse:py-2"
                >
                  <Icon
                    name="AlarmClock"
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {choice.label}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
