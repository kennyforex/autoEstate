import { Router } from "express";
import { query, param } from "express-validator";
import { validate } from "../middleware/validation.middleware.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  skillTasksService,
  SKILL_TASKS_TOKENS_NOTE,
} from "../services/skillTasks.service.js";
import type { Request, Response } from "express";

const router = Router();

router.use(authMiddleware);

function parseOptionalDate(s: unknown): Date | undefined {
  if (typeof s !== "string" || !s.trim()) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

router.get(
  "/",
  validate([
    query("status")
      .optional()
      .isIn(["active", "suspended", "completed"])
      .withMessage("Invalid status"),
    query("skillSlug").optional().isString().trim(),
    query("conversationId").optional().isMongoId(),
    query("channelId").optional().isMongoId(),
    query("createdFrom").optional().isISO8601(),
    query("createdTo").optional().isISO8601(),
    query("completedFrom").optional().isISO8601(),
    query("completedTo").optional().isISO8601(),
    query("search").optional().isString().trim(),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 200 })
      .withMessage("Limit must be 1–200"),
    query("offset")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Offset must be >= 0"),
  ]),
  async (req: Request, res: Response) => {
    try {
      const {
        status,
        skillSlug,
        conversationId,
        channelId,
        createdFrom,
        createdTo,
        completedFrom,
        completedTo,
        search,
        limit,
        offset,
      } = req.query;

      const result = await skillTasksService.list(
        {
          ...(status ? { status: status as "active" | "suspended" | "completed" } : {}),
          ...(skillSlug ? { skillSlug: String(skillSlug) } : {}),
          ...(conversationId ? { conversationId: String(conversationId) } : {}),
          ...(channelId ? { channelId: String(channelId) } : {}),
          ...(parseOptionalDate(createdFrom)
            ? { createdFrom: parseOptionalDate(createdFrom) }
            : {}),
          ...(parseOptionalDate(createdTo)
            ? { createdTo: parseOptionalDate(createdTo) }
            : {}),
          ...(parseOptionalDate(completedFrom)
            ? { completedFrom: parseOptionalDate(completedFrom) }
            : {}),
          ...(parseOptionalDate(completedTo)
            ? { completedTo: parseOptionalDate(completedTo) }
            : {}),
          ...(search ? { search: String(search) } : {}),
        },
        {
          limit: limit ? parseInt(String(limit), 10) : undefined,
          offset: offset ? parseInt(String(offset), 10) : undefined,
        },
      );

      res.json({
        tasks: result.tasks,
        total: result.total,
        tokensNote: SKILL_TASKS_TOKENS_NOTE,
      });
    } catch (error: unknown) {
      console.error("[SkillTasks] list error:", error);
      res.status(500).json({ error: "Failed to fetch skill tasks" });
    }
  },
);

router.get(
  "/:conversationId/:goalId",
  validate([
    param("conversationId").isMongoId().withMessage("Invalid conversation ID"),
    param("goalId").isString().trim().notEmpty(),
  ]),
  async (req: Request, res: Response) => {
    try {
      const { conversationId, goalId } = req.params;
      const detail = await skillTasksService.getDetail(conversationId, goalId);
      if (!detail) {
        res.status(404).json({ error: "Skill task not found" });
        return;
      }
      res.json(detail);
    } catch (error: unknown) {
      console.error("[SkillTasks] detail error:", error);
      res.status(500).json({ error: "Failed to fetch skill task detail" });
    }
  },
);

export default router;
