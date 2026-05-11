import { Router } from "express";
import { body, param, query } from "express-validator";
import multer from "multer";
import { validate } from "../middleware/validation.middleware.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import * as assistantController from "../controllers/assistant.controller.js";

const router = Router();

// Configure multer with 100MB file size limit for video support
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Allow all file types for now, validation happens in the service
    cb(null, true);
  },
});

// All routes require authentication
router.use(authMiddleware);

// Skill editor: tool ids aligned with agent registry (must be registered before /:id)
router.get("/skill-tool-options", assistantController.listSkillToolOptions);

// List assistants
router.get(
  "/",
  validate([
    query("status")
      .optional()
      .isIn(["active", "inactive"])
      .withMessage("Invalid status"),
  ]),
  assistantController.listAssistants,
);

// Create assistant
router.post(
  "/",
  validate([
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("instructions").optional().isString(),
    body("aiModel")
      .optional()
      .isIn(["gpt-4o", "gpt-4.1", "claude-3-7-sonnet"])
      .withMessage("Invalid model"),
    body("metadata").optional().isObject(),
  ]),
  assistantController.createAssistant,
);

// Get assistant by ID
router.get(
  "/:id",
  validate([param("id").isMongoId().withMessage("Invalid assistant ID")]),
  assistantController.getAssistant,
);

// Staff (department roster)
router.post(
  "/:id/staff",
  validate([
    param("id").isMongoId().withMessage("Invalid assistant ID"),
    body("displayName").trim().notEmpty().withMessage("displayName is required"),
    body("roleTitle").optional().isString(),
    body("responsibilities").optional().isString(),
  ]),
  assistantController.addStaff,
);

router.patch(
  "/:id/staff/:staffId",
  validate([
    param("id").isMongoId().withMessage("Invalid assistant ID"),
    param("staffId").notEmpty().withMessage("staffId is required"),
    body("displayName").optional().trim().notEmpty(),
    body("roleTitle").optional().isString(),
    body("responsibilities").optional().isString(),
    body("nickname").optional().isString(),
    body("avatarPreset").optional().isString(),
    body("avatarUrl").optional().isString(),
  ]),
  assistantController.updateStaff,
);

router.delete(
  "/:id/staff/:staffId",
  validate([
    param("id").isMongoId().withMessage("Invalid assistant ID"),
    param("staffId").notEmpty().withMessage("staffId is required"),
  ]),
  assistantController.removeStaff,
);

// Update assistant
router.put(
  "/:id",
  validate([
    param("id").isMongoId().withMessage("Invalid assistant ID"),
    body("name")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Name cannot be empty"),
    body("instructions").optional().isString(),
    body("aiModel")
      .optional()
      .isIn(["gpt-4o", "gpt-4.1", "claude-3-7-sonnet"])
      .withMessage("Invalid model"),
    body("status")
      .optional()
      .isIn(["active", "inactive"])
      .withMessage("Invalid status"),
    body("metadata").optional().isObject(),
  ]),
  assistantController.updateAssistant,
);

// Delete assistant
router.delete(
  "/:id",
  validate([param("id").isMongoId().withMessage("Invalid assistant ID")]),
  assistantController.deleteAssistant,
);

// Upload file to assistant
router.post(
  "/:id/files",
  validate([param("id").isMongoId().withMessage("Invalid assistant ID")]),
  upload.single("file"),
  assistantController.uploadFile,
);

// Get file download URL
router.get(
  "/:id/files/:fileId",
  validate([
    param("id").isMongoId().withMessage("Invalid assistant ID"),
    param("fileId").notEmpty().withMessage("File ID is required"),
  ]),
  assistantController.getFileUrl,
);

// Get file processing status
router.get(
  "/:id/files/:fileId/status",
  validate([
    param("id").isMongoId().withMessage("Invalid assistant ID"),
    param("fileId").notEmpty().withMessage("File ID is required"),
  ]),
  assistantController.getFileStatus,
);

// Cancel file processing
router.post(
  "/:id/files/:fileId/cancel",
  validate([
    param("id").isMongoId().withMessage("Invalid assistant ID"),
    param("fileId").notEmpty().withMessage("File ID is required"),
  ]),
  assistantController.cancelFileProcessing,
);

// Delete file from assistant
router.delete(
  "/:id/files/:fileId",
  validate([
    param("id").isMongoId().withMessage("Invalid assistant ID"),
    param("fileId").notEmpty().withMessage("File ID is required"),
  ]),
  assistantController.deleteFile,
);

// Update file folder (Foodflow organization only)
router.patch(
  "/:id/files/:fileId",
  validate([
    param("id").isMongoId().withMessage("Invalid assistant ID"),
    param("fileId").notEmpty().withMessage("File ID is required"),
    body("folder").optional({ nullable: true }).isString().withMessage("Folder must be a string"),
  ]),
  assistantController.updateFileFolder,
);

// Batch update file folders
router.patch(
  "/:id/files",
  validate([
    param("id").isMongoId().withMessage("Invalid assistant ID"),
    body("updates").isArray({ min: 1 }).withMessage("Updates array is required"),
    body("updates.*.fileId").notEmpty().withMessage("File ID is required"),
    body("updates.*.folder").optional({ nullable: true }).isString().withMessage("Folder must be a string"),
  ]),
  assistantController.batchUpdateFileFolders,
);

// Create folder
router.post(
  "/:id/folders",
  validate([
    param("id").isMongoId().withMessage("Invalid assistant ID"),
    body("name").trim().notEmpty().withMessage("Folder name is required"),
  ]),
  assistantController.createFolder,
);

// Delete folder
router.delete(
  "/:id/folders/:folderName",
  validate([
    param("id").isMongoId().withMessage("Invalid assistant ID"),
    param("folderName").notEmpty().withMessage("Folder name is required"),
  ]),
  assistantController.deleteFolder,
);

// Rename folder
router.patch(
  "/:id/folders/:folderName",
  validate([
    param("id").isMongoId().withMessage("Invalid assistant ID"),
    param("folderName").notEmpty().withMessage("Folder name is required"),
    body("newName").trim().notEmpty().withMessage("New folder name is required"),
  ]),
  assistantController.renameFolder,
);

// Chat with assistant (direct Pinecone)
router.post(
  "/:id/chat",
  validate([
    param("id").isMongoId().withMessage("Invalid assistant ID"),
    body("messages")
      .isArray({ min: 1 })
      .withMessage("Messages array is required"),
    body("messages.*.role")
      .isIn(["user", "assistant"])
      .withMessage("Invalid message role"),
    body("messages.*.content")
      .notEmpty()
      .withMessage("Message content is required"),
    body("model").optional().isString(),
  ]),
  assistantController.chatWithAssistant,
);

router.get(
  "/:id/playground-history",
  validate([param("id").isMongoId().withMessage("Invalid assistant ID")]),
  assistantController.getPlaygroundHistory,
);

router.delete(
  "/:id/playground-history",
  validate([param("id").isMongoId().withMessage("Invalid assistant ID")]),
  assistantController.clearPlaygroundHistory,
);

// Chat via ReAct Agent Engine (Playground agent mode)
// Supports optional file upload for media analysis
// Note: validation is handled in controller due to multipart/form-data
router.post(
  "/:id/agent-chat",
  upload.single("file"),
  assistantController.agentChat,
);

export default router;
