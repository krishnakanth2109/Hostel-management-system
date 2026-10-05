import mongoose from "mongoose";

const WhatsAppReminderSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "global", unique: true, immutable: true },
    globalEnabled: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("WhatsAppReminderSettings", WhatsAppReminderSettingsSchema);
