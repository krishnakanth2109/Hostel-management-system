import mongoose from "mongoose";

const PaymentEntrySchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  paidAt: { type: Date, default: Date.now },
  note: { type: String, default: "" },
});

const MonthlyPaymentSchema = new mongoose.Schema({
  monthYear: { type: String, required: true },
  dueDate: { type: Date, required: true },
  rentAmount: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ["Due", "Partial", "Paid"],
    default: "Due",
  },
  payments: [PaymentEntrySchema],
});

const RentPaymentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    monthlyPayments: [MonthlyPaymentSchema],
  },
  { timestamps: true }
);

// One rent ledger document per tenant.
RentPaymentSchema.index({ tenantId: 1 }, { unique: true });

export default mongoose.model("RentPayment", RentPaymentSchema);
