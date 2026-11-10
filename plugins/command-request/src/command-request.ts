import { z } from "zod";

export const COMMAND_REQUEST_RENDERER_ID = "command-request";

const HIDDEN_CHARACTERS = /[\p{Cf}\p{Co}\p{Cs}\p{Zl}\p{Zp}]|(?![\n\t])\p{Cc}/u;

export const commandSchema = z
  .string()
  .trim()
  .min(1)
  .max(10_000)
  .refine((command) => !HIDDEN_CHARACTERS.test(command), {
    message:
      "Commands must not contain control, format or other invisible characters",
  });

export const commandRequestPayloadSchema = z.object({
  command: commandSchema,
  purpose: z.string().min(1).nullable(),
  terminalId: z.string().min(1),
});

export const commandRequestResponseSchema = z.object({
  action: z.literal("run"),
});
