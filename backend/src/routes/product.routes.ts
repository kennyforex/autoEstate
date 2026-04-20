import { Router } from "express";
import { body, param, query } from "express-validator";
import { authMiddleware, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validation.middleware.js";
import * as productController from "../controllers/product.controller.js";

const router = Router();

router.use(authMiddleware);

router.get(
  "/",
  validate([
    query("includeInactive").optional().isBoolean().withMessage("includeInactive must be boolean"),
    query("category").optional().isString(),
  ]),
  productController.listProducts,
);

router.get(
  "/:id",
  validate([param("id").isMongoId().withMessage("Invalid product ID")]),
  productController.getProduct,
);

router.post(
  "/",
  requireRole("admin"),
  validate([
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("category").optional().isString(),
    body("description").optional().isString(),
    body("currency").optional().isString(),
    body("isActive").optional().isBoolean(),
    body("displayOrder").optional().isNumeric(),
    body("basePriceByGroup").optional().isObject(),
    body("optionGroups").optional().isArray(),
  ]),
  productController.createProduct,
);

router.put(
  "/:id",
  requireRole("admin"),
  validate([
    param("id").isMongoId().withMessage("Invalid product ID"),
    body("name").optional().trim().notEmpty().withMessage("Name cannot be empty"),
    body("category").optional().isString(),
    body("description").optional().isString(),
    body("currency").optional().isString(),
    body("isActive").optional().isBoolean(),
    body("displayOrder").optional().isNumeric(),
    body("basePriceByGroup").optional().isObject(),
    body("optionGroups").optional().isArray(),
  ]),
  productController.updateProduct,
);

router.delete(
  "/:id",
  requireRole("admin"),
  validate([param("id").isMongoId().withMessage("Invalid product ID")]),
  productController.deleteProduct,
);

export default router;
