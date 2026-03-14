import { Router } from "express";
import { body, param } from "express-validator";
import { validate } from "../middleware/validation.middleware.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import * as tagController from "../controllers/tag.controller.js";

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// List all tags
router.get("/", tagController.listTags);

// Create a new tag
router.post(
  "/",
  validate([
    body("label").notEmpty().withMessage("Label is required").trim(),
    body("color").optional().isHexColor().withMessage("Invalid color format"),
  ]),
  tagController.createTag,
);

// Update a tag
router.put(
  "/:id",
  validate([
    param("id").isMongoId().withMessage("Invalid tag ID"),
    body("label")
      .optional()
      .notEmpty()
      .withMessage("Label cannot be empty")
      .trim(),
    body("color").optional().isHexColor().withMessage("Invalid color format"),
  ]),
  tagController.updateTag,
);

// Delete a tag
router.delete(
  "/:id",
  validate([param("id").isMongoId().withMessage("Invalid tag ID")]),
  tagController.deleteTag,
);

export default router;
