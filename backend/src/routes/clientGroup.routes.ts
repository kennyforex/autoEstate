import { Router } from "express";
import { body, param } from "express-validator";
import { authMiddleware, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validation.middleware.js";
import * as clientGroupController from "../controllers/clientGroup.controller.js";

const router = Router();

router.use(authMiddleware);

router.get("/", clientGroupController.listClientGroups);

router.post(
  "/",
  requireRole("admin"),
  validate([
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("isDefault").optional().isBoolean(),
    body("isActive").optional().isBoolean(),
    body("sortOrder").optional().isNumeric(),
  ]),
  clientGroupController.createClientGroup,
);

router.put(
  "/:id",
  requireRole("admin"),
  validate([
    param("id").isMongoId().withMessage("Invalid client group ID"),
    body("name").optional().trim().notEmpty().withMessage("Name cannot be empty"),
    body("isDefault").optional().isBoolean(),
    body("isActive").optional().isBoolean(),
    body("sortOrder").optional().isNumeric(),
  ]),
  clientGroupController.updateClientGroup,
);

router.delete(
  "/:id",
  requireRole("admin"),
  validate([param("id").isMongoId().withMessage("Invalid client group ID")]),
  clientGroupController.deleteClientGroup,
);

export default router;
