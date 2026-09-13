import { z } from "zod";
import type { Tool } from "../types.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../utils/errors.js";

const InputSchema = z.object({ mediaId: z.string().min(1) }).strict();

/** Surfaces the stored ffprobe details for one uploaded file (probed once at upload time). */
export const inspectMediaTool: Tool<z.infer<typeof InputSchema>> = {
  name: "inspect_media",
  description: "Get the probed technical details (resolution, duration, aspect ratio, codec info) for one uploaded media file by its id.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const media = await prisma.mediaAsset.findFirst({ where: { id: input.mediaId, projectId: ctx.projectId } });
    if (!media) throw new AppError("NOT_FOUND", `Media asset ${input.mediaId} not found`, { retryable: false });
    return {
      id: media.id,
      type: media.type,
      originalFilename: media.originalFilename,
      width: media.width,
      height: media.height,
      durationSec: media.durationSec,
      aspectRatio: media.aspectRatio,
      sizeBytes: media.sizeBytes,
      status: media.status,
      probeMetadata: safeParse(media.probeMetadata),
      matchedSceneNumber: media.matchedSceneNumber,
    };
  },
};

function safeParse(json: string) {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}
