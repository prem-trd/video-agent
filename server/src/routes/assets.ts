import { Router } from "express";
import { AssetService, serializeAsset, type AssetType } from "../services/AssetService.js";
import { AppError } from "../utils/errors.js";
import { childLogger } from "../utils/logger.js";

const log = childLogger({ module: "assets-route" });
export const assetsRouter = Router({ mergeParams: true });

/** Internal artifacts only (subtitles/thumbnails) - generated media assets don't exist in this app. */
assetsRouter.get("/", async (req, res) => {
  try {
    const { id: projectId } = req.params as { id: string };
    const { type } = req.query as { type?: AssetType };
    const assets = await AssetService.listForProject(projectId, type);
    res.json(assets.map(serializeAsset));
  } catch (err) {
    const appErr = AppError.from(err);
    log.error({ err: appErr.toJSON() }, "Assets route error");
    res.status(500).json({ error: appErr.toJSON() });
  }
});
