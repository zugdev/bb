import { createSyncedPreferenceAtom } from "@/lib/ui-preferences/synced-preference-atom";

export const splitDirectionAtom = createSyncedPreferenceAtom(
  "panes.splitDirection",
);
