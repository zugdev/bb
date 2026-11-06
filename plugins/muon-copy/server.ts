import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { fileKindSchema, taskIdSchema, type ReadResult } from "./block.js";
import { DEFAULT_MUON_ROOT, readMuonFile } from "./muon.js";

export const muonCopyRpcContract = defineRpcContract({
  read: {
    input: z.object({ task: taskIdSchema, file: fileKindSchema }).strict(),
    output: z.custom<ReadResult>(),
  },
});

export default async function muonCopyPlugin(bb: BbPluginApi): Promise<void> {
  const settings = bb.settings.define({
    root: {
      type: "string",
      label: "Muon root",
      description:
        "Folder that holds tasks/<id>/instruction.md and state/<id>/survey.md.",
      default: DEFAULT_MUON_ROOT,
    },
  });

  bb.rpc.register(muonCopyRpcContract, {
    read: async ({ task, file }) => {
      const { root } = await settings.get();
      return readMuonFile(root === "" ? DEFAULT_MUON_ROOT : root, task, file);
    },
  });
}
