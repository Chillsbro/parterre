import {z} from "zod";

export const appConfigSchema = z
  .object({
    provider: z
      .enum(["auto", "codex", "copilot", "claude", "openai"])
      .default("auto"),
    workspace: z.string().min(1),
    model: z.string().min(1).default("auto"),
    storageDir: z.string().min(1),
    playwrightCommand: z.string().min(1),
    redactions: z.array(z.string()).default([]),
    baseUrl: z.string().min(1).optional()
  })
  .refine(config => config.provider !== "openai" || Boolean(config.baseUrl), {
    message:
      'provider "openai" requires a base URL: pass --base-url or run `parterre setup`'
  });
