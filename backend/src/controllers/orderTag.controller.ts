import { NextFunction, Request, Response } from "express";
import { Order } from "../models/Order.js";
import { OrderTag } from "../models/OrderTag.js";

export async function listOrderTags(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tags = await OrderTag.find().sort({ label: 1 });
    res.json({ tags });
  } catch (error) {
    next(error);
  }
}

export async function createOrderTag(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const label = String(req.body.label ?? "").trim();
    const color = String(req.body.color ?? "#3B82F6");

    const existing = await OrderTag.findOne({ label });
    if (existing) {
      res.status(400).json({ error: "Order tag with this label already exists" });
      return;
    }

    const tag = await OrderTag.create({ label, color });
    res.status(201).json({ tag });
  } catch (error) {
    next(error);
  }
}

export async function updateOrderTag(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const label = typeof req.body.label === "string" ? req.body.label.trim() : undefined;
    const color = typeof req.body.color === "string" ? req.body.color : undefined;

    if (label) {
      const duplicate = await OrderTag.findOne({ label, _id: { $ne: id } });
      if (duplicate) {
        res.status(400).json({ error: "Order tag with this label already exists" });
        return;
      }
    }

    const tag = await OrderTag.findByIdAndUpdate(
      id,
      {
        ...(label ? { label } : {}),
        ...(color ? { color } : {}),
      },
      { new: true },
    );

    if (!tag) {
      res.status(404).json({ error: "Order tag not found" });
      return;
    }

    res.json({ tag });
  } catch (error) {
    next(error);
  }
}

export async function deleteOrderTag(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const inUse = await Order.exists({ tagIds: id });
    if (inUse) {
      res.status(400).json({ error: "Order tag is still used by existing orders" });
      return;
    }

    const tag = await OrderTag.findByIdAndDelete(id);
    if (!tag) {
      res.status(404).json({ error: "Order tag not found" });
      return;
    }

    res.json({ message: "Order tag deleted successfully" });
  } catch (error) {
    next(error);
  }
}
