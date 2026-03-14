import { Router } from "express";
import { body, param } from "express-validator";
import { validate } from "../middleware/validation.middleware.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import * as channelController from "../controllers/channel.controller.js";

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// List channels
router.get("/", channelController.listChannels);

// Create channel
router.post(
  "/",
  validate([
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("assistantId")
      .optional()
      .isMongoId()
      .withMessage("Invalid assistant ID"),
    body("aiSettings").optional().isObject(),
    body("aiSettings.enabled").optional().isBoolean(),
    body("aiSettings.autoReplyMode")
      .optional()
      .isIn(["all", "off", "per_chat"])
      .withMessage("Invalid auto reply mode"),
    body("aiSettings.responseDelay")
      .optional()
      .isInt({ min: 0, max: 30 })
      .withMessage("Response delay must be between 0 and 30 seconds"),
    body("businessProfile").optional().isObject(),
  ]),
  channelController.createChannel,
);

// Get channel by ID
router.get(
  "/:id",
  validate([param("id").isMongoId().withMessage("Invalid channel ID")]),
  channelController.getChannel,
);

// Update channel
router.put(
  "/:id",
  validate([
    param("id").isMongoId().withMessage("Invalid channel ID"),
    body("name")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Name cannot be empty"),
    body("assistantId")
      .optional({ nullable: true })
      .isMongoId()
      .withMessage("Invalid assistant ID"),
    body("aiSettings").optional().isObject(),
    body("businessProfile").optional().isObject(),
  ]),
  channelController.updateChannel,
);

// Delete channel
router.delete(
  "/:id",
  validate([param("id").isMongoId().withMessage("Invalid channel ID")]),
  channelController.deleteChannel,
);

// Get QR code for connection
router.get(
  "/:id/qr",
  validate([param("id").isMongoId().withMessage("Invalid channel ID")]),
  channelController.getQRCode,
);

// Check connection status (poll Evolution API)
router.get(
  "/:id/status",
  validate([param("id").isMongoId().withMessage("Invalid channel ID")]),
  channelController.checkConnectionStatus,
);

// Connect channel (trigger QR code generation)
router.post(
  "/:id/connect",
  validate([param("id").isMongoId().withMessage("Invalid channel ID")]),
  channelController.connectChannel,
);

// Disconnect channel
router.post(
  "/:id/disconnect",
  validate([param("id").isMongoId().withMessage("Invalid channel ID")]),
  channelController.disconnectChannel,
);

// Update AI settings
router.put(
  "/:id/ai-settings",
  validate([
    param("id").isMongoId().withMessage("Invalid channel ID"),
    body("enabled").optional().isBoolean(),
    body("autoReplyMode")
      .optional()
      .isIn(["all", "off", "per_chat"])
      .withMessage("Invalid auto reply mode"),
    body("responseDelay")
      .optional()
      .isInt({ min: 0, max: 30 })
      .withMessage("Response delay must be between 0 and 30 seconds"),
    body("escalateOnNegativeSentiment").optional().isBoolean(),
    body("detectBadWording").optional().isBoolean(),
    body("badWordingResponse").optional().isString().trim(),
  ]),
  channelController.updateAISettings,
);

export default router;
