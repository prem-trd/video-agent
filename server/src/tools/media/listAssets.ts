import { z } from "zod";
import type { Tool } from "../types.js";
import { AssetService, serializeAsset } from "../../services/AssetService.js";
import { looseOptional, caseInsensitiveEnum } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    sceneId: z.string().optional().describe("Filter to one scene's assets."),
    type: looseOptional(caseInsensitiveEnum(["IMAGE", "VIDEO", "VOICE", "MUSIC", "SUBTITLE", "THUMBNAIL"])),
  })
  .strict();

/** Lets the agent check what's already been generated before deciding what to do next (spec #25). */
export const listAssetsTool: Tool<z.infer<typeof InputSchema>> = {
  name: "list_assets",
  description: "List generated assets for this project, optionally filtered by sceneId and/or type. Use this to check generation progress before assembling the video.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const assets = input.sceneId
      ? await AssetService.listForScene(ctx.projectId, input.sceneId, input.type)
      : (await AssetService.listForProject(ctx.projectId)).filter((a) => !input.type || a.type === input.type);
    return { assets: assets.map(serializeAsset), count: assets.length };
  },
};
