import mongoose, { Schema, Document } from "mongoose";

export interface IPaymentReminderLogDocument extends Document {
  _id: mongoose.Types.ObjectId;
  channelId: mongoose.Types.ObjectId;
  orderId: string;
  lastSentAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentReminderLogSchema = new Schema<IPaymentReminderLogDocument>(
  {
    channelId: {
      type: Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
    },
    orderId: {
      type: String,
      required: true,
      trim: true,
    },
    lastSentAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

paymentReminderLogSchema.index({ channelId: 1, orderId: 1 }, { unique: true });
paymentReminderLogSchema.index({ lastSentAt: -1 });

export const PaymentReminderLog = mongoose.model<IPaymentReminderLogDocument>(
  "PaymentReminderLog",
  paymentReminderLogSchema,
);
