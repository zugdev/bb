import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default function remoteBb(bb: BbPluginApi) {
  bb.settings.define({
    url: {
      type: "string",
      label: "Remote bb URL",
      description: "Address of the other bb server, for example https://bb.<tailnet>.ts.net.",
      default: "",
    },
  });
}
