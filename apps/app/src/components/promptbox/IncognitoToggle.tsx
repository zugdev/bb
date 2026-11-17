import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import { LIST_HOVER_TRANSITION } from "@bb/shared-ui/motion";
import { cn } from "@bb/shared-ui/lib/utils";
import {
  OPTION_BASE_CLASS_NAME,
  OPTION_INTERACTIVE_CLASS_NAME,
  OPTION_MUTED_CLASS_NAME,
  OPTION_TRIGGER_CONTENT_CLASS_NAME,
} from "@bb/shared-ui/option-display";

export const INCOGNITO_DESCRIPTION =
  "Skips AI titles, AI commit messages and usage telemetry, writes no provider session files, and deletes the thread when you archive it.";

interface IncognitoToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

export function IncognitoToggle({
  value,
  onChange,
  disabled,
}: IncognitoToggleProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label="Incognito"
      aria-pressed={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={cn(
        OPTION_BASE_CLASS_NAME,
        OPTION_INTERACTIVE_CLASS_NAME,
        LIST_HOVER_TRANSITION,
        !value && OPTION_MUTED_CLASS_NAME,
        value && "bg-accent text-foreground",
      )}
    >
      <span
        className={OPTION_TRIGGER_CONTENT_CLASS_NAME}
        title={`Incognito: ${value ? "on" : "off"}. ${INCOGNITO_DESCRIPTION}`}
      >
        <Icon name="EyeOff" className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate" data-promptbox-full-label="">
          Incognito
        </span>
      </span>
    </Button>
  );
}
