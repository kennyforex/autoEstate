import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validation.middleware.js";
import { authMiddleware, requireRole } from "../middleware/auth.middleware.js";
import * as companyController from "../controllers/company.controller.js";

const router = Router();

// Logo can be a normal URL or a data URL (from upload/image)
const isUrlOrDataUrl = (value: string) =>
  value.startsWith("data:") || /^https?:\/\//i.test(value);

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
