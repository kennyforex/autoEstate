import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validation.middleware.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import * as authController from "../controllers/auth.controller.js";

const router = Router();

// Register
router.post(
  "/register",
  validate([
    body("email").isEmail().withMessage("Valid email is required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("role")
      .optional()
      .isIn(["admin", "agent", "viewer"])
      .withMessage("Invalid role"),
  ]),
  authController.register,
);

// Login
router.post(
  "/login",
  validate([
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ]),
  authController.login,
);

// Get current user
router.get("/me", authMiddleware, authController.getMe);

// Update profile
router.put(
  "/profile",
  authMiddleware,
  validate([
    body("name")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Name cannot be empty"),
    body("avatar")
      .optional()
      .isURL({ require_tld: false, require_protocol: false, allow_protocol_relative_urls: true })
      .withMessage("Avatar must be a valid URL"),
    body("timezone").optional().isString(),
    body("language")
      .optional()
      .isIn(["en", "zh-TW", "zh-CN"])
      .withMessage("Invalid language"),
  ]),
  authController.updateProfile,
);

// Change password
router.put(
  "/password",
  authMiddleware,
  validate([
    body("currentPassword")
      .notEmpty()
      .withMessage("Current password is required"),
    body("newPassword")
      .isLength({ min: 6 })
      .withMessage("New password must be at least 6 characters"),
  ]),
  authController.changePassword,
);

// Set password (pending users only, first login)
router.post(
  "/set-password",
  authMiddleware,
  validate([
    body("newPassword")
      .isLength({ min: 6 })
      .withMessage("New password must be at least 6 characters"),
  ]),
  authController.setPassword,
);

export default router;
