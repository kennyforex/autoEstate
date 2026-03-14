import { Router } from "express";
import { body, param } from "express-validator";
import { validate } from "../middleware/validation.middleware.js";
import { authMiddleware, requireRole } from "../middleware/auth.middleware.js";
import * as userController from "../controllers/user.controller.js";

const router = Router();

// List all users (admin only)
router.get("/", authMiddleware, requireRole("admin"), userController.listUsers);

// Invite a new user (admin only)
router.post(
  "/invite",
  authMiddleware,
  requireRole("admin"),
  validate([
    body("email").isEmail().withMessage("Valid email is required"),
    body("name")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Name cannot be empty"),
    body("role").isIn(["admin", "agent", "viewer"]).withMessage("Invalid role"),
  ]),
  userController.inviteUser,
);

// Resend invite email (admin only, pending users only)
router.post(
  "/:id/resend-invite",
  authMiddleware,
  requireRole("admin"),
  validate([param("id").isMongoId().withMessage("Invalid user ID")]),
  userController.resendInvite,
);

// Update user role (admin only)
router.patch(
  "/:id",
  authMiddleware,
  requireRole("admin"),
  validate([
    param("id").isMongoId().withMessage("Invalid user ID"),
    body("role")
      .optional()
      .isIn(["admin", "agent", "viewer"])
      .withMessage("Invalid role"),
    body("status")
      .optional()
      .isIn(["active", "inactive"])
      .withMessage("Invalid status"),
  ]),
  (req, res, next) => {
    if (req.body.status !== undefined) {
      return userController.updateUserStatus(req, res, next);
    }
    if (req.body.role !== undefined) {
      return userController.updateUserRole(req, res, next);
    }
    return res.status(400).json({ error: "Provide role or status" });
  },
);

// Remove user (admin only)
router.delete(
  "/:id",
  authMiddleware,
  requireRole("admin"),
  validate([param("id").isMongoId().withMessage("Invalid user ID")]),
  userController.removeUser,
);

export default router;
