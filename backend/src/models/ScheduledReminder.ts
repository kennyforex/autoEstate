import mongoose, { Schema, Document } from 'mongoose';

export interface IScheduledReminderDocument extends Document {
  _id: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  channelId: mongoose.Types.ObjectId;
  skillSlug: string;
  fireAt: Date;
  reminderCount: number;
  maxReminders: number;
  delayMinutes: number;
  status: 'pending' | 'sent' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

const scheduledReminderSchema = new Schema<IScheduledReminderDocument>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    channelId: {
      type: Schema.Types.ObjectId,
      ref: 'Channel',
      required: true,
    },
    skillSlug: {
      type: String,
      required: true,
    },
    fireAt: {
      type: Date,
      required: true,
    },
    reminderCount: {
      type: Number,
      default: 0,
    },
    maxReminders: {
      type: Number,
      default: 1,
    },
    delayMinutes: {
      type: Number,
      default: 5,
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'cancelled'],
      default: 'pending',
    },
  },
  { timestamps: true },
);

scheduledReminderSchema.index({ conversationId: 1, status: 1 });
scheduledReminderSchema.index({ status: 1, fireAt: 1 });

export const ScheduledReminder = mongoose.model<IScheduledReminderDocument>(
  'ScheduledReminder',
  scheduledReminderSchema,
);
