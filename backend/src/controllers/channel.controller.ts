import { Response, NextFunction } from "express";
import { channelService } from "../services/channel.service.js";
import type { AuthRequest } from "../types/index.js";

export async function listChannels(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const channels = await channelService.findAll();
    res.json({ channels });
  } catch (error) {
    next(error);
  }
}

export async function createChannel(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { name, phoneNumber, assistantId, aiSettings, businessProfile } =
      req.body;

    const channel = await channelService.create({
      name,
      phoneNumber,
      assistantId,
      aiSettings,
      businessProfile,
      createdBy: req.user.userId,
    });

    res.status(201).json({ channel });
  } catch (error) {
    next(error);
  }
}

export async function getChannel(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const channel = await channelService.findById(id);

    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    res.json({ channel });
  } catch (error) {
    next(error);
  }
}

export async function updateChannel(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const { name, assistantId, aiSettings, businessProfile } = req.body;

    const channel = await channelService.update(id, {
      name,
      assistantId,
      aiSettings,
      businessProfile,
    });

    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    res.json({ channel });
  } catch (error) {
    next(error);
  }
}

export async function deleteChannel(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const deleted = await channelService.delete(id);

    if (!deleted) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    res.json({ message: "Channel deleted successfully" });
  } catch (error) {
    next(error);
  }
}

export async function getQRCode(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const result = await channelService.getQRCode(id);

    if (!result) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function connectChannel(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const result = await channelService.connect(id);
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Channel not found") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function checkConnectionStatus(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const result = await channelService.checkConnectionStatus(id);
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Channel not found") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function disconnectChannel(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const success = await channelService.disconnect(id);

    if (!success) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    res.json({ message: "Disconnected successfully" });
  } catch (error) {
    next(error);
  }
}

export async function updateAISettings(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const {
      enabled,
      autoReplyMode,
      responseDelay,
      escalateOnNegativeSentiment,
      detectBadWording,
      badWordingResponse,
    } = req.body;

    const channel = await channelService.updateAISettings(id, {
      enabled,
      autoReplyMode,
      responseDelay,
      escalateOnNegativeSentiment,
      detectBadWording,
      badWordingResponse,
    });

    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    res.json({ channel });
  } catch (error) {
    next(error);
  }
}
