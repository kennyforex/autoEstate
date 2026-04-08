import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '../types/index.js';
import { ScheduledReminder } from '../models/ScheduledReminder.js';
import { Conversation } from '../models/Conversation.js';
import { Channel } from '../models/Channel.js';
import { Contact } from '../models/Contact.js';
import { messageService } from './message.service.js';
import { recipientJidForEvolutionSend } from '../utils/helpers.js';

const NUDGE_MESSAGES = [
  '?',
  'Still there?',
  'Hi! Are you still there?',
  'Just checking in — would you like to continue?',
  'Take your time! Let me know when you\'re ready.',
  'Hey! Did you still want to proceed?',
];

/** Matches `slug: payment-collection` in SKILL.md for 追收款項 */
const PAYMENT_COLLECTION_SLUG = 'payment-collection';

const PAYMENT_NUDGE_MESSAGES = [
  '您好，請問方便處理訂單尾款嗎？如有疑問請話我知。',
  'Just checking — would you like to complete payment for your order? Happy to help.',
  '提醒：尚有訂單款項未付，方便時請回覆或付款，謝謝。',
];

function pickNudge(): string {
  return NUDGE_MESSAGES[Math.floor(Math.random() * NUDGE_MESSAGES.length)];
}

function pickNudgeForSkill(skillSlug: string): string {
  if (skillSlug === PAYMENT_COLLECTION_SLUG) {
    return PAYMENT_NUDGE_MESSAGES[Math.floor(Math.random() * PAYMENT_NUDGE_MESSAGES.length)];
  }
  return pickNudge();
}

export interface ReminderConfig {
  conversationId: string;
  channelId: string;
  skillSlug: string;
  delayMinutes: number;
  maxReminders: number;
}

class ReminderService {
  private io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;
  private timers = new Map<string, NodeJS.Timeout>();

  setIO(io: Server<ClientToServerEvents, ServerToClientEvents>): void {
    this.io = io;
  }

  async schedule(config: ReminderConfig): Promise<void> {
    // Cancel any existing pending reminder for this conversation first
    await this.cancelForConversation(config.conversationId);

    const fireAt = new Date(Date.now() + config.delayMinutes * 60 * 1000);

    const reminder = await ScheduledReminder.create({
      conversationId: config.conversationId,
      channelId: config.channelId,
      skillSlug: config.skillSlug,
      fireAt,
      reminderCount: 0,
      maxReminders: config.maxReminders,
      delayMinutes: config.delayMinutes,
      status: 'pending',
    });

    this.armTimer(reminder._id.toString(), fireAt);
    console.log(`[Reminder] Scheduled for conversation ${config.conversationId} in ${config.delayMinutes}min (id=${reminder._id})`);
  }

  async cancelForConversation(conversationId: string): Promise<number> {
    const pending = await ScheduledReminder.find({
      conversationId,
      status: 'pending',
    });

    if (pending.length === 0) return 0;

    for (const r of pending) {
      r.status = 'cancelled';
      await r.save();
      const id = r._id.toString();
      const timer = this.timers.get(id);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(id);
      }
    }

    console.log(`[Reminder] Cancelled ${pending.length} pending reminder(s) for conversation ${conversationId}`);
    return pending.length;
  }

  async fire(reminderId: string): Promise<void> {
    this.timers.delete(reminderId);

    const reminder = await ScheduledReminder.findById(reminderId);
    if (!reminder || reminder.status !== 'pending') return;

    try {
      const conversation = await Conversation.findById(reminder.conversationId)
        .populate('channelId')
        .populate('contactId');
      if (!conversation) {
        console.warn(`[Reminder] Conversation ${reminder.conversationId} not found — skipping`);
        reminder.status = 'cancelled';
        await reminder.save();
        return;
      }

      const channel = await Channel.findById(conversation.channelId);
      const contact = await Contact.findById(conversation.contactId);
      if (!channel || !contact) {
        console.warn(`[Reminder] Channel or contact not found — skipping`);
        reminder.status = 'cancelled';
        await reminder.save();
        return;
      }

      const recipientId = recipientJidForEvolutionSend(contact);
      if (!recipientId) {
        console.warn(`[Reminder] No recipient ID for contact — skipping`);
        reminder.status = 'cancelled';
        await reminder.save();
        return;
      }

      const nudge = pickNudgeForSkill(reminder.skillSlug);

      // Send via WhatsApp
      const evolutionMessageId = await messageService.sendViaWhatsApp(
        channel.evolutionInstanceName,
        recipientId,
        nudge,
        'text',
      );

      // Save as AI message in DB
      await messageService.create({
        conversationId: reminder.conversationId.toString(),
        channelId: channel._id.toString(),
        sender: 'ai',
        content: nudge,
        contentType: 'text',
        evolutionMessageId: evolutionMessageId || undefined,
        aiGenerated: true,
      });

      console.log(`[Reminder] Sent nudge "${nudge}" to conversation ${reminder.conversationId} (count=${reminder.reminderCount + 1}/${reminder.maxReminders})`);

      // Update reminder
      reminder.reminderCount += 1;
      reminder.status = 'sent';
      await reminder.save();

      // Schedule next reminder if under max
      if (reminder.reminderCount < reminder.maxReminders) {
        const escalatedDelay = Math.round(reminder.delayMinutes * 1.5);
        const nextFireAt = new Date(Date.now() + escalatedDelay * 60 * 1000);

        const next = await ScheduledReminder.create({
          conversationId: reminder.conversationId,
          channelId: reminder.channelId,
          skillSlug: reminder.skillSlug,
          fireAt: nextFireAt,
          reminderCount: reminder.reminderCount,
          maxReminders: reminder.maxReminders,
          delayMinutes: escalatedDelay,
          status: 'pending',
        });

        this.armTimer(next._id.toString(), nextFireAt);
        console.log(`[Reminder] Scheduled follow-up #${reminder.reminderCount + 1} in ${escalatedDelay}min`);
      }
    } catch (err: any) {
      console.error(`[Reminder] Failed to fire reminder ${reminderId}:`, err.message);
      reminder.status = 'cancelled';
      await reminder.save();
    }
  }

  async loadPendingOnBoot(): Promise<void> {
    const pending = await ScheduledReminder.find({ status: 'pending' });
    if (pending.length === 0) {
      console.log('[Reminder] No pending reminders to restore');
      return;
    }

    const now = Date.now();
    let armed = 0;
    let firedImmediately = 0;

    for (const r of pending) {
      const remaining = r.fireAt.getTime() - now;
      if (remaining <= 0) {
        firedImmediately++;
        setImmediate(() => this.fire(r._id.toString()));
      } else {
        this.armTimer(r._id.toString(), r.fireAt);
        armed++;
      }
    }

    console.log(`[Reminder] Restored ${pending.length} pending reminder(s): ${armed} armed, ${firedImmediately} firing immediately`);
  }

  private armTimer(reminderId: string, fireAt: Date): void {
    const delay = Math.max(0, fireAt.getTime() - Date.now());
    const timer = setTimeout(() => this.fire(reminderId), delay);
    timer.unref();
    this.timers.set(reminderId, timer);
  }
}

export const reminderService = new ReminderService();
