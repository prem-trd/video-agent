import { PrismaClient } from "@prisma/client";
import { env } from "../utils/env.js";

// Single Prisma client instance for the whole process.
export const prisma = new PrismaClient({
  log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
