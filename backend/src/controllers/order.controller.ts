import { NextFunction, Response } from "express";
import type { AuthRequest } from "../types/index.js";
import { orderService } from "../services/order.service.js";

export async function listOrders(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "25"), 10) || 25));
    const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);

    const result = await orderService.list({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      paymentStatus:
        typeof req.query.paymentStatus === "string" ? req.query.paymentStatus : undefined,
      fulfillmentStatus:
        typeof req.query.fulfillmentStatus === "string"
          ? req.query.fulfillmentStatus
          : undefined,
      tagId: typeof req.query.tagId === "string" ? req.query.tagId : undefined,
      createdFrom:
        typeof req.query.createdFrom === "string" ? req.query.createdFrom : undefined,
      createdTo: typeof req.query.createdTo === "string" ? req.query.createdTo : undefined,
      deliveryFrom:
        typeof req.query.deliveryFrom === "string" ? req.query.deliveryFrom : undefined,
      deliveryTo:
        typeof req.query.deliveryTo === "string" ? req.query.deliveryTo : undefined,
      sortBy: typeof req.query.sortBy === "string" ? req.query.sortBy : undefined,
      sortOrder:
        req.query.sortOrder === "asc" || req.query.sortOrder === "desc"
          ? (req.query.sortOrder as "asc" | "desc")
          : undefined,
      limit,
      offset,
    });

    res.json({
      orders: result.orders,
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    next(error);
  }
}

export async function getOrder(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const order = await orderService.getById(req.params.id);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json({ order });
  } catch (error) {
    next(error);
  }
}

export async function createOrder(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const order = await orderService.create({
      ...req.body,
      source: "manual",
      createdByUserId: req.user?.userId,
    });
    res.status(201).json({ order });
  } catch (error) {
    next(error);
  }
}

export async function updateOrder(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const order = await orderService.update(req.params.id, req.body, {
      updatedByUserId: req.user?.userId,
    });
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json({ order });
  } catch (error) {
    next(error);
  }
}

export async function addOrderActivity(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const order = await orderService.addActivity({
      orderId: req.params.id,
      message: req.body.message,
      kind: "note",
      createdByUserId: req.user?.userId,
    });
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json({ order });
  } catch (error) {
    next(error);
  }
}

