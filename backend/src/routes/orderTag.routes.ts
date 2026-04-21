import { Router } from "express";
import { body, param } from "express-validator";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validation.middleware.js";
import * as orderTagController from "../controllers/orderTag.controller.js";

const router = Router();

router.use(authMiddleware);

router.get("/", orderTagController.listOrderTags);

router.post(
  "/",
  validate([
    body("label").trim().notEmpty().withMessage("Label is required"),
    body("color").optional().isHexColor().withMessage("Invalid color format"),
  ]),
  orderTagController.createOrderTag,
);

router.put(
  "/:id",
  validate([
    param("id").isMongoId().withMessage("Invalid order tag ID"),
    body("label").optional().trim().notEmpty().withMessage("Label cannot be empty"),
    body("color").optional().isHexColor().withMessage("Invalid color format"),
  ]),
  orderTagController.updateOrderTag,
);

router.delete(
  "/:id",
  validate([param("id").isMongoId().withMessage("Invalid order tag ID")]),
  orderTagController.deleteOrderTag,
);

export default router;
