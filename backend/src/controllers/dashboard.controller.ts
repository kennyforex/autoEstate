import { Response, NextFunction } from "express";
import { dashboardService } from "../services/dashboard.service.js";
import type { AuthRequest } from "../types/index.js";

export async function getMetrics(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { startDate, endDate, channelId } = req.query;

    const metrics = await dashboardService.getMetrics({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      channelId: channelId as string | undefined,
    });

    res.json({ metrics });
  } catch (error) {
    next(error);
  }
}

export async function getInsights(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const insights = await dashboardService.getAIInsights();
    res.json({ insights });
  } catch (error) {
    next(error);
  }
}

export async function getChannelStats(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await dashboardService.getChannelStats();
    res.json({ stats });
  } catch (error) {
    next(error);
  }
}

export async function getAIPerformance(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { startDate, endDate, channelId } = req.query;

    const performance = await dashboardService.getAIPerformance({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      channelId: channelId as string | undefined,
    });
    res.json({ performance });
  } catch (error) {
    next(error);
  }
}
