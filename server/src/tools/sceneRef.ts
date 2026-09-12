import { z } from "zod";
import { looseOptional } from "../utils/zodHelpers.js";

/**
 * Shared "identify a scene by id or number" input fragment, used by every
 * tool that targets a single scene. Both fields go through looseOptional
 * so a model sending "" for the unused one (observed with gpt-oss:120b,
 * which fills in every schema property rather than omitting unused
 * optionals) doesn't fail validation.
 */
export const sceneRefFields = {
  sceneId: looseOptional(z.string().min(1)).describe("The scene's internal id, if known."),
  sceneNumber: looseOptional(z.number().int().positive()).describe("The scene's number (e.g. 3), if sceneId is not known."),
};

export function requireSceneRef(v: { sceneId?: string; sceneNumber?: number }): boolean {
  return Boolean(v.sceneId) || v.sceneNumber !== undefined;
}

export const SCENE_REF_ERROR = "Either sceneId or sceneNumber is required.";
