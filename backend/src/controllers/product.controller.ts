import { NextFunction, Response } from "express";
import { Product } from "../models/index.js";
import { catalogService } from "../services/catalog.service.js";
import type { AuthRequest } from "../types/index.js";
import { normalizeProductPayload } from "../utils/productPayload.js";

export async function listProducts(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const query: Record<string, unknown> = {};

    if (!includeInactive) {
      query.isActive = true;
    }

    if (typeof req.query.category === "string" && req.query.category.trim()) {
      query.category = req.query.category.trim();
    }

    const products = await Product.find(query).sort({ displayOrder: 1, name: 1 });
    res.json({ products });
  } catch (error) {
    next(error);
  }
}

export async function getProduct(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    res.json({ product });
  } catch (error) {
    next(error);
  }
}

export async function createProduct(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const payload = normalizeProductPayload(req.body);
    const slug = await catalogService.buildUniqueProductSlug(payload.name);
    const product = await Product.create({ ...payload, slug });
    res.status(201).json({ product });
  } catch (error) {
    next(error);
  }
}

export async function updateProduct(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const payload = normalizeProductPayload(req.body);
    const nextName = payload.name || product.name;

    Object.assign(product, payload, {
      slug: await catalogService.buildUniqueProductSlug(nextName, product._id.toString()),
    });

    await product.save();
    res.json({ product });
  } catch (error) {
    next(error);
  }
}

export async function deleteProduct(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    next(error);
  }
}
