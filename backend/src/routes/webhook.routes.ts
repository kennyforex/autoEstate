import { Router } from "express";
import * as webhookController from "../controllers/webhook.controller.js";

const router = Router();

// Evolution API webhook - no authentication required
router.post(
  "/evolution/:instanceName",
  webhookController.handleEvolutionWebhook,
);

export default router;
