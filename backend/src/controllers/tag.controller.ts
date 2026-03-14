import { Request, Response, NextFunction } from "express";
import { Tag } from "../models/Tag.js";
import { Conversation } from "../models/Conversation.js";

/**
 * List all tags
 */
export async function listTags(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tags = await Tag.find().sort({ label: 1 });
    res.json({ tags });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new tag
 */
export async function createTag(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { label, color } = req.body;

    // Check if tag already exists
    const existingTag = await Tag.findOne({ label });
    if (existingTag) {
      res.status(400).json({ error: "Tag with this label already exists" });
      return;
    }

    const tag = await Tag.create({ label, color });
    res.status(201).json({ tag });
  } catch (error) {
    next(error);
  }
}

/**
 * Update a tag
 */
export async function updateTag(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const { label, color } = req.body;

    const tag = await Tag.findByIdAndUpdate(
      id,
      { label, color },
      { new: true },
    );

    if (!tag) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }

    res.json({ tag });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a tag
 */
export async function deleteTag(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const tag = await Tag.findByIdAndDelete(id);
    if (!tag) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }

    // Remove tag from all conversations
    await Conversation.updateMany({ tags: id }, { $pull: { tags: id } });

    res.json({ message: "Tag deleted successfully" });
  } catch (error) {
    next(error);
  }
}
