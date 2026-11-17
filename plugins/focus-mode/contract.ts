import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const statusSchema = z.object({ enabled: z.boolean() }).strict();

export const focusModeHostContract = defineRpcContract({
  status: { input: z.null(), output: statusSchema },
  setEnabled: {
    input: z.object({ enabled: z.boolean(), domains: z.array(z.string().min(1)) }).strict(),
    output: statusSchema,
  },
});

export const focusModeRpcContract = defineRpcContract({
  status: { input: z.null(), output: statusSchema },
  setEnabled: { input: z.object({ enabled: z.boolean() }).strict(), output: statusSchema },
});
