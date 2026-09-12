import { z } from "zod";
import type { Tool } from "../types.js";
import { ollamaClient } from "../../llm/OllamaClient.js";
import { YoutubeMetaSchema, type YoutubeMeta } from "../../types/schemas.js";
import { ProjectService } from "../../services/ProjectService.js";
import { ProjectStorage } from "../../services/ProjectStorage.js";
import { SceneService } from "../../services/SceneService.js";
import { AssetService, computeGenerationHash, serializeAsset } from "../../services/AssetService.js";
import { getImageProvider } from "../../providers/registry.js";
import { looseOptional } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    generateThumbnailImage: z
      .boolean()
      .optional()
      .describe("If true (default), also render a stylized thumbnail image from the generated thumbnailPrompt using the configured image provider."),
    thumbnailAspectRatio: looseOptional(z.enum(["16:9", "9:16", "1:1"])).describe("Defaults to the project's own aspect ratio."),
  })
  .strict();

/**
 * Generates YouTube publishing metadata - title, description, tags,
 * hashtags, and a thumbnail prompt (spec #35, #36). Does NOT upload to
 * YouTube (spec #35: "Do not automatically upload to YouTube in V1") -
 * this only prepares the content and, optionally, a stylized thumbnail
 * image, ready for a future YouTube API integration or manual posting.
 */
export const generateYoutubeMetadataTool: Tool<z.infer<typeof InputSchema>> = {
  name: "generate_youtube_metadata",
  description:
    "Generate YouTube publishing metadata for this project: title, description, tags, hashtags, and a thumbnail prompt. Optionally renders a stylized thumbnail image from that prompt (generateThumbnailImage, default true). Does not upload anything to YouTube.",
  inputSchema: InputSchema,
  retryable: true,
  timeoutMs: 60_000,
  async execute(input, ctx) {
    const project = await ProjectService.get(ctx.projectId);
    const scenes = await SceneService.list(ctx.projectId);
    const styleBible = await ProjectService.getStyleBible(ctx.projectId);

    const scriptSummary = scenes.map((s) => `#${s.sceneNumber}: ${s.narration}`).join("\n");

    const meta = await ollamaClient.chatJSON<YoutubeMeta>(
      [
        {
          role: "system",
          content:
            "You are a YouTube content strategist for children's/educational video content. Write a compelling, accurate, non-clickbait " +
            "title (under 100 characters), a description (2-4 short paragraphs including what the viewer will learn and a soft call to action), " +
            "8-15 relevant tags, 3-6 hashtags (with #), and a thumbnailPrompt: a vivid, detailed prompt for an AI image generator describing an " +
            "eye-catching thumbnail that represents the video (incorporating the visual style described). Respond with ONLY a JSON object matching the schema.",
        },
        {
          role: "user",
          content: [
            `Title: ${project.title}`,
            `Topic: ${project.topic}`,
            `Audience: ${project.audience}`,
            `Style: ${project.style}${styleBible ? ` (${styleBible.style}, ${styleBible.characterStyle})` : ""}`,
            `Duration: ${project.duration}s`,
            `Video type: ${project.videoType}`,
            "",
            "Script:",
            scriptSummary || "(no script yet - infer from the topic)",
          ].join("\n"),
        },
      ],
      YoutubeMetaSchema
    );

    await ProjectService.setYoutubeMeta(ctx.projectId, meta);
    await ProjectStorage.writeJson(ctx.projectId, "youtube-metadata.json", meta);

    let thumbnailAsset;
    if (input.generateThumbnailImage !== false) {
      const provider = getImageProvider();
      const aspectRatio = input.thumbnailAspectRatio ?? (project.aspectRatio as "16:9" | "9:16" | "1:1");
      const resolution = aspectRatioToResolution(aspectRatio, project.resolution);

      const generationHash = computeGenerationHash({ type: "THUMBNAIL", provider: provider.name, prompt: meta.thumbnailPrompt, resolution });
      const cached = await AssetService.findCached(ctx.projectId, undefined, "THUMBNAIL", generationHash);

      if (cached) {
        thumbnailAsset = cached;
      } else {
        const version = await AssetService.nextVersion(ctx.projectId, undefined, "THUMBNAIL");
        const outputPath = ProjectStorage.absolutePath(ctx.projectId, `thumbnails/youtube-thumbnail-v${version}.png`);
        const result = await provider.generateImage({ prompt: meta.thumbnailPrompt, aspectRatio, resolution }, outputPath);
        thumbnailAsset = await AssetService.record({
          projectId: ctx.projectId,
          type: "THUMBNAIL",
          provider: result.provider,
          isMock: result.isMock,
          prompt: meta.thumbnailPrompt,
          filePath: result.filePath,
          generationHash,
          metadata: { resolution, aspectRatio, source: "youtube_metadata" },
        });
      }
    }

    return {
      youtubeMeta: meta,
      thumbnailAsset: thumbnailAsset ? serializeAsset(thumbnailAsset) : undefined,
    };
  },
};

function aspectRatioToResolution(aspectRatio: "16:9" | "9:16" | "1:1", fallback: string): string {
  switch (aspectRatio) {
    case "16:9":
      return "1280x720"; // YouTube's recommended thumbnail size
    case "9:16":
      return "1080x1920";
    case "1:1":
      return "1080x1080";
    default:
      return fallback;
  }
}
