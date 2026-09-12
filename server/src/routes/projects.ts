import { Router } from "express";
import { z } from "zod";
import { ProjectService, serializeProject } from "../services/ProjectService.js";
import { AppError } from "../utils/errors.js";
import { childLogger } from "../utils/logger.js";

const log = childLogger({ module: "projects-route" });
export const projectsRouter = Router();

const CreateProjectSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  topic: z.string().optional(),
  duration: z.number().int().positive().max(3600).optional(),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
  resolution: z.string().optional(),
  fps: z.number().int().positive().optional(),
  language: z.string().optional(),
  audience: z.string().optional(),
  style: z.string().optional(),
  videoType: z.string().optional(),
});

function handleError(err: unknown, res: import("express").Response) {
  const appErr = AppError.from(err);
  log.error({ err: appErr.toJSON() }, "Project route error");
  const status = appErr.code === "NOT_FOUND" ? 404 : appErr.code === "VALIDATION_ERROR" ? 400 : 500;
  res.status(status).json({ error: appErr.toJSON() });
}

projectsRouter.post("/", async (req, res) => {
  try {
    const input = CreateProjectSchema.parse(req.body);
    const project = await ProjectService.create(input);
    res.status(201).json(serializeProject(project));
  } catch (err) {
    handleError(err, res);
  }
});

projectsRouter.get("/", async (_req, res) => {
  try {
    const projects = await ProjectService.list();
    res.json(projects.map(serializeProject));
  } catch (err) {
    handleError(err, res);
  }
});

projectsRouter.get("/:id", async (req, res) => {
  try {
    const project = await ProjectService.get(req.params.id);
    res.json(serializeProject(project));
  } catch (err) {
    handleError(err, res);
  }
});

projectsRouter.delete("/:id", async (req, res) => {
  try {
    await ProjectService.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    handleError(err, res);
  }
});
