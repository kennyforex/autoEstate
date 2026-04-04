import { Router, type Request, type Response, type NextFunction } from "express";
import { runPaymentReminderJob } from "../services/paymentReminder.service.js";

const router = Router();

/**
 * Trigger payment reminder scan (same as in-process cron).
 * Header: X-Cron-Secret: <PAYMENT_REMINDER_CRON_SECRET>
 */
router.post("/payment-reminder/run", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const secret = process.env.PAYMENT_REMINDER_CRON_SECRET?.trim();
    if (!secret) {
      res.status(503).json({ error: "PAYMENT_REMINDER_CRON_SECRET is not configured" });
      return;
    }
    const sent = req.header("x-cron-secret");
    if (sent !== secret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const result = await runPaymentReminderJob();
    res.json(result);
  } catch (e) {
    next(e);
  }
});

export default router;
