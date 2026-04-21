import { NextFunction, Request, Response } from "express";
import { shippingService } from "../services/shipping.service.js";
import { ShippingMethod } from "../models/ShippingMethod.js";

function clampFee(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

export async function listShippingMethods(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Keep backwards compatible behavior: include inactive for admin/settings lists.
    const methods = await shippingService.list({ includeInactive: true });
    res.json({ shippingMethods: methods });
  } catch (error) {
    next(error);
  }
}

export async function createShippingMethod(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const labelZh = String(req.body.labelZh ?? "").trim();
    const labelEn = String(req.body.labelEn ?? "").trim();
    const fee = clampFee(req.body.fee);
    const sortOrder =
      typeof req.body.sortOrder === "number"
        ? req.body.sortOrder
        : Number(req.body.sortOrder) || 0;
    const isActive = req.body.isActive !== false;

    if (!labelZh) {
      res.status(400).json({ error: "Chinese label is required" });
      return;
    }

    const method = await ShippingMethod.create({
      labelZh,
      labelEn,
      fee,
      sortOrder,
      isActive,
    });
    res.status(201).json({ shippingMethod: method });
  } catch (error) {
    next(error);
  }
}

export async function updateShippingMethod(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const labelZh =
      typeof req.body.labelZh === "string" ? req.body.labelZh.trim() : undefined;
    const labelEn =
      typeof req.body.labelEn === "string" ? req.body.labelEn.trim() : undefined;
    const fee = req.body.fee !== undefined ? clampFee(req.body.fee) : undefined;
    const sortOrder =
      req.body.sortOrder !== undefined
        ? typeof req.body.sortOrder === "number"
          ? req.body.sortOrder
          : Number(req.body.sortOrder) || 0
        : undefined;
    const isActive = typeof req.body.isActive === "boolean" ? req.body.isActive : undefined;

    if (labelZh !== undefined && !labelZh) {
      res.status(400).json({ error: "Chinese label cannot be empty" });
      return;
    }

    const method = await ShippingMethod.findByIdAndUpdate(
      id,
      {
        ...(labelZh !== undefined ? { labelZh } : {}),
        ...(labelEn !== undefined ? { labelEn } : {}),
        ...(fee !== undefined ? { fee } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      { new: true },
    );

    if (!method) {
      res.status(404).json({ error: "Shipping method not found" });
      return;
    }

    res.json({ shippingMethod: method });
  } catch (error) {
    next(error);
  }
}

export async function deleteShippingMethod(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const method = await ShippingMethod.findByIdAndDelete(id);
    if (!method) {
      res.status(404).json({ error: "Shipping method not found" });
      return;
    }
    res.json({ message: "Shipping method deleted successfully" });
  } catch (error) {
    next(error);
  }
}
