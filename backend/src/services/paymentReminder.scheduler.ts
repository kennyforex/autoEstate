import cron from "node-cron";
import { runPaymentReminderJob } from "./paymentReminder.service.js";

let scheduled: ReturnType<typeof cron.schedule> | null = null;

/**
 * Registers in-process cron when PAYMENT_REMINDER_ENABLED=true.
 * Also use POST /api/cron/payment-reminder/run with X-Cron-Secret for external schedulers.
 */
export function initPaymentReminderScheduler(): void {
  if (process.env.PAYMENT_REMINDER_ENABLED !== "true") {
    console.log("[PaymentReminder] Scheduler off (set PAYMENT_REMINDER_ENABLED=true to enable)");
    return;
  }

  const expr = process.env.PAYMENT_REMINDER_CRON?.trim() || "0 10 * * *";
  if (!cron.validate(expr)) {
    console.error("[PaymentReminder] Invalid PAYMENT_REMINDER_CRON:", expr);
    return;
  }

  const tz = process.env.PAYMENT_REMINDER_TZ?.trim();
  scheduled = cron.schedule(
    expr,
    () => {
      runPaymentReminderJob().catch((e: unknown) =>
        console.error(
          "[PaymentReminder] Job error:",
          e instanceof Error ? e.message : e,
        ),
      );
    },
    tz ? { timezone: tz } : {},
  );

  console.log("[PaymentReminder] In-process cron scheduled:", expr);
}

export function stopPaymentReminderScheduler(): void {
  scheduled?.stop();
  scheduled = null;
}
