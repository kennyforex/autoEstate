import { Router } from "express";
import { query } from "express-validator";
import { validate } from "../middleware/validation.middleware.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { aiLogger } from "../services/aiLogger.service.js";
import type { Request, Response } from "express";

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get AI logs
router.get(
  "/",
  validate([
    query("type")
      .optional()
      .isIn([
        "classification",
        "simple_reply",
        "complex_reply",
        "media_analysis",
        "decision",
        "tool_calling",
        "error",
        "info",
      ])
      .withMessage("Invalid log type"),
    query("level")
      .optional()
      .isIn(["info", "warn", "error"])
      .withMessage("Invalid log level"),
    query("conversationId")
      .optional()
      .isMongoId()
      .withMessage("Invalid conversation ID"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 500 })
      .withMessage("Limit must be between 1 and 500"),
    query("offset")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Offset must be a positive integer"),
  ]),
  async (req: Request, res: Response) => {
    try {
      const { type, level, conversationId, limit, offset } = req.query;

      const result = await aiLogger.getLogs({
        type: type as any,
        level: level as any,
        conversationId: conversationId as string,
        limit: limit ? parseInt(limit as string) : 100,
        offset: offset ? parseInt(offset as string) : 0,
      });

      res.json(result);
    } catch (error: any) {
      console.error("[AI Logs Route] Error fetching logs:", error);
      res.status(500).json({ error: "Failed to fetch AI logs" });
    }
  },
);

// Get AI log statistics
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await aiLogger.getStats();
    res.json(stats);
  } catch (error: any) {
    console.error("[AI Logs Route] Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch AI log statistics" });
  }
});

// Clear all logs (for development/debugging)
router.delete("/", async (_req: Request, res: Response) => {
  try {
    await aiLogger.clearLogs();
    res.json({ message: "Logs cleared" });
  } catch (error: any) {
    console.error("[AI Logs Route] Error clearing logs:", error);
    res.status(500).json({ error: "Failed to clear AI logs" });
  }
});

export default router;
