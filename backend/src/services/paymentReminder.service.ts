import { googleWorkspaceService } from "./googleWorkspace.service.js";
import { Channel, Contact, Conversation } from "../models/index.js";
import { PaymentReminderLog } from "../models/PaymentReminderLog.js";
import { messageService } from "./message.service.js";
import {
  columnLabelFromEnv,
  parseCommaListEnv,
  PAYMENT_REMINDER_DEFAULT_UNPAID_STATUSES,
} from "../utils/paymentReminderSheet.js";
import { phonesLikelyMatch } from "../utils/phoneMatch.js";
import { recipientJidForEvolutionSend } from "../utils/helpers.js";

function headerIndex(headers: string[], label: string): number {
  const want = label.trim().toLowerCase();
  return headers.findIndex((h) => (h ?? "").toString().trim().toLowerCase() === want);
}

function paymentStatusIsUnpaid(cell: string, unpaidList: string[]): boolean {
  const c = cell.trim();
  if (!c) return false;
  return unpaidList.some(
    (u) => c === u.trim() || c.toLowerCase() === u.trim().toLowerCase(),
  );
}

function interpolateTemplate(
  template: string,
  vars: { customer: string; orderId: string; amount: string },
): string {
  return template
    .replace(/\{customer\}/g, vars.customer)
    .replace(/\{orderId\}/g, vars.orderId)
    .replace(/\{amount\}/g, vars.amount);
}

export interface PaymentReminderJobResult {
  scanned: number;
  sent: number;
  skipped: number;
  errors: string[];
}

/**
 * Scan the configured Google Sheet for unpaid orders and send WhatsApp reminders
 * (with per-order cooldown in PaymentReminderLog).
 */
export async function runPaymentReminderJob(): Promise<PaymentReminderJobResult> {
  const errors: string[] = [];
  const googleUserId = process.env.PAYMENT_REMINDER_GOOGLE_USER_ID?.trim();
  const spreadsheetId = process.env.PAYMENT_REMINDER_SPREADSHEET_ID?.trim();
  const sheetName = process.env.PAYMENT_REMINDER_SHEET_NAME?.trim();
  const channelId = process.env.PAYMENT_REMINDER_CHANNEL_ID?.trim();
  const cooldownHours = parseInt(process.env.PAYMENT_REMINDER_COOLDOWN_HOURS || "72", 10) || 72;

  if (!googleUserId || !spreadsheetId || !sheetName || !channelId) {
    const msg =
      "Missing env: PAYMENT_REMINDER_GOOGLE_USER_ID, PAYMENT_REMINDER_SPREADSHEET_ID, PAYMENT_REMINDER_SHEET_NAME, PAYMENT_REMINDER_CHANNEL_ID";
    console.warn("[PaymentReminder]", msg);
    return { scanned: 0, sent: 0, skipped: 0, errors: [msg] };
  }

  const unpaidList = parseCommaListEnv(
    process.env.PAYMENT_REMINDER_UNPAID_STATUSES,
    PAYMENT_REMINDER_DEFAULT_UNPAID_STATUSES,
  );

  const channel = await Channel.findById(channelId);
  if (!channel) {
    return { scanned: 0, sent: 0, skipped: 0, errors: [`Channel not found: ${channelId}`] };
  }

  const escaped = sheetName.replace(/'/g, "''");
  const range = `'${escaped}'!A:ZZ`;
  let rows: string[][];
  try {
    rows = await googleWorkspaceService.getSpreadsheetValues(googleUserId, spreadsheetId, range);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { scanned: 0, sent: 0, skipped: 0, errors: [msg] };
  }

  if (!rows?.length) {
    return { scanned: 0, sent: 0, skipped: 0, errors: [] };
  }

  const headers = (rows[0] ?? []).map((c) => (c == null ? "" : String(c)));
  const colOrder = headerIndex(headers, columnLabelFromEnv("orderId"));
  const colPhone = headerIndex(headers, columnLabelFromEnv("phone"));
  const colPay = headerIndex(headers, columnLabelFromEnv("paymentStatus"));
  const colPrice = headerIndex(headers, columnLabelFromEnv("price"));
  const colCustomer = headerIndex(headers, columnLabelFromEnv("customer"));

  if (colOrder < 0 || colPhone < 0 || colPay < 0) {
    return {
      scanned: 0,
      sent: 0,
      skipped: 0,
      errors: [
        "Missing required columns (Order ID, Phone, Payment Status). Adjust PAYMENT_REMINDER_COL_* labels to match your sheet header row.",
      ],
    };
  }

  const contacts = await Contact.find({ channelId }).lean();
  let scanned = 0;
  let sent = 0;
  let skipped = 0;
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const now = Date.now();

  const template =
    process.env.PAYMENT_REMINDER_MESSAGE_TEMPLATE?.trim() ||
    "您好，我們留意到訂單 {orderId} 尚有款項待付（{amount}）。請盡快完成付款，謝謝！";

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.length) continue;
    const orderId = String(row[colOrder] ?? "").trim();
    const phoneRaw = String(row[colPhone] ?? "").trim();
    const payRaw = String(row[colPay] ?? "").trim();
    if (!orderId || !phoneRaw) {
      skipped++;
      continue;
    }
    scanned++;

    if (!paymentStatusIsUnpaid(payRaw, unpaidList)) {
      skipped++;
      continue;
    }

    const existing = await PaymentReminderLog.findOne({ channelId, orderId });
    if (existing && now - existing.lastSentAt.getTime() < cooldownMs) {
      skipped++;
      continue;
    }

    const contact = contacts.find(
      (c) =>
        phonesLikelyMatch(phoneRaw, c.phoneNumber) ||
        phonesLikelyMatch(phoneRaw, c.whatsappId),
    );
    if (!contact) {
      skipped++;
      console.log(
        `[PaymentReminder] No contact for order ${orderId} phone ${phoneRaw} (channel ${channelId})`,
      );
      continue;
    }

    const recipientId = recipientJidForEvolutionSend(contact);
    if (!recipientId) {
      skipped++;
      continue;
    }

    const customer =
      colCustomer >= 0 ? String(row[colCustomer] ?? "").trim() : "";
    const amount = colPrice >= 0 ? String(row[colPrice] ?? "").trim() : "";

    const text = interpolateTemplate(template, {
      customer: customer || contact.name || "您好",
      orderId,
      amount: amount || "—",
    });

    let conversation = await Conversation.findOne({
      contactId: contact._id,
      channelId,
    });
    if (!conversation) {
      conversation = await Conversation.create({
        contactId: contact._id,
        channelId,
        status: "open",
        aiAutoReply: true,
        aiHandling: false,
        needsAttention: false,
        isArchived: false,
        aiSignals: { slaRisk: false, priority: 0, sentiment: "neutral" },
      });
    }

    try {
      const evolutionMessageId = await messageService.sendViaWhatsApp(
        channel.evolutionInstanceName,
        recipientId,
        text,
        "text",
      );
      await messageService.create({
        conversationId: conversation._id.toString(),
        channelId: channel._id.toString(),
        sender: "ai",
        content: text,
        contentType: "text",
        evolutionMessageId: evolutionMessageId || undefined,
        aiGenerated: true,
      });

      await PaymentReminderLog.findOneAndUpdate(
        { channelId, orderId },
        { $set: { lastSentAt: new Date() } },
        { upsert: true, new: true },
      );
      sent++;
      console.log(`[PaymentReminder] Sent for order ${orderId} -> contact ${contact._id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`order ${orderId}: ${msg}`);
    }
  }

  return { scanned, sent, skipped, errors };
}
