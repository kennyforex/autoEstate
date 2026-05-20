import { Router } from "express";
import { body, param, query } from "express-validator";
import { authMiddleware, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validation.middleware.js";
import * as orderController from "../controllers/order.controller.js";

const router = Router();

router.use(authMiddleware);

router.get(
  "/",
  validate([
    query("search").optional().isString(),
    query("status").optional().isString(),
    query("paymentStatus").optional().isString(),
    query("fulfillmentStatus").optional().isString(),
    query("tagId").optional().isMongoId(),
    query("createdFrom").optional().isISO8601(),
    query("createdTo").optional().isISO8601(),
    query("deliveryFrom").optional().isISO8601(),
    query("deliveryTo").optional().isISO8601(),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("offset").optional().isInt({ min: 0 }),
    query("sortBy").optional().isString(),
    query("sortOrder").optional().isIn(["asc", "desc"]),
  ]),
  orderController.listOrders,
);

router.get(
  "/:id",
  validate([param("id").isMongoId().withMessage("Invalid order ID")]),
  orderController.getOrder,
);

router.post(
  "/",
  requireRole("admin", "agent"),
  validate([
    body("contactId").optional({ nullable: true, checkFalsy: true }).isMongoId(),
    body("clientName").optional().isString(),
    body("phoneNumber").optional().isString(),
    body("email").optional({ checkFalsy: true }).isEmail(),
    body("shippingAddress").optional().isString(),
    body("shippingMethodId").optional({ nullable: true, checkFalsy: true }).isMongoId(),
    body("shippingMethod").optional().isString(),
    body("deliveryDate").optional({ nullable: true, checkFalsy: true }).isISO8601(),
    body("status").optional().isIn(["open", "completed", "cancelled"]),
    body("paymentStatus").optional().isIn(["unpaid", "verifying", "paid"]),
    body("paymentProof").optional().isObject(),
    body("paymentProof.receiptUrl").optional().isString(),
    body("paymentProof.receiptFileName").optional().isString(),
    body("paymentProof.extracted").optional().isObject(),
    body("paymentProof.reviewNotes").optional().isString(),
    body("paymentProof.checkedAt").optional({ checkFalsy: true }).isISO8601(),
    body("fulfillmentStatus").optional().isIn(["unfulfilled", "fulfilled"]),
    body("currency").optional().isString(),
    body("items").isArray({ min: 1 }),
    body("items.*.snapshot").isObject(),
    body("items.*.snapshot.productId").optional({ nullable: true, checkFalsy: true }).isMongoId(),
    body("items.*.snapshot.variantId").optional({ nullable: true, checkFalsy: true }).isString(),
    body("items.*.snapshot.productName").isString().notEmpty(),
    body("items.*.snapshot.variantLabel").optional().isString(),
    body("items.*.snapshot.optionSummary").optional().isString(),
    body("items.*.snapshot.sku").optional().isString(),
    body("items.*.snapshot.imageUrl").optional().isString(),
    body("items.*.quantity").isInt({ min: 1 }),
    body("items.*.unitPrice").isNumeric(),
    body("items.*.notes").optional().isString(),
    body("discountTotal").optional().isNumeric(),
    body("shippingFee").optional().isNumeric(),
    body("taxTotal").optional().isNumeric(),
    body("tagIds").optional().isArray(),
    body("tagIds.*").optional().isMongoId(),
  ]),
  orderController.createOrder,
);

router.put(
  "/:id",
  requireRole("admin", "agent"),
  validate([
    param("id").isMongoId().withMessage("Invalid order ID"),
    body("contactId").optional({ nullable: true, checkFalsy: true }).isMongoId(),
    body("clientName").optional().isString(),
    body("phoneNumber").optional().isString(),
    body("email").optional({ checkFalsy: true }).isEmail(),
    body("shippingAddress").optional().isString(),
    body("shippingMethodId").optional({ nullable: true, checkFalsy: true }).isMongoId(),
    body("shippingMethod").optional().isString(),
    body("deliveryDate").optional({ nullable: true, checkFalsy: true }).isISO8601(),
    body("status").optional().isIn(["open", "completed", "cancelled"]),
    body("paymentStatus").optional().isIn(["unpaid", "verifying", "paid"]),
    body("paymentProof").optional().isObject(),
    body("paymentProof.receiptUrl").optional().isString(),
    body("paymentProof.receiptFileName").optional().isString(),
    body("paymentProof.extracted").optional().isObject(),
    body("paymentProof.reviewNotes").optional().isString(),
    body("paymentProof.checkedAt").optional({ checkFalsy: true }).isISO8601(),
    body("fulfillmentStatus").optional().isIn(["unfulfilled", "fulfilled"]),
    body("currency").optional().isString(),
    body("items").optional().isArray({ min: 1 }),
    body("items.*.snapshot").optional().isObject(),
    body("items.*.snapshot.productId").optional({ nullable: true, checkFalsy: true }).isMongoId(),
    body("items.*.snapshot.variantId").optional({ nullable: true, checkFalsy: true }).isString(),
    body("items.*.snapshot.productName").optional().isString().notEmpty(),
    body("items.*.snapshot.variantLabel").optional().isString(),
    body("items.*.snapshot.optionSummary").optional().isString(),
    body("items.*.snapshot.sku").optional().isString(),
    body("items.*.snapshot.imageUrl").optional().isString(),
    body("items.*.quantity").optional().isInt({ min: 1 }),
    body("items.*.unitPrice").optional().isNumeric(),
    body("items.*.notes").optional().isString(),
    body("discountTotal").optional().isNumeric(),
    body("shippingFee").optional().isNumeric(),
    body("taxTotal").optional().isNumeric(),
    body("tagIds").optional().isArray(),
    body("tagIds.*").optional().isMongoId(),
  ]),
  orderController.updateOrder,
);

router.post(
  "/:id/activity",
  requireRole("admin", "agent"),
  validate([
    param("id").isMongoId().withMessage("Invalid order ID"),
    body("message").trim().notEmpty().withMessage("Message is required"),
  ]),
  orderController.addOrderActivity,
);

export default router;

