import { prisma } from "../database/prisma.js";

/**
 * Tracks discrete units of agent work (one per LLM iteration / tool call)
 * as AgentTask rows, so progress and failures are queryable and survive
 * process restarts (spec #5, #32).
 */
export class TaskManager {
  static async start(projectId: string, type: string, input: unknown): Promise<string> {
    const task = await prisma.agentTask.create({
      data: {
        projectId,
        type,
        state: "RUNNING",
        input: JSON.stringify(input ?? {}),
        startedAt: new Date(),
      },
    });
    return task.id;
  }

  static async complete(taskId: string, output: unknown): Promise<void> {
    await prisma.agentTask.update({
      where: { id: taskId },
      data: { state: "COMPLETED", output: JSON.stringify(output ?? {}), finishedAt: new Date() },
    });
  }

  static async fail(taskId: string, error: string, retryCount = 0): Promise<void> {
    await prisma.agentTask.update({
      where: { id: taskId },
      data: { state: "FAILED", error, retryCount, finishedAt: new Date() },
    });
  }

  static async cancelPending(projectId: string): Promise<void> {
    await prisma.agentTask.updateMany({
      where: { projectId, state: { in: ["PENDING", "RUNNING"] } },
      data: { state: "CANCELLED", finishedAt: new Date() },
    });
  }

  static async listForProject(projectId: string) {
    return prisma.agentTask.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  }
}
