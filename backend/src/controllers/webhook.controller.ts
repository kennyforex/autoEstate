import { Request, Response, NextFunction } from "express";
import { webhookService } from "../services/webhook.service.js";
import type { EvolutionWebhookPayload } from "../types/index.js";

export async function handleEvolutionWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { instanceName } = req.params;
    const payload = req.body as EvolutionWebhookPayload;

    // Respond immediately to avoid webhook timeout
    res.status(200).json({ received: true });

    // Process webhook asynchronously
    webhookService.processWebhook(instanceName, payload).catch((error) => {
      console.error("Webhook processing error:", error);
    });
  } catch (error) {
    next(error);
  }
}
