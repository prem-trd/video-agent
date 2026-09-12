import { prisma } from "../database/prisma.js";
import { ProjectService } from "../services/ProjectService.js";
import type { ChatMessage } from "../llm/types.js";

/**
 * Project memory (spec #27): the agent must remember project configuration,
 * style/character bibles, script, scenes, and conversation history so a
 * follow-up like "make scene 3 more playful" resolves against real state
 * instead of the model hallucinating context.
 */
export class AgentMemory {
  static async buildSystemPrompt(projectId: string): Promise<string> {
    const project = await ProjectService.get(projectId);
    const characters = await prisma.character.findMany({ where: { projectId } });
    const scenes = await prisma.scene.findMany({ where: { projectId }, orderBy: { sceneNumber: "asc" } });

    const styleBible = await ProjectService.getStyleBible(projectId);

    const lines = [
      "You are the agent brain inside AI Video Studio, a local application that plans, generates, assembles and revises short videos.",
      "You control execution ONLY through the tools available to you. You never fabricate results - if you need something done (planning, scripting, media generation, assembly), call the appropriate tool.",
      "Work incrementally: call one tool, look at its real result, then decide the next step. Do not claim something is done unless a tool result confirms it.",
      "",
      "For a full new video, the typical pipeline is: analyze_request (if the request is freeform) -> update_project (apply extracted config) -> create_video_plan (writes the Style Bible) -> generate_script (writes narration scenes + character bible) -> create_scene_plan (fills in imagePrompt/videoPrompt/visualDescription/animationDirection/cameraDirection for EVERY scene in one batched call) -> generate_all_scene_media (generates video+voice for every scene in ONE call) -> generate_music once for the whole project.",
      "generate_all_scene_media does what generate_video + generate_voice would do for every scene, but in a single tool call - ALWAYS prefer it over calling generate_video/generate_voice scene-by-scene for the initial full-pipeline run. Only fall back to the individual generate_video / generate_voice / generate_image tools for a targeted single-scene regeneration (e.g. 'regenerate scene 5').",
      "IMPORTANT - budget your tool calls: you get a limited number of iterations per turn. Call generate_script exactly ONCE per project - it already clamps scene duration to a sane minimum and will refuse to create absurdly many tiny scenes (e.g. it will NOT create one scene per letter for an alphabet video if that would make scenes too short - it groups items per scene instead), so do not call it again 'to check' or to retry a different scene count; use its result. Do not call read_project between routine pipeline steps just to verify - only call it when you actually need to see current state to decide something.",
      "Once every scene has video and voice, assemble the final video in this exact order: merge_videos (concatenates scene videos) -> add_audio (concatenates + muxes narration) -> add_music (mixes in the music bed - needs generate_music already done) -> generate_subtitles (writes SRT/VTT from narration timing) -> add_subtitles (produces the final render) -> validate_video (checks the result and reports issues). Each assembly tool tells you exactly which prior step is missing if you run it out of order - fix that and retry the SAME tool rather than improvising a workaround.",
      "Use list_assets to check what's already generated before deciding what's next, especially after a pause or when resuming a project.",
      "When asked for a YouTube title/description/tags/thumbnail (or 'prepare this for YouTube'), call generate_youtube_metadata - it does not upload anything, only prepares content and (by default) a stylized thumbnail image.",
      "IMPORTANT: never author scene visualDescription, imagePrompt, videoPrompt, animationDirection or cameraDirection yourself in your own response text and then paste them in via update_scene one scene at a time - that is create_scene_plan's job and it does all scenes in a single call. If a tool call fails, look at the error and retry that SAME tool with corrected input; do not route around a failing tool by hand-crafting its output through a different, less-suited tool.",
      "update_scene is only for small, targeted single-field edits to a scene that already has its scene plan (e.g. 'make scene 4 seven seconds', 'change the transition on scene 2'). generate_visual_prompt / generate_video_prompt are for regenerating one scene's prompts after the initial scene plan already exists.",
      "generate_video/generate_image/generate_voice cache by default (identical prompt+settings reuse the existing asset instead of regenerating - useful when resuming a paused pipeline). When the user explicitly asks to regenerate something that hasn't otherwise changed (e.g. 'regenerate scene 5', 'try that again'), pass force:true so a genuinely new version is created instead of just returning the same cached asset.",
      "If the request is missing important information (topic, audience, duration), ask the user a short clarifying question instead of guessing wildly - but reasonable defaults are fine for minor details.",
      "",
      "=== CURRENT PROJECT ===",
      `id: ${project.id}`,
      `title: ${project.title}`,
      `topic: ${project.topic}`,
      `description: ${project.description || "(none yet)"}`,
      `duration: ${project.duration}s`,
      `aspectRatio: ${project.aspectRatio}  resolution: ${project.resolution}  fps: ${project.fps}`,
      `language: ${project.language}  audience: ${project.audience}  style: ${project.style}  videoType: ${project.videoType}`,
      `status: ${project.status}  agentState: ${project.agentState}`,
    ];

    if (scenes.length > 0) {
      lines.push("", `=== SCENES (${scenes.length}) ===`);
      for (const s of scenes) {
        lines.push(`#${s.sceneNumber} [${s.status}] ${s.duration}s - narration: "${s.narration.slice(0, 80)}"`);
      }
    } else {
      lines.push("", "=== SCENES ===", "(no scenes yet)");
    }

    if (characters.length > 0) {
      lines.push("", `=== CHARACTER BIBLE (${characters.length}) ===`);
      for (const c of characters) {
        lines.push(`${c.characterKey}: ${c.name} - ${c.appearance}`);
      }
    }

    if (styleBible) {
      lines.push(
        "",
        "=== STYLE BIBLE ===",
        `style: ${styleBible.style}  lighting: ${styleBible.lighting}  camera: ${styleBible.camera}`,
        `environment: ${styleBible.environment}  characterStyle: ${styleBible.characterStyle}`
      );
    } else {
      lines.push("", "=== STYLE BIBLE ===", "(not created yet - call create_video_plan)");
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
