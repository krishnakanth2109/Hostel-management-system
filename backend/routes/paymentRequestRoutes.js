import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import axios from "axios";
import { fileURLToPath } from "url";
import { v2 as cloudinary } from "cloudinary";
import Tenant from "../models/Tenant.js";
import RentPayment from "../models/Rentpayment.js";
import PaymentRequest from "../models/PaymentRequest.js";
import User from "../models/User.js";
import { SECURE_TENANT_ID_RE } from "../utils/tenantSecureId.js";
import { logActivity } from "../utils/activityLogger.js";
import { sendPushToOwner } from "../utils/pushService.js";
import { buildFullPaymentEmail, buildPartialPaymentEmail } from "./rentroutes.js";
import {
  CLOUDINARY_IMAGE_WIDTHS,
  withOptimizedPaymentRequestReceipt,
  withOptimizedTenantDocuments,
} from "../utils/cloudinaryDelivery.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, "..", "uploads", "payment-requests");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const CLOUDINARY_READY = !!(
  (process.env.CLOUDINARY_CLOUD_NAME || "").trim() &&
  (process.env.CLOUDINARY_API_KEY || "").trim() &&
  (process.env.CLOUDINARY_API_SECRET || "").trim()
);

if (CLOUDINARY_READY) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const upload = multer({
  storage: CLOUDINARY_READY ? multer.memoryStorage() : multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `receipt-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|webp)$|^application\/pdf$/.test(file.mimetype);
    cb(ok ? null : new Error("Only image or PDF receipts are allowed."), ok);
  },
});

function uploadReceiptToCloudinary(file) {
  if (!file) return Promise.resolve("");
  if (!CLOUDINARY_READY) return Promise.resolve(`/uploads/payment-requests/${file.filename}`);

  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder: "payment_requests", resource_type: "auto" }, (err, result) => {
        if (err) reject(err);
        else resolve(result.secure_url);
      })
      .end(file.buffer);
  });
}

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided." });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token." });
  }
};

const fmtINR = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

function parseMonthYear(value) {
  if (!/^\d{4}-\d{2}$/.test(value || "")) return null;
  const [year, monthNumber] = value.split("-").map(Number);
  if (monthNumber < 1 || monthNumber > 12) return null;
  return { year, month: monthNumber - 1, key: value };
}

function getDueDateForCycle(joiningDate, year, month) {
  const join = new Date(joiningDate);
  const day = Number.isNaN(join.getTime()) ? 1 : join.getDate();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

async function getOrCreateTenantRentDoc(tenant) {
  let rentDoc = await RentPayment.findOne({ tenantId: tenant._id });
  if (rentDoc) return rentDoc;
  try {
    return await RentPayment.create({ owner: tenant.owner, tenantId: tenant._id, monthlyPayments: [] });
  } catch (err) {
    if (err?.code === 11000) {
      rentDoc = await RentPayment.findOne({ tenantId: tenant._id });
      if (rentDoc) return rentDoc;
    }
    throw err;
  }
}

function refreshPaymentStatus(record) {
  const remaining = Math.max(0, Number(record.rentAmount || 0) - Number(record.paidAmount || 0));
  if (remaining <= 0) record.status = "Paid";
  else if (Number(record.paidAmount || 0) > 0) record.status = "Partial";
  else record.status = "Due";
}

async function getMonthSnapshot(tenant, monthYear) {
  const parsed = parseMonthYear(monthYear);
  if (!parsed) return null;
  const rentDoc = await getOrCreateTenantRentDoc(tenant);
  let record = rentDoc.monthlyPayments.find((payment) => payment.monthYear === parsed.key);
  if (!record) {
    record = {
      monthYear: parsed.key,
      dueDate: getDueDateForCycle(tenant.joiningDate, parsed.year, parsed.month),
      rentAmount: Number(tenant.rentAmount || 0),
      paidAmount: 0,
      status: "Due",
      payments: [],
    };
  }

  const rentAmount = Number(record.rentAmount || tenant.rentAmount || 0);
  const paidAmount = Number(record.paidAmount || 0);
  return {
    rentDoc,
    record,
    dueDate: record.dueDate,
    rentAmount,
    paidAmount,
    pendingAmount: Math.max(0, rentAmount - paidAmount),
  };
}

async function sendBrevoEmail(toEmail, toName, subject, htmlContent) {
  if (!toEmail) return;
  const apiKey = (process.env.BREVO_API_KEY || "").trim();
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || "").trim();
  const senderName = (process.env.BREVO_SENDER_NAME || "Nilayam Hostel Manager").trim();
  if (!apiKey || !senderEmail) return;

  await axios.post("https://api.brevo.com/v3/smtp/email", {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: toEmail, name: toName }],
    subject,
    htmlContent,
  }, {
    headers: { "Content-Type": "application/json", "api-key": apiKey },
  });
}

function paymentDecisionEmail({ tenant, request, approved, reason = "" }) {
  const title = approved ? "Payment Request Approved" : "Payment Request Rejected";
  const color = approved ? "#059669" : "#dc2626";
  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;padding:28px;">
      <div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
        <div style="background:${color};color:#fff;padding:22px 26px;">
          <h2 style="margin:0;font-size:22px;">${title}</h2>
        </div>
        <div style="padding:24px 26px;color:#0f172a;">
          <p>Hello <strong>${tenant.name}</strong>,</p>
          <p>Your payment request for <strong>${request.monthYear}</strong> of <strong>${fmtINR(request.requestAmount)}</strong> has been <strong>${approved ? "approved" : "rejected"}</strong>.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
          <p style="color:#64748b;font-size:13px;">Please contact your hostel management for any clarification.</p>
        </div>
      </div>
    </div>`;
}

function withAdminApprovalNote(email) {
  const note = `<div class="note-box"><strong>Payment approved by admin.</strong></div>`;
  return {
    ...email,
    html: email.html.includes('<hr class="divider" />')
      ? email.html.replace('<hr class="divider" />', `${note}<hr class="divider" />`)
      : email.html.replace("</body>", `${note}</body>`),
  };
}

async function notifyOwnerPaymentRequest(ownerId, tenant, request) {
  try {
    const owner = await User.findById(ownerId).select("owner name");
    const ownerName = owner?.owner || owner?.name || "there";
    await sendPushToOwner(ownerId, {
      title: "Payment Request",
      body: `Hi ${ownerName}, ${tenant.name} has submitted a payment request. Please review and confirm the payment.`,
      data: {
        type: "payment-request",
        paymentRequestId: String(request._id),
        tenantId: String(tenant._id),
        ownerId: String(ownerId),
        submittedAt: new Date(request.createdAt || Date.now()).toISOString(),
      },
    });
  } catch (err) {
    console.error("Payment request push failed:", err.message);
  }
}

router.post("/public/tenant/:secureId/payment-request", upload.single("receipt"), async (req, res) => {
  try {
    const secureId = String(req.params.secureId || "").trim().toLowerCase();
    if (!SECURE_TENANT_ID_RE.test(secureId)) return res.status(404).json({ message: "Invalid or expired link." });

    const tenant = await Tenant.findOne({ secureId, status: "Active" }).select("+secureId");
    if (!tenant) return res.status(404).json({ message: "Invalid or expired link." });

    const { monthYear, requestAmount, paymentMode, cashGivenAt } = req.body;
    const amount = Number(requestAmount || 0);
    if (!parseMonthYear(monthYear)) return res.status(400).json({ message: "Valid month is required." });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: "Valid request amount is required." });
    if (!["online", "cash"].includes(paymentMode)) return res.status(400).json({ message: "Valid payment mode is required." });
    if (paymentMode === "online" && !req.file) return res.status(400).json({ message: "Receipt is required for online payment." });
    if (paymentMode === "cash" && !cashGivenAt) return res.status(400).json({ message: "Cash given date and time is required." });

    const existingPending = await PaymentRequest.findOne({ tenantId: tenant._id, monthYear, status: "Pending" }).lean();
    if (existingPending) return res.status(409).json({ message: "A payment request for this month is already pending." });

    const snapshot = await getMonthSnapshot(tenant, monthYear);
    if (!snapshot || snapshot.pendingAmount <= 0) return res.status(400).json({ message: "This month is already paid." });
    if (amount > snapshot.pendingAmount) return res.status(400).json({ message: "Request amount cannot exceed pending amount." });

    const receiptUrl = paymentMode === "online" ? await uploadReceiptToCloudinary(req.file) : "";

    const paymentRequest = await PaymentRequest.create({
      owner: tenant.owner,
      tenantId: tenant._id,
      monthYear,
      dueDate: snapshot.dueDate,
      rentAmount: snapshot.rentAmount,
      paidAmount: snapshot.paidAmount,
      pendingAmount: snapshot.pendingAmount,
      requestAmount: amount,
      paymentMode,
      receiptUrl,
      cashGivenAt: paymentMode === "cash" ? new Date(cashGivenAt) : null,
    });

    notifyOwnerPaymentRequest(tenant.owner, tenant, paymentRequest);

    res.status(201).json({ message: "Payment request submitted successfully. Waiting for owner approval." });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error." });
  }
});

router.get("/", auth, async (req, res) => {
  try {
    const requests = await PaymentRequest.find({ owner: req.user.id })
      .populate("tenantId", "name phone email allocationInfo documents")
      .sort({ createdAt: -1 })
      .lean();
    res.json(requests.map((request) => {
      const optimized = withOptimizedPaymentRequestReceipt(request);
      const tenant = optimized.tenantId;
      return {
        ...optimized,
        tenantId: tenant && withOptimizedTenantDocuments(tenant, {
          passportWidth: CLOUDINARY_IMAGE_WIDTHS.card,
          passportHeight: CLOUDINARY_IMAGE_WIDTHS.card,
          passportCrop: "fill",
          documentWidth: CLOUDINARY_IMAGE_WIDTHS.documentThumb,
        }),
      };
    }));
  } catch (err) {
    res.status(500).json({ message: "Server error." });
  }
});

router.patch("/:id/approve", auth, async (req, res) => {
  try {
    const request = await PaymentRequest.findOne({ _id: req.params.id, owner: req.user.id, status: "Pending" });
    if (!request) return res.status(404).json({ message: "Pending request not found." });

    const tenant = await Tenant.findOne({ _id: request.tenantId, owner: req.user.id });
    if (!tenant) return res.status(404).json({ message: "Tenant not found." });

    const snapshot = await getMonthSnapshot(tenant, request.monthYear);
    let record = snapshot.rentDoc.monthlyPayments.find((payment) => payment.monthYear === request.monthYear);
    if (!record) {
      snapshot.rentDoc.monthlyPayments.push({
        monthYear: request.monthYear,
        dueDate: request.dueDate,
        rentAmount: Number(request.rentAmount || tenant.rentAmount || 0),
        paidAmount: 0,
        status: "Due",
        payments: [],
      });
      record = snapshot.rentDoc.monthlyPayments.find((payment) => payment.monthYear === request.monthYear);
    }

    const actualPay = Math.min(Number(request.requestAmount || 0), Math.max(0, Number(record.rentAmount || 0) - Number(record.paidAmount || 0)));
    if (actualPay <= 0) return res.status(400).json({ message: "This month is already paid." });

    record.paidAmount = Number(record.paidAmount || 0) + actualPay;
    record.payments.push({
      amount: actualPay,
      paidAt: new Date(),
      note: `Approved tenant ${request.paymentMode} payment request`,
    });
    refreshPaymentStatus(record);
    await snapshot.rentDoc.save();

    request.status = "Approved";
    request.decidedAt = new Date();
    request.decidedBy = req.user.id;
    await request.save();

    await logActivity(req.user.id, "PAYMENT", "Rent", `Approved payment request of ₹${actualPay} from ${tenant.name}`);
    const buildingDetails = tenant.allocationInfo?.buildingName
      ? {
          buildingName: tenant.allocationInfo.buildingName,
          floorNumber: tenant.allocationInfo.floorNumber,
          roomNumber: tenant.allocationInfo.roomNumber,
        }
      : null;
    const responseRecord = record?.toObject ? record.toObject() : { ...record };
    const emailTemplate = withAdminApprovalNote(
      record.status === "Paid"
        ? buildFullPaymentEmail({ tenant, record: responseRecord, paymentAmount: actualPay, buildingDetails })
        : buildPartialPaymentEmail({ tenant, record: responseRecord, paymentAmount: actualPay, buildingDetails })
    );

    sendBrevoEmail(
      tenant.email,
      tenant.name,
      emailTemplate.subject,
      emailTemplate.html
    ).catch((err) => console.error("Payment confirmation email failed:", err.message));

    res.json({ message: "Payment request approved and rent updated." });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error." });
  }
});

router.patch("/:id/reject", auth, async (req, res) => {
  try {
    const reason = String(req.body?.reason || "").trim();
    if (!reason) return res.status(400).json({ message: "Rejection reason is required." });

    const request = await PaymentRequest.findOne({ _id: req.params.id, owner: req.user.id, status: "Pending" });
    if (!request) return res.status(404).json({ message: "Pending request not found." });

    const tenant = await Tenant.findOne({ _id: request.tenantId, owner: req.user.id }).lean();
    if (!tenant) return res.status(404).json({ message: "Tenant not found." });

    request.status = "Rejected";
    request.rejectionReason = reason;
    request.decidedAt = new Date();
    request.decidedBy = req.user.id;
    await request.save();

    sendBrevoEmail(
      tenant.email,
      tenant.name,
      "Payment Request Rejected",
      paymentDecisionEmail({ tenant, request, approved: false, reason })
    ).catch((err) => console.error("Payment rejection email failed:", err.message));

    res.json({ message: "Payment request rejected." });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error." });
  }
});

export default router;
