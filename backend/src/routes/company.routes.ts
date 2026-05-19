import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validation.middleware.js";
import { authMiddleware, requireRole } from "../middleware/auth.middleware.js";
import * as companyController from "../controllers/company.controller.js";
import { MODERATION_INBOX_FOLDERS } from "../types/moderation.js";

const router = Router();

// Logo: data URL, http(s), or our uploads path (resolved on the client via API origin)
const isUrlOrDataUrl = (value: string) =>
  value.startsWith("data:") ||
  /^https?:\/\//i.test(value) ||
  value.startsWith("/uploads/");

// Public branding for login page (no auth)
router.get("/public", companyController.getCompanyPublic);

// Get company profile (any authenticated user can view)
router.get("/", authMiddleware, companyController.getCompany);

// Update company profile (admin only)
router.put(
  "/",
  authMiddleware,
  requireRole("admin"),
  validate([
    body("name")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Company name cannot be empty"),
    body("logo")
      .optional({ checkFalsy: true })
      .custom((value) => {
        if (!value || typeof value !== "string") return true;
        if (!isUrlOrDataUrl(value)) {
          throw new Error("Logo must be a valid URL or data URL");
        }
        return true;
      }),
    body("email")
      .optional({ checkFalsy: true })
      .isEmail()
      .withMessage("Invalid email address"),
    body("phone").optional().isString(),
    body("address").optional().isString(),
    body("website")
      .optional({ checkFalsy: true })
      .isURL()
      .withMessage("Website must be a valid URL"),
    body("timezone").optional().isString(),
    body("smtpHost").optional().trim().isString(),
    body("smtpPort").optional().isInt({ min: 1, max: 65535 }),
    body("smtpUser").optional().trim().isString(),
    body("smtpPass").optional().isString(),
    body("emailFrom").optional().trim().isString(),
    body("appUrl").optional().trim().isString(),
    body("moderationSettings").optional().isObject(),
    body("moderationSettings.enabled").optional().isBoolean(),
    body("moderationSettings.notifyEnabled").optional().isBoolean(),
    body("moderationSettings.notifyPhoneNumber").optional().isString(),
    body("moderationSettings.categories")
      .optional()
      .isArray({ max: 20 }),
    body("moderationSettings.categories.*.id").optional().isString(),
    body("moderationSettings.categories.*.name").optional().isString(),
    body("moderationSettings.categories.*.enabled").optional().isBoolean(),
    body("moderationSettings.categories.*.phrases")
      .optional()
      .isArray({ max: 200 }),
    body("moderationSettings.categories.*.phrases.*")
      .optional()
      .isString()
      .isLength({ max: 120 }),
    body("moderationSettings.categories.*.inboxFolder")
      .optional()
      .isIn([...MODERATION_INBOX_FOLDERS]),
    body("moderationSettings")
      .optional()
      .custom((value) => {
        if (!value || typeof value !== "object") return true;
        if (value.notifyEnabled && !String(value.notifyPhoneNumber ?? "").trim()) {
          throw new Error(
            "Manager notify phone is required when alerts are enabled",
          );
        }
        return true;
      }),
  ]),
  companyController.updateCompany,
);

// Send test email (admin only) – verify SMTP config
router.post(
  "/send-test-email",
  authMiddleware,
  requireRole("admin"),
  validate([
    body("to").isEmail().withMessage("Valid email address is required"),
  ]),
  companyController.sendTestEmailHandler,
);

export default router;
