import { Button } from "@bb/shared-ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@bb/shared-ui/dialog";

export interface RunningMessageEditConfirm {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RunningMessageEditDialog({
  open,
  onConfirm,
  onCancel,
}: RunningMessageEditConfirm) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onCancel())}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm();
          }}
        >
          <DialogHeader>
            <DialogTitle>Stop the thread and edit?</DialogTitle>
            <DialogDescription>
              The thread is still working. Sending the edited message stops the
              current work and continues from your edit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Keep running
            </Button>
            <Button type="submit" autoFocus>
              Stop and edit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
