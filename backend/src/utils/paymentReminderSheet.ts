/**
 * Sheet column contract for payment reminders (aligned with cake-booking / mille `sheetFields`).
 * Override labels via PAYMENT_REMINDER_COL_* env vars if your headers differ.
 */

export const PAYMENT_REMINDER_DEFAULT_COLUMNS = {
  orderId: "Order ID",
  phone: "Phone",
  paymentStatus: "Payment Status",
  price: "Price (HKD)",
  customer: "Customer",
} as const;

/** Default CSV in PAYMENT_REMINDER_UNPAID_STATUSES when env unset */
export const PAYMENT_REMINDER_DEFAULT_UNPAID_STATUSES =
  "未付,Pending,Unpaid,pending,未付款,Partial";

export function parseCommaListEnv(value: string | undefined, fallback: string): string[] {
  const raw = (value ?? fallback).split(",").map((s) => s.trim()).filter(Boolean);
  return raw;
}

const COL_ENV_KEYS: Record<keyof typeof PAYMENT_REMINDER_DEFAULT_COLUMNS, string> = {
  orderId: "PAYMENT_REMINDER_COL_ORDER_ID",
  phone: "PAYMENT_REMINDER_COL_PHONE",
  paymentStatus: "PAYMENT_REMINDER_COL_PAYMENT_STATUS",
  price: "PAYMENT_REMINDER_COL_PRICE",
  customer: "PAYMENT_REMINDER_COL_CUSTOMER",
};

export function columnLabelFromEnv(
  key: keyof typeof PAYMENT_REMINDER_DEFAULT_COLUMNS,
): string {
  const fromEnv = process.env[COL_ENV_KEYS[key]]?.trim();
  if (fromEnv) return fromEnv;
  return PAYMENT_REMINDER_DEFAULT_COLUMNS[key];
}
