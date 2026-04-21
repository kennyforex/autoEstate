import { Router } from "express";
import { body, param } from "express-validator";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validation.middleware.js";
import * as shippingMethodController from "../controllers/shippingMethod.controller.js";

const router = Router();

router.use(authMiddleware);

router.get("/", shippingMethodController.listShippingMethods);

router.post(
  "/",
  validate([
    body("labelZh").trim().notEmpty().withMessage("Chinese label is required"),
    body("labelEn").optional().isString(),
    body("fee").optional().isNumeric(),
    body("sortOrder").optional().isNumeric(),
    body("isActive").optional().isBoolean(),
  ]),
  shippingMethodController.createShippingMethod,
);

router.put(
  "/:id",
  validate([
    param("id").isMongoId().withMessage("Invalid shipping method ID"),
    body("labelZh").optional().trim().notEmpty().withMessage("Chinese label cannot be empty"),
    body("labelEn").optional().isString(),
    body("fee").optional().isNumeric(),
    body("sortOrder").optional().isNumeric(),
    body("isActive").optional().isBoolean(),
  ]),
  shippingMethodController.updateShippingMethod,
);

router.delete(
  "/:id",
  validate([param("id").isMongoId().withMessage("Invalid shipping method ID")]),
  shippingMethodController.deleteShippingMethod,
);

export default router;
