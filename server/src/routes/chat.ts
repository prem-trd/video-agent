import { Router } from "express";
import { z } from "zod";
import { videoAgent } from "../agent/VideoAgent.js";
import { AppError } from "../utils/errors.js";
import { childLogger } from "../utils/logger.js";
import { prisma } from "../database/prisma.js";

const log = childLogger({ module: "chat-route" });
export const chatRouter = Router({ mergeParams: true });

const ChatSchema = z.object({ message: z.string().min(1) });

chatRouter.post("/", async (req, res) => {
  try {
    const { message } = ChatSchema.parse(req.body);
    const { id: projectId } = req.params as { id: string };
    const result = await videoAgent.handleChatMessage(projectId, message);
    res.json(result);
  } catch (err) {
    const appErr = AppError.from(err);
    log.error({ err: appErr.toJSON() }, "Chat turn failed");
    const status = appErr.code === "NOT_FOUND" ? 404 : appErr.code === "VALIDATION_ERROR" ? 400 : 500;
    res.status(status).json({ error: appErr.toJSON() });
  }
});

chatRouter.get("/", async (req, res) => {
  const { id: projectId } = req.params as { id: string };
  const messages = await prisma.chatMessage.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  res.json(messages);
});
