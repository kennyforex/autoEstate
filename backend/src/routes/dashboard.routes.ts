import { Router } from "express";
import { query } from "express-validator";
import { validate } from "../middleware/validation.middleware.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import * as dashboardController from "../controllers/dashboard.controller.js";

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get dashboard metrics
router.get(
  "/metrics",
  validate([
    query("startDate").optional().isISO8601().withMessage("Invalid start date"),
    query("endDate").optional().isISO8601().withMessage("Invalid end date"),
    query("channelId").optional().isMongoId().withMessage("Invalid channel ID"),
  ]),
  dashboardController.getMetrics,
);

// Get AI insights
router.get("/insights", dashboardController.getInsights);

// Get channel statistics
router.get("/channels", dashboardController.getChannelStats);

// Get AI performance metrics
router.get("/ai-performance", dashboardController.getAIPerformance);

export default router;
