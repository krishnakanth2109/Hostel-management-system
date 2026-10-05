import mongoose from "mongoose";

const SafeErrorSchema = new mongoose.Schema(
  {
    code: { type: String, default: null },
    message: { type: String, default: null },
    status: { type: Number, default: null },
  },
  { _id: false }
);

const WhatsAppReminderLogSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    rentPayment: { type: mongoose.Schema.Types.ObjectId, ref: "RentPayment", required: true },
    monthlyPayment: { type: mongoose.Schema.Types.ObjectId, required: true },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null },
    recipientPhone: { type: String, required: true },
    dueDate: { type: Date, required: true },
    dueDateKey: { type: String, required: true },
    reminderType: {
      type: String,
      enum: ["TWO_DAYS_BEFORE", "DUE_TODAY"],
      required: true,
    },
    metaMessageId: { type: String, default: null },
    status: {
      type: String,
      enum: ["PROCESSING", "SENT", "FAILED"],
      required: true,
      default: "PROCESSING",
    },
    sendAttempted: { type: Boolean, default: false },
    duplicateSkipCount: { type: Number, default: 0 },
    duplicateSkipTodayDate: { type: String, default: null },
    duplicateSkipTodayCount: { type: Number, default: 0 },
    lastDuplicateSkippedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    error: { type: SafeErrorSchema, default: null },
  },
  { timestamps: true }
);

// A monthly rent cycle can have each of the two reminder types at most once.
WhatsAppReminderLogSchema.index(
  { rentPayment: 1, monthlyPayment: 1, dueDateKey: 1, reminderType: 1 },
  { unique: true, name: "unique_whatsapp_rent_reminder" }
);
WhatsAppReminderLogSchema.index({ owner: 1, status: 1, sentAt: -1 });
WhatsAppReminderLogSchema.index({ tenant: 1, status: 1, sentAt: -1 });
WhatsAppReminderLogSchema.index({ duplicateSkipTodayDate: 1 });

export default mongoose.model("WhatsAppReminderLog", WhatsAppReminderLogSchema);
