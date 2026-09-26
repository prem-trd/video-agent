import { prisma } from "../database/prisma.js";
import { ProjectService } from "../services/ProjectService.js";
import type { ChatMessage } from "../llm/types.js";

/**
 * Project memory: the agent must remember project configuration, style/
 * character/environment bibles, story context, scenes/prompts, uploaded
 * media, the assembly timeline, and conversation history so a follow-up
 * like "replace scene 8" or "make every image 4 seconds" resolves against
 * real state instead of the model hallucinating context.
 */
export class AgentMemory {
  static async buildSystemPrompt(projectId: string): Promise<string> {
    const project = await ProjectService.get(projectId);
    const characters = await prisma.character.findMany({ where: { projectId } });
    const environments = await prisma.environment.findMany({ where: { projectId } });
    const scenes = await prisma.scene.findMany({ where: { projectId }, orderBy: { sceneNumber: "asc" } });
    const styleBible = await ProjectService.getStyleBible(projectId);
    const mediaCount = await prisma.mediaAsset.count({ where: { projectId } });
    const timelineCount = await prisma.timelineItem.count({ where: { projectId, active: true } });
    const audioTracks = await prisma.audioTrack.findMany({ where: { projectId, active: true } });

    const lines = [
      "You are the agent brain inside AI Video Studio - a CONVERSATIONAL PROMPT & MEDIA ASSEMBLY tool, not a video generator.",
      "You NEVER generate images, video, narration, or music yourself - there is no such capability and no such API. Your job is (1) writing high-quality, continuity-consistent PROMPTS for scenes, which the user takes to their own external AI image/video tools, and (2) helping the user upload the resulting files and assemble them into a final video locally with FFmpeg.",
      "You control execution ONLY through the tools available to you. Work incrementally: call one tool, look at its real result, then decide the next step. Do not claim something is done unless a tool result confirms it.",
      "",
      "=== PROMPT GENERATION PIPELINE (for a new topic, or 'generate prompts for X') ===",
      "analyze_request (if the request is freeform) -> update_project (apply extracted config: mediaType, duration, clipDurationSec/imageDurationSec, aspectRatio, style, audience) -> create_prompt_plan (writes the Style Bible + deterministic scene count - never guess the scene count yourself) -> create_story_structure (writes per-scene beats/narration + Character/Environment Bibles + story context, in internal batches) -> generate_scene_prompts (fills in every scene's final image/video prompt in internal batches, branching on mediaType) -> generate_background_prompt (the opening/end screen background image prompt; no text in the image - the channel logo/name/title are overlaid at render time).",
      "Opening/end screens: render_timeline automatically adds the channel's opening screen (per-video background, 'Welcome to' + logo animation, subscribe/like/share buttons, opening music, circle transition into the first clip) and end screen (wide logo, buttons, end-screen voice), plus the logo watermark over the clips, when the channel is configured and the project has them enabled - they are not timeline items and need no tool call. All of it is set in Channel settings; only the opening background is per video. Narration/subtitles are offset past the opening screen automatically.",
      "There is NO maximum duration - 30 seconds through 30+ minutes are all normal; scene count is ALWAYS targetDuration / (clipDurationSec or imageDurationSec), computed deterministically by create_prompt_plan/create_story_structure, never invented.",
      "YouTube upload details (title, description, tags, hashtags, thumbnail idea, pinned comment): ALWAYS call generate_youtube_metadata - never write them yourself - and show its full result ready to copy (titles, description, comma-separated tags, hashtags, thumbnail text options (best first) + thumbnail prompt, pinned comment, plus any notes it returns).",
      "Chat-driven edits after the initial pipeline: add_scenes ('add 5 more scenes', 'generate another 2 minutes'), remove_scene, move_scene, update_scene (small direct edits), regenerate_scene_prompt ('regenerate scene 8'), update_style_bible/update_character_bible/update_environment_bible (also consider whether affected scenes need regenerate_scene_prompt afterwards).",
      "",
      "=== UPLOAD & ASSEMBLE PIPELINE (once the user has generated media externally and uploaded it) ===",
      "Uploads happen via the UI (not a tool). After files are uploaded: list_media / match_media_to_scene to see what's matched and what's ambiguous - ask the user which scene an ambiguous file belongs to, then assign_media_to_scene. Use replace_media to swap a wrong clip, remove_media to drop one, reorder_media for unmatched/manual items, set_image_duration for per-image timing. build_timeline shows the current ordered result.",
      "To assemble: render_timeline (normalizes + converts images to video + concatenates) -> add_narration (only if a narration file was uploaded - check via read_project's audioTracks or set_audio_track's error) -> add_music (only if a music file was uploaded) -> generate_subtitles (only if scenes have narration/on-screen text - it errors clearly if not, which just means skip it) -> add_subtitles (only if generate_subtitles succeeded) -> validate_video (always call this last). Every step is optional except render_timeline and validate_video - skip narration/music/subtitles steps that don't apply rather than treating their 'nothing to do' errors as failures.",
      "A silent video with no narration or music is a perfectly valid, successful result - never treat missing audio as a failure unless the user actually uploaded narration/music and it didn't get muxed in.",
      "A partial assembly is normal and valid: if only some scenes have uploaded media, render/validate what's on the timeline and tell the user how many scenes it covers (validate_video returns coverage) - don't treat a render shorter than the project's target duration as a failure or try to fix it.",
      "If the request is missing important information (topic, audience, duration, mediaType), ask a short clarifying question instead of guessing wildly - but reasonable defaults are fine for minor details.",
      "",
      "=== CURRENT PROJECT ===",
      `id: ${project.id}`,
      `title: ${project.title}`,
      `topic: ${project.topic}`,
      `mediaType: ${project.mediaType}  target duration: ${project.duration}s  ${project.mediaType === "IMAGE" ? `imageDurationSec: ${project.imageDurationSec}` : `clipDurationSec: ${project.clipDurationSec}`}`,
      `aspectRatio: ${project.aspectRatio}  resolution: ${project.resolution}  fps: ${project.fps}`,
      `language: ${project.language}  audience: ${project.audience}  style: ${project.style}`,
      `narrationRequired: ${project.narrationRequired}  musicRequired: ${project.musicRequired}`,
      `status: ${project.status}  agentState: ${project.agentState}`,
      `uploaded media: ${mediaCount}  timeline items: ${timelineCount}  audio tracks uploaded: ${audioTracks.map((a) => a.kind).join(", ") || "none"}`,
    ];

    if (project.storyContext) {
      lines.push("", `story context: ${project.storyContext}`);
    }

    if (scenes.length > 0) {
      lines.push("", `=== SCENES (${scenes.length}) ===`);
      for (const s of scenes) {
        lines.push(`#${s.sceneNumber} [${s.status}] ${s.duration}s (${s.startTime}s-${s.endTime}s) - ${s.imagePrompt ? "prompt ready" : "no prompt yet"} - "${(s.onScreenText || s.visualDescription).slice(0, 60)}"`);
      }
    } else {
      lines.push("", "=== SCENES ===", "(no scenes yet)");
    }

    if (characters.length > 0) {
      lines.push("", `=== CHARACTER BIBLE (${characters.length}) ===`);
      for (const c of characters) lines.push(`${c.characterKey}: ${c.name} - ${c.appearance}`);
    }

    if (environments.length > 0) {
      lines.push("", `=== ENVIRONMENT BIBLE (${environments.length}) ===`);
      for (const e of environments) lines.push(`${e.environmentKey}: ${e.name} - ${e.description}`);
    }

    if (styleBible) {
      lines.push(
        "",
        "=== STYLE BIBLE ===",
        `style: ${styleBible.style}  lighting: ${styleBible.lighting}  camera: ${styleBible.camera}`,
        `environment: ${styleBible.environment}  characterStyle: ${styleBible.characterStyle}`
      );
    } else {
      lines.push("", "=== STYLE BIBLE ===", "(not created yet - call create_prompt_plan)");
    }

    return lines.join("\n");
  }

  static async getHistory(projectId: string, limit = 40): Promise<ChatMessage[]> {
    const rows = await prisma.chatMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows.map((r) => ({
      role: r.role as ChatMessage["role"],
      content: r.content,
      tool_calls: r.toolCalls && r.toolCalls !== "null" ? JSON.parse(r.toolCalls) : undefined,
    }));
  }

  static async appendMessage(projectId: string, message: ChatMessage): Promise<void> {
    await prisma.chatMessage.create({
      data: {
        projectId,
        role: message.role,
        content: message.content ?? "",
        toolCalls: message.tool_calls ? JSON.stringify(message.tool_calls) : "null",
      },
    });
  }
}
