import { Router } from "express";
import { body, param, query } from "express-validator";
import { validate } from "../middleware/validation.middleware.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import * as conversationController from "../controllers/conversation.controller.js";

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get inbox counts
router.get("/counts", conversationController.getInboxCounts);

// Get AI insights
router.get("/insights", conversationController.getAIInsights);

// List conversations with filters
router.get(
  "/",
  validate([
    query("status").optional().isIn(["open", "resolved", "spam"]),
    query("channelId").optional().isMongoId(),
    query("assignedTo").optional().isMongoId(),
    query("aiHandling").optional().isIn(["true", "false"]),
    query("sentiment").optional().isIn(["positive", "neutral", "negative"]),
    query("slaRisk").optional().isIn(["true", "false"]),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("offset").optional().isInt({ min: 0 }),
    query("sortBy").optional().isIn(["lastMessageAt", "createdAt", "priority"]),
    query("sortOrder").optional().isIn(["asc", "desc"]),
    query("tagId").optional().isMongoId(),
  ]),
  conversationController.listConversations,
);

// Get conversation by ID
router.get(
  "/:id",
  validate([
    param("id").isMongoId().withMessage("Invalid conversation ID"),
    query("messages").optional().isIn(["true", "false"]),
  ]),
  conversationController.getConversation,
);

// Update conversation
router.put(
  "/:id",
  validate([
    param("id").isMongoId().withMessage("Invalid conversation ID"),
    body("status").optional().isIn(["open", "resolved", "spam"]),
    body("assignedTo").optional({ nullable: true }).isMongoId(),
    body("category").optional().isString(),
    body("subject").optional().isString(),
    body("tags").optional().isArray(),
    body("tags.*").optional().isMongoId(),
  ]),
  conversationController.updateConversation,
);

// Toggle AI auto-reply for conversation
router.put(
  "/:id/ai-toggle",
  validate([
    param("id").isMongoId().withMessage("Invalid conversation ID"),
    body("enabled").isBoolean().withMessage("Enabled must be a boolean"),
  ]),
  conversationController.toggleAIAutoReply,
);

// Send message in conversation
router.post(
  "/:id/messages",
  validate([
    param("id").isMongoId().withMessage("Invalid conversation ID"),
    body("content").notEmpty().withMessage("Content is required"),
    body("contentType")
      .optional()
      .isIn([
        "text",
        "image",
        "audio",
        "document",
        "location",
        "video",
        "gif",
        "sticker",
      ]),
    // Allow both regular URLs and data URLs (for clipboard images)
    body("mediaUrl")
      .optional()
      .custom((value) => {
        if (!value) return true;
        // Allow data URLs (base64 images)
        if (value.startsWith("data:")) return true;
        // Allow regular URLs
        try {
          new URL(value);
          return true;
        } catch {
          throw new Error("Invalid URL format");
        }
      }),
  ]),
  conversationController.sendMessage,
);

// Mark conversation as read
router.post(
  "/:id/read",
  validate([param("id").isMongoId().withMessage("Invalid conversation ID")]),
  conversationController.markAsRead,
);

// Get AI diagnostic info for conversation
router.get(
  "/:id/ai-diagnostic",
  validate([param("id").isMongoId().withMessage("Invalid conversation ID")]),
  conversationController.getAIDiagnostic,
);

// Dismiss AI insight for conversation
router.post(
  "/:id/dismiss-insight",
  validate([
    param("id").isMongoId().withMessage("Invalid conversation ID"),
    body("insightType")
      .isIn(["negativeSentiment", "slaRisk", "priority"])
      .withMessage("Invalid insight type"),
  ]),
  conversationController.dismissInsight,
);

export default router;
