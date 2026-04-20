import { Router } from "express";
import authRoutes from "./auth.routes.js";
import assistantRoutes from "./assistant.routes.js";
import channelRoutes from "./channel.routes.js";
import conversationRoutes from "./conversation.routes.js";
import contactRoutes from "./contact.routes.js";
import clientGroupRoutes from "./clientGroup.routes.js";
import tagRoutes from "./tag.routes.js";
import productRoutes from "./product.routes.js";
import webhookRoutes from "./webhook.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import mediaRoutes from "./media.routes.js";
import uploadRoutes from "./upload.routes.js";
import aiLogsRoutes from "./aiLogs.routes.js";
import companyRoutes from "./company.routes.js";
import userRoutes from "./user.routes.js";
import skillRoutes from "./skill.routes.js";
import googleRoutes from "./google.routes.js";
import cronRoutes from "./cron.routes.js";
import scheduledJobRoutes from "./scheduledJob.routes.js";
import skillTasksRoutes from "./skillTasks.routes.js";
import { notFoundHandler } from "../middleware/error.middleware.js";

const router = Router();

// API routes
router.use("/auth", authRoutes);
router.use("/assistants", assistantRoutes);
router.use("/channels", channelRoutes);
router.use("/conversations", conversationRoutes);
router.use("/contacts", contactRoutes);
router.use("/client-groups", clientGroupRoutes);
router.use("/products", productRoutes);
router.use("/tags", tagRoutes);
router.use("/webhooks", webhookRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/media", mediaRoutes);
router.use("/upload", uploadRoutes);
router.use("/ai-logs", aiLogsRoutes);
router.use("/company", companyRoutes);
router.use("/users", userRoutes);
router.use("/skills", skillRoutes);
router.use("/google", googleRoutes);
router.use("/cron", cronRoutes);
router.use("/scheduled-jobs", scheduledJobRoutes);
router.use("/skill-tasks", skillTasksRoutes);

// 404 handler for API routes
router.use(notFoundHandler);

export default router;
