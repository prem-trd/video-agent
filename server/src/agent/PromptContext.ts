import { ProjectService } from "../services/ProjectService.js";
import { CharacterService } from "../services/CharacterService.js";

/**
 * Builds the shared "creative context" block (project config + style bible
 * + character bible) that every generation tool (script, scene plan,
 * visual/video prompts) feeds into its LLM call so output stays
 * consistent across scenes (spec #14/#15: character and style consistency).
 */
export async function buildCreativeContext(projectId: string): Promise<string> {
  const project = await ProjectService.get(projectId);
  const styleBible = await ProjectService.getStyleBible(projectId);
  const characters = await CharacterService.list(projectId);

  const lines = [
    `Title: ${project.title}`,
    `Topic: ${project.topic}`,
    `Audience: ${project.audience}`,
    `Language: ${project.language}`,
    `Target duration: ${project.duration}s`,
    `Aspect ratio: ${project.aspectRatio}`,
    `Video type: ${project.videoType}`,
  ];

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

  return lines.filter(Boolean).join("\n");
}
