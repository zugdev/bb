import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default function home(bb: BbPluginApi) {
  bb.settings.define({
    showFilters: {
      type: "boolean",
      label: "Show thread filters",
      description:
        "Show the status (All, Running, Needs you) and age (Any age, 7d+, 30d+) filters on the New thread page.",
      default: false,
    },
  });
}
