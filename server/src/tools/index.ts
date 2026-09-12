import { ToolRegistry } from "./registry.js";
import { readProjectTool } from "./planning/readProject.js";
import { updateProjectTool } from "./planning/updateProject.js";
import { analyzeRequestTool } from "./planning/analyzeRequest.js";
import { createVideoPlanTool } from "./planning/createVideoPlan.js";
import { updateCharacterBibleTool } from "./planning/updateCharacterBible.js";
import { updateStyleBibleTool } from "./planning/updateStyleBible.js";
import { generateYoutubeMetadataTool } from "./planning/generateYoutubeMetadata.js";
import { generateScriptTool } from "./script/generateScript.js";
import { createScenePlanTool } from "./scenes/createScenePlan.js";
import { generateVisualPromptTool } from "./scenes/generateVisualPrompt.js";
import { generateVideoPromptTool } from "./scenes/generateVideoPrompt.js";
import { updateSceneTool } from "./scenes/updateScene.js";
import { generateImageTool } from "./media/generateImage.js";
import { generateVideoTool } from "./media/generateVideo.js";
import { listAssetsTool } from "./media/listAssets.js";
import { generateAllSceneMediaTool } from "./media/generateAllSceneMedia.js";
import { generateVoiceTool } from "./audio/generateVoice.js";
import { generateMusicTool } from "./audio/generateMusic.js";
import { mergeVideosTool } from "./media/mergeVideos.js";
import { addAudioTool } from "./audio/addAudio.js";
import { addMusicTool } from "./audio/addMusic.js";
import { generateSubtitlesTool } from "./audio/generateSubtitles.js";
import { addSubtitlesTool } from "./audio/addSubtitles.js";
import { createThumbnailTool } from "./media/createThumbnail.js";
import { validateVideoTool } from "./validation/validateVideo.js";

/**
 * Builds the tool registry available to the agent. Grows phase by phase
 * without ever touching AgentLoop - new tools just get registered here.
 */
export function buildToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // project-level
  registry.register(readProjectTool);
  registry.register(updateProjectTool);
  registry.register(analyzeRequestTool);

  // planning / bibles (Phase 3)
  registry.register(createVideoPlanTool);
  registry.register(updateCharacterBibleTool);
  registry.register(updateStyleBibleTool);
  registry.register(generateYoutubeMetadataTool);

  // script & scenes (Phase 3)
  registry.register(generateScriptTool);
  registry.register(createScenePlanTool);
  registry.register(generateVisualPromptTool);
  registry.register(generateVideoPromptTool);
  registry.register(updateSceneTool);

  // media & audio generation (Phase 4)
  registry.register(generateImageTool);
  registry.register(generateVideoTool);
  registry.register(listAssetsTool);
  registry.register(generateAllSceneMediaTool);
  registry.register(generateVoiceTool);
  registry.register(generateMusicTool);

  // assembly & validation (Phase 5)
  registry.register(mergeVideosTool);
  registry.register(addAudioTool);
  registry.register(addMusicTool);
  registry.register(generateSubtitlesTool);
  registry.register(addSubtitlesTool);
  registry.register(createThumbnailTool);
  registry.register(validateVideoTool);

  return registry;
}

/**
 * The single shared registry instance used by both the agent loop (via
 * VideoAgent's default constructor param) and any route that needs to run
 * a tool directly (e.g. a UI-triggered "regenerate this scene" button) -
 * so a manual regeneration goes through the exact same caching/versioning
 * code path as an LLM-triggered one.
 */
export const toolRegistry = buildToolRegistry();
