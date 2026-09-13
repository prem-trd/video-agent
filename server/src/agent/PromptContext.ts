import { ProjectService } from "../services/ProjectService.js";
import { CharacterService } from "../services/CharacterService.js";
import { EnvironmentService } from "../services/EnvironmentService.js";

/**
 * Builds the shared "creative context" block (project config + style bible
 * + character bible + environment bible + story context) that every
 * generation tool (story structure, scene prompts, regenerate) feeds into
 * its LLM call so output stays consistent across scenes - this is the
 * project's continuity system.
 */
export async function buildCreativeContext(projectId: string): Promise<string> {
  const project = await ProjectService.get(projectId);
  const styleBible = await ProjectService.getStyleBible(projectId);
  const characters = await CharacterService.list(projectId);
  const environments = await EnvironmentService.list(projectId);

  const lines = [
    `Title: ${project.title}`,
    `Topic: ${project.topic}`,
    `Audience: ${project.audience}`,
    `Language: ${project.language}`,
    `Media type: ${project.mediaType}`,
    `Target duration: ${project.duration}s`,
    project.mediaType === "IMAGE" ? `Image display duration: ${project.imageDurationSec}s` : `Clip duration: ${project.clipDurationSec}s`,
    `Aspect ratio: ${project.aspectRatio}`,
    `Narration required: ${project.narrationRequired}`,
    `Music required (uploaded separately, not generated here): ${project.musicRequired}`,
  ];

  if (project.storyContext) {
    lines.push("", "Story context (overall narrative arc - keep every scene consistent with this):", project.storyContext);
  }

  if (styleBible) {
    lines.push(
      "",
      "Style Bible (apply consistently to every scene's visuals):",
      `- style: ${styleBible.style}`,
      `- lighting: ${styleBible.lighting}`,
      `- camera: ${styleBible.camera}`,
      `- environment: ${styleBible.environment}`,
      `- characterStyle: ${styleBible.characterStyle}`,
      styleBible.colorDirection ? `- colorDirection: ${styleBible.colorDirection}` : "",
      styleBible.renderingStyle ? `- renderingStyle: ${styleBible.renderingStyle}` : ""
    );
  } else {
    lines.push("", "Style Bible: (none set yet - use judgement consistent with the project's style field)");
  }

  if (characters.length > 0) {
    lines.push("", "Character Bible (reuse these EXACT descriptions whenever these characters appear):");
    for (const c of characters) {
      lines.push(`- ${c.characterKey} "${c.name}": ${c.appearance}. Personality: ${c.personality}.`);
    }
  }

  if (environments.length > 0) {
    lines.push("", "Environment Bible (reuse these EXACT descriptions whenever these settings appear):");
    for (const e of environments) {
      lines.push(`- ${e.environmentKey} "${e.name}": ${e.description}. Lighting: ${e.lighting}.`);
    }
  }

  return lines.filter(Boolean).join("\n");
}
