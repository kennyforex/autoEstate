import { NextFunction, Response } from "express";
import { ClientGroup } from "../models/index.js";
import { catalogService } from "../services/catalog.service.js";
import type { AuthRequest } from "../types/index.js";

const DEFAULT_CLIENT_GROUP_SLUG = "basic";

export async function listClientGroups(
  _req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const clientGroups = await catalogService.listClientGroups();
    res.json({ clientGroups });
  } catch (error) {
    next(error);
  }
}

export async function createClientGroup(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const name = String(req.body.name || "").trim();
    const isDefault = req.body.isDefault === true;
    const isActive = req.body.isActive !== false;
    const sortOrder =
      typeof req.body.sortOrder === "number" ? req.body.sortOrder : 0;

    const slug = await catalogService.buildUniqueClientGroupSlug(name);
    let clientGroup = await ClientGroup.create({
      name,
      slug,
      isDefault,
      isActive,
      sortOrder,
    });

    if (isDefault) {
      await catalogService.setDefaultClientGroup(clientGroup._id.toString());
      clientGroup = (await ClientGroup.findById(clientGroup._id)) ?? clientGroup;
    }

    res.status(201).json({ clientGroup });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      res.status(400).json({ error: "A client group with this name already exists" });
      return;
    }
    next(error);
  }
}

export async function updateClientGroup(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const clientGroup = await ClientGroup.findById(id);

    if (!clientGroup) {
      res.status(404).json({ error: "Client group not found" });
      return;
    }

    const requestedName =
      typeof req.body.name === "string" ? req.body.name.trim() : undefined;
    const wantsDefault = req.body.isDefault === true;
    const wantsDefaultRemoved = req.body.isDefault === false;
    const wantsInactive = req.body.isActive === false;

    if (
      clientGroup.slug === DEFAULT_CLIENT_GROUP_SLUG &&
      requestedName &&
      requestedName !== clientGroup.name
    ) {
      res.status(400).json({ error: "The Basic client group name is protected" });
      return;
    }

    if (clientGroup.isDefault && wantsDefaultRemoved) {
      res.status(400).json({ error: "Assign another default group before removing the current default" });
      return;
    }

    if (clientGroup.isDefault && wantsInactive) {
      res.status(400).json({ error: "The default client group must stay active" });
      return;
    }

    if (requestedName) {
      clientGroup.name = requestedName;
    }

    if (typeof req.body.sortOrder === "number") {
      clientGroup.sortOrder = req.body.sortOrder;
    }

    if (typeof req.body.isActive === "boolean" && !clientGroup.isDefault) {
      clientGroup.isActive = req.body.isActive;
    }

    await clientGroup.save();

    if (wantsDefault) {
      await catalogService.setDefaultClientGroup(clientGroup._id.toString());
    }

    const refreshed = (await ClientGroup.findById(clientGroup._id)) ?? clientGroup;
    res.json({ clientGroup: refreshed });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      res.status(400).json({ error: "A client group with this name already exists" });
      return;
    }
    next(error);
  }
}

export async function deleteClientGroup(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const clientGroup = await ClientGroup.findById(id);

    if (!clientGroup) {
      res.status(404).json({ error: "Client group not found" });
      return;
    }

    if (clientGroup.isDefault || clientGroup.slug === DEFAULT_CLIENT_GROUP_SLUG) {
      res.status(400).json({ error: "The Basic default group cannot be deleted" });
      return;
    }

    const assignedContacts = await catalogService.countContactsInClientGroup(id);
    if (assignedContacts > 0) {
      res.status(400).json({
        error: `This client group is assigned to ${assignedContacts} contact(s). Reassign them before deleting.`,
      });
      return;
    }

    await ClientGroup.findByIdAndDelete(id);
    res.json({ message: "Client group deleted successfully" });
  } catch (error) {
    next(error);
  }
}
