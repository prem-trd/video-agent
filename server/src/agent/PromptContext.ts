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
// A Style Bible written before the project's style was fed into the context
// can contradict it (e.g. "flat colors, simple shapes" in a 3D Cartoon
// project), and the LLM copies it verbatim into every prompt - strip 2D
// terms from a 3D project's bible so the chosen style always wins.
const TWO_D_TERMS = /\b(flat[- ]colou?rs?|flat[- ](illustration|design|shading|style)|simple (geometric )?shapes|vector( art| style)?|2D)\b,?\s*/gi;

function styleText(value: string | undefined, is3D: boolean): string {
  if (!value || !is3D) return value ?? "";
  return value.replace(TWO_D_TERMS, "").replace(/\s*,\s*(,|$)/g, "$1").trim();
}

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
    `Visual style (chosen by the user - every Style Bible field and every prompt MUST match it; never switch 2D/3D): ${project.style}`,
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
    const is3D = /3d/i.test(project.style);
    const st = (v: string | undefined) => styleText(v, is3D);
    lines.push(
      "",
      "Style Bible (apply consistently to every scene's visuals):",
      `- style: ${st(styleBible.style)}`,
      `- lighting: ${st(styleBible.lighting)}`,
      `- camera: ${st(styleBible.camera)}`,
      `- environment: ${st(styleBible.environment)}`,
      `- characterStyle: ${st(styleBible.characterStyle)}`,
      styleBible.colorDirection ? `- colorDirection: ${st(styleBible.colorDirection)}` : "",
      styleBible.renderingStyle ? `- renderingStyle: ${st(styleBible.renderingStyle)}` : ""
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
