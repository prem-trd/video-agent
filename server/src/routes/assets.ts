import { Router } from "express";
import { AssetService, serializeAsset } from "../services/AssetService.js";
import { AppError } from "../utils/errors.js";
import { childLogger } from "../utils/logger.js";

const log = childLogger({ module: "assets-route" });
export const assetsRouter = Router({ mergeParams: true });

assetsRouter.get("/", async (req, res) => {
  try {
    const { id: projectId } = req.params as { id: string };
    const { sceneId, type } = req.query as { sceneId?: string; type?: string };
    const assets = sceneId
      ? await AssetService.listForScene(projectId, sceneId, type as any)
      : (await AssetService.listForProject(projectId)).filter((a) => !type || a.type === type);
    res.json(assets.map(serializeAsset));
  } catch (err) {
    const appErr = AppError.from(err);
    log.error({ err: appErr.toJSON() }, "Assets route error");
    res.status(500).json({ error: appErr.toJSON() });
  }
});
