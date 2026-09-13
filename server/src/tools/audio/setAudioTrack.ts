import { z } from "zod";
import type { Tool } from "../types.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../utils/errors.js";
import { looseOptional, caseInsensitiveEnum } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    kind: caseInsensitiveEnum(["NARRATION", "MUSIC"]),
    volume: looseOptional(z.number().min(0).max(2)),
    fadeInSec: looseOptional(z.number().min(0)),
    fadeOutSec: looseOptional(z.number().min(0)),
    active: looseOptional(z.boolean()).describe("Set false to remove this track from the assembly without deleting the uploaded file."),
  })
  .strict();

/**
 * Adjusts the currently-uploaded narration or music track (volume/fades),
 * or removes it from assembly. Uploading the audio FILE itself happens via
 * POST /api/projects/:id/upload-audio (raw bytes, not something the LLM
 * can send) - this tool only tunes/toggles an already-uploaded track.
 */
export const setAudioTrackTool: Tool<z.infer<typeof InputSchema>> = {
  name: "set_audio_track",
  description: "Adjust the project's uploaded narration or music track: volume (0-2, default 1), fadeInSec/fadeOutSec, or active:false to remove it from assembly. The audio file itself is uploaded via the UI, not this tool.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const track = await prisma.audioTrack.findFirst({ where: { projectId: ctx.projectId, kind: input.kind, active: true }, orderBy: { createdAt: "desc" } });
    if (!track) {
      throw new AppError("VALIDATION_ERROR", `No ${input.kind.toLowerCase()} track has been uploaded yet.`, { retryable: false });
    }
    const updated = await prisma.audioTrack.update({
      where: { id: track.id },
      data: {
        ...(input.volume !== undefined && { volume: input.volume }),
        ...(input.fadeInSec !== undefined && { fadeInSec: input.fadeInSec }),
        ...(input.fadeOutSec !== undefined && { fadeOutSec: input.fadeOutSec }),
        ...(input.active !== undefined && { active: input.active }),
      },
    });
    return { audioTrack: updated };
  },
};
