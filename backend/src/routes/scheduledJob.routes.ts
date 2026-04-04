import { Router } from "express";
import { body, param, query } from "express-validator";
import { validate } from "../middleware/validation.middleware.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import * as scheduledJobController from "../controllers/scheduledJob.controller.js";

const router = Router();
router.use(authMiddleware);

router.get(
  "/",
  validate([
    query("assistantId").optional().isMongoId(),
    query("enabled").optional().isIn(["true", "false"]),
    query("search").optional().isString(),
  ]),
  scheduledJobController.listScheduledJobs,
);

router.post(
  "/",
  validate([
    body("name").trim().notEmpty(),
    body("assistantId").isMongoId(),
    body("scheduleKind").optional().isIn(["interval", "cron"]),
    body("intervalMinutes").optional().isInt({ min: 1, max: 59 }),
    body("cronExpression").optional().isString(),
    body("timezone").optional().isString(),
    body("taskPrompt").trim().notEmpty(),
    body("sessionMode").optional().isIn(["isolated", "main"]),
    body("wakeMode").optional().isIn(["now", "next_heartbeat"]),
    body("resultDelivery").optional().isIn(["announce", "none"]),
    body("channelSelection").optional().isIn(["last", "specific", "playground"]),
    body("channelId").optional().isMongoId(),
    body("timeoutSeconds").optional().isInt({ min: 1, max: 3600 }),
  ]),
  scheduledJobController.createScheduledJob,
);

router.get(
  "/:id",
  validate([param("id").isMongoId()]),
  scheduledJobController.getScheduledJob,
);

router.patch(
  "/:id",
  validate([
    param("id").isMongoId(),
    body("name").optional().trim().notEmpty(),
    body("assistantId").optional().isMongoId(),
    body("intervalMinutes").optional().isInt({ min: 1, max: 59 }),
    body("timeoutSeconds").optional().isInt({ min: 1, max: 3600 }),
    body("channelSelection").optional().isIn(["last", "specific", "playground"]),
  ]),
  scheduledJobController.updateScheduledJob,
);

router.delete(
  "/:id",
  validate([param("id").isMongoId()]),
  scheduledJobController.deleteScheduledJob,
);

router.post(
  "/:id/clone",
  validate([param("id").isMongoId()]),
  scheduledJobController.cloneScheduledJob,
);

router.post(
  "/:id/run",
  validate([param("id").isMongoId(), body("ifDue").optional().isBoolean()]),
  scheduledJobController.runJobNow,
);

router.get(
  "/:id/runs",
  validate([
    param("id").isMongoId(),
    query("limit").optional().isInt({ min: 1, max: 200 }),
    query("offset").optional().isInt({ min: 0 }),
  ]),
  scheduledJobController.listScheduledJobRuns,
);

export default router;
