import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const positionSchema = z
  .object({
    file: z.string().min(1),
    content: z.string(),
    line: z.number().int().positive(),
    offset: z.number().int().positive(),
  })
  .strict();

const locationSchema = z
  .object({
    line: z.number().int(),
    offset: z.number().int(),
  })
  .strict();

export const tsHostContract = defineRpcContract({
  definition: {
    input: positionSchema,
    output: z
      .object({
        definitions: z.array(
          z
            .object({
              file: z.string(),
              start: locationSchema,
              end: locationSchema,
            })
            .strict(),
        ),
      })
      .strict(),
  },
  hover: {
    input: positionSchema,
    output: z.object({ contents: z.array(z.string()) }).strict(),
  },
});
