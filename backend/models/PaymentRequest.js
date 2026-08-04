import mongoose from "mongoose";

const PaymentRequestSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    monthYear: { type: String, required: true },
    dueDate: { type: Date, required: true },
    rentAmount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    pendingAmount: { type: Number, required: true },
    requestAmount: { type: Number, required: true },
    paymentMode: { type: String, enum: ["online", "cash"], required: true },
    receiptUrl: { type: String, default: "" },
    cashGivenAt: { type: Date, default: null },
    status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending", index: true },
    rejectionReason: { type: String, default: "" },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

PaymentRequestSchema.index({ owner: 1, status: 1, createdAt: -1 });
PaymentRequestSchema.index({ tenantId: 1, monthYear: 1, status: 1 });

export default mongoose.model("PaymentRequest", PaymentRequestSchema);
