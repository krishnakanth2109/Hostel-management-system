import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import axios from "axios";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import Tenant from "../models/Tenant.js";
import RentPayment from "../models/Rentpayment.js";
import Building from "../models/Building.js";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import { logActivity } from "../utils/activityLogger.js";
import { sendPushToOwner } from "../utils/pushService.js";
import {
  CLOUDINARY_IMAGE_WIDTHS,
  withOptimizedTenantDocuments,
} from "../utils/cloudinaryDelivery.js";
import { generateFirstRentDueWithCatchUpFallback } from "../services/rentDueGeneration.js";

const router = express.Router();

// ── Real-time push to the owner when a tenant submits the onboarding form ──────
// Fire-and-forget: a push failure must never break the tenant's registration.
async function notifyOwnerOnboarding(ownerId, tenant) {
  try {
    const owner = await User.findById(ownerId).select("owner name");
    const ownerName = owner?.owner || owner?.name || "there";
    const submittedAt = tenant.createdAt || new Date();
    const time = new Date(submittedAt).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    const loc = tenant.allocationInfo?.buildingName
      ? ` (${tenant.allocationInfo.buildingName} • Room ${tenant.allocationInfo.roomNumber})`
      : "";
    await sendPushToOwner(ownerId, {
      title: "New Onboarding Submission 📥",
      body: `Hi ${ownerName}, ${tenant.name} just submitted the onboarding form${loc} at ${time}. Tap to review.`,
      data: {
        type: "onboarding-submission",
        tenantId: String(tenant._id),
        ownerId: String(ownerId),
        submittedAt: new Date(submittedAt).toISOString(),
      },
    });
  } catch (e) {
    console.error("Onboarding push failed:", e.message);
  }
}

// ── __dirname for ES modules ──────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ── In-memory short-token store ───────────────────────────────────────────────
const shortTokenStore = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of shortTokenStore.entries()) {
    if (v.expiresAt < now) shortTokenStore.delete(k);
  }
}, 60 * 60 * 1000);

// ── In-memory OTP store (5-digit, 10-min expiry) ──────────────────────────────
const emailOtpStore = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of emailOtpStore.entries()) {
    if (v.expiresAt < now) emailOtpStore.delete(k);
  }
}, 5 * 60 * 1000);

// ── Brevo email helper (same pattern as rentRoutes.js) ────────────────────────
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

async function sendBrevoEmail(toEmail, toName, subject, htmlContent) {
  const apiKey      = (process.env.BREVO_API_KEY       || "").trim();
  const senderEmail = (process.env.BREVO_SENDER_EMAIL  || "").trim();
  const senderName  = (process.env.BREVO_SENDER_NAME   || "Nilayam Hostel").trim();
  if (!apiKey || !senderEmail) throw new Error("Brevo credentials missing in .env");
  const { data } = await axios.post(BREVO_API_URL, {
    sender: { name: senderName, email: senderEmail },
    to:     [{ email: toEmail, name: toName }],
    subject,
    htmlContent,
  }, {
    headers: { "Content-Type": "application/json", "api-key": apiKey },
  });
  return data;
}

// ── OTP email template ────────────────────────────────────────────────────────
const otpEmailHtml = (otpCode) => `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Tahoma,sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="padding:40px 15px;">
    <tr><td align="center">
      <table width="520" cellspacing="0" cellpadding="0"
             style="background:#fff;border-radius:16px;overflow:hidden;
                    box-shadow:0 8px 24px rgba(0,0,0,0.09);">
        <tr>
          <td style="background:linear-gradient(135deg,#1e1b4b,#4338ca,#6366f1);
                     padding:36px 32px;text-align:center;">
            <div style="font-size:40px;margin-bottom:10px;">🏨</div>
            <h1 style="margin:0;font-size:22px;color:#fff;font-weight:800;">
              Verify Your Email
            </h1>
            <p style="margin:8px 0 0;color:#c7d2fe;font-size:13px;">
              Nilayam Hostel — Tenant Onboarding
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px;">
            <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
              Use the one-time code below to verify your email address.
              This code expires in <strong>10 minutes</strong>.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <span style="display:inline-block;letter-spacing:10px;font-size:42px;
                           font-weight:800;color:#4338ca;background:#eef2ff;
                           padding:16px 32px;border-radius:14px;
                           border:2px solid #c7d2fe;">
                ${otpCode}
              </span>
            </div>
            <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;line-height:1.6;">
              Do not share this code with anyone.<br/>
              If you did not request this, please ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;text-align:center;
                     font-size:12px;color:#9ca3af;">
            &copy; ${new Date().getFullYear()} Nilayam Hostel Management
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ── POST /api/tenants/send-email-otp ─────────────────────────────────────────
const advanceAmountUpdatedEmailHtml = ({ tenant, previousAdvance, newAdvance, paidAdvance }) => {
  const fmtINR = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
  const pendingAdvance = Math.max(0, Number(newAdvance || 0) - Number(paidAdvance || 0));
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Tahoma,sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="padding:32px 15px;">
    <tr><td align="center">
      <table width="560" cellspacing="0" cellpadding="0" style="background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,0.10);">
        <tr>
          <td style="background:linear-gradient(135deg,#d97706,#f59e0b);padding:30px 32px;text-align:center;">
            <div style="font-size:38px;margin-bottom:8px;">💳</div>
            <h1 style="margin:0;font-size:22px;color:#fff;font-weight:800;">Advance Amount Updated</h1>
            <p style="margin:8px 0 0;color:#fffbeb;font-size:13px;">Nilayam Hostel Management</p>
          </td>
        </tr>
        <tr>
          <td style="padding:30px 32px;">
            <p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.7;">
              Hello <strong>${tenant.name}</strong>, your hostel advance amount has been updated by management.
            </p>
            <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:18px;margin-bottom:20px;">
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #ffedd5;"><span style="color:#6b7280;font-size:13px;">Previous Advance</span><strong style="color:#111827;font-size:14px;">${fmtINR(previousAdvance)}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #ffedd5;"><span style="color:#6b7280;font-size:13px;">Advance Expected</span><strong style="color:#d97706;font-size:14px;">${fmtINR(newAdvance)}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #ffedd5;"><span style="color:#6b7280;font-size:13px;">Advance Paid</span><strong style="color:#047857;font-size:14px;">${fmtINR(paidAdvance)}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:8px 0;"><span style="color:#6b7280;font-size:13px;">Advance Pending</span><strong style="color:${pendingAdvance > 0 ? "#dc2626" : "#047857"};font-size:14px;">${fmtINR(pendingAdvance)}</strong></div>
            </div>
            <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.7;">Please complete any pending advance payment or contact your hostel manager for assistance.</p>
          </td>
        </tr>
        <tr><td style="background:#f8fafc;padding:16px 32px;text-align:center;font-size:12px;color:#9ca3af;">This is an automated message. Please do not reply to this email.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

const escapeEmailText = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const shortStayMoney = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(Number(value || 0));

const shortStayEmailDate = (value) => new Date(value).toLocaleDateString("en-IN", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
});

function shortStayEmailLayout({ tenant, title, intro, accent, badge, amountLabel, amount, rows, footer }) {
  const safeName = escapeEmailText(tenant.name);
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:32px 14px">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 12px 36px rgba(15,23,42,.12)">
        <tr><td style="background:${accent};padding:28px 30px;color:#fff"><div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.85">Nilayam · Short Stay</div><h1 style="margin:8px 0 0;font-size:23px">${title}</h1></td></tr>
        <tr><td style="padding:28px 30px"><p style="margin:0 0 9px;font-size:17px;font-weight:800">Hello ${safeName},</p><p style="margin:0;color:#475569;font-size:14px;line-height:1.7">${intro}</p>
          <div style="margin:22px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:20px;text-align:center"><div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.08em">${amountLabel}</div><div style="margin:7px 0;font-size:30px;font-weight:900;color:${accent}">${shortStayMoney(amount)}</div><span style="display:inline-block;border-radius:999px;background:${accent}18;color:${accent};padding:6px 11px;font-size:11px;font-weight:800">${badge}</span></div>
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border:1px solid #e2e8f0;border-radius:14px;border-collapse:separate;border-spacing:0;overflow:hidden;background:#ffffff">${rows.map(([label, value], index) => `<tr><td width="46%" valign="top" style="width:46%;padding:13px 16px;color:#64748b;font-size:13px;line-height:1.45;border-bottom:${index < rows.length - 1 ? "1px solid #eef2f7" : "0"};">${escapeEmailText(label)}</td><td width="54%" valign="top" align="right" style="width:54%;padding:13px 16px 13px 24px;color:#0f172a;font-size:13px;font-weight:700;line-height:1.45;text-align:right;word-break:break-word;border-bottom:${index < rows.length - 1 ? "1px solid #eef2f7" : "0"};">${escapeEmailText(value)}</td></tr>`).join("")}</table>
          <p style="margin:20px 0 0;padding:13px 14px;background:#f8fafc;border-radius:10px;color:#64748b;font-size:12px;line-height:1.6">${footer}</p>
        </td></tr><tr><td style="padding:15px;text-align:center;background:#f8fafc;color:#94a3b8;font-size:11px">Automated email from Nilayam Hostel Management</td></tr>
      </table></td></tr></table></body></html>`;
}

function shortStayPaymentEmail({ tenant, paymentAmount, paymentType, note }) {
  const total = Number(tenant.shortStayTotalAmount || 0);
  const paid = Number(tenant.shortStayPaidAmount || 0);
  const rentDue = Math.max(0, total - paid);
  const advanceAmount = Number(tenant.advanceAmount || 0);
  const paidAdvance = Number(tenant.paidadvanceAmount || 0);
  const advanceDue = Math.max(0, advanceAmount - paidAdvance);
  const due = rentDue + advanceDue;
  const fullyPaid = due <= 0;
  const paymentLabel = paymentType === "advance" ? "Advance payment" : "Booking rent payment";
  return {
    subject: fullyPaid
      ? `Short Stay Payment Complete - ${shortStayMoney(total)}`
      : `Short Stay Payment Received - ${shortStayMoney(due)} Remaining`,
    html: shortStayEmailLayout({
      tenant,
      title: fullyPaid ? "Payment received in full" : "Payment received",
      intro: `We have received your ${paymentLabel.toLowerCase()} of <strong>${shortStayMoney(paymentAmount)}</strong>. ${fullyPaid ? "Your booking and advance payments are now fully settled." : `A total balance of <strong>${shortStayMoney(due)}</strong> is still pending.`}`,
      accent: fullyPaid ? "#059669" : "#d97706",
      badge: fullyPaid ? "Paid in full" : "Partially paid",
      amountLabel: paymentLabel,
      amount: paymentAmount,
      rows: [
        ["Stay period", `${shortStayEmailDate(tenant.shortStayFrom)} to ${shortStayEmailDate(tenant.shortStayTo)}`],
        ["Per-day amount", shortStayMoney(tenant.shortStayPerDayAmount)],
        ["Booking total", shortStayMoney(total)],
        ["Booking rent paid", shortStayMoney(paid)],
        ["Booking rent due", shortStayMoney(rentDue)],
        ["Advance required", shortStayMoney(advanceAmount)],
        ["Advance paid", shortStayMoney(paidAdvance)],
        ["Advance due", shortStayMoney(advanceDue)],
        ["Total outstanding", shortStayMoney(due)],
        ["Payment note", note || "Short-stay payment"],
      ],
      footer: "Please keep this email as your short-stay payment record.",
    }),
  };
}

function shortStayReminderEmail(tenant) {
  const total = Number(tenant.shortStayTotalAmount || 0);
  const paid = Number(tenant.shortStayPaidAmount || 0);
  const rentDue = Math.max(0, total - paid);
  const advanceAmount = Number(tenant.advanceAmount || 0);
  const paidAdvance = Number(tenant.paidadvanceAmount || 0);
  const advanceDue = Math.max(0, advanceAmount - paidAdvance);
  const due = rentDue + advanceDue;
  const rows = [
    ["Stay period", `${shortStayEmailDate(tenant.shortStayFrom)} to ${shortStayEmailDate(tenant.shortStayTo)}`],
    ["Per-day amount", shortStayMoney(tenant.shortStayPerDayAmount)],
    ["Booking total", shortStayMoney(total)],
    ["Booking rent paid", shortStayMoney(paid)],
    ["Booking rent due", shortStayMoney(rentDue)],
  ];
  if (advanceAmount > 0) {
    rows.push(
      ["Advance required", shortStayMoney(advanceAmount)],
      ["Advance paid", shortStayMoney(paidAdvance)],
      ["Advance due", shortStayMoney(advanceDue)],
    );
  }
  rows.push(["Total amount due", shortStayMoney(due)]);
  return {
    subject: `Short Stay Payment Reminder - ${shortStayMoney(due)} Due`,
    html: shortStayEmailLayout({
      tenant,
      title: "Short-stay payment reminder",
      intro: `This is a friendly reminder that <strong>${shortStayMoney(due)}</strong> is pending for your short-stay booking. Please complete the payment at your earliest convenience.`,
      accent: "#dc2626",
      badge: "Payment due",
      amountLabel: "Amount pending",
      amount: due,
      rows,
      footer: "If you have already completed this payment, please contact your hostel manager.",
    }),
  };
}

router.post("/send-email-otp", async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Valid email is required." });
    }

    // Generate 5-digit OTP
    const otp = String(Math.floor(10000 + Math.random() * 90000));

    // Store with 10-min expiry
    emailOtpStore.set(email.toLowerCase().trim(), {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    await sendBrevoEmail(
      email.trim(),
      name || "Tenant",
      "Your Email Verification OTP — Nilayam Hostel",
      otpEmailHtml(otp)
    );

    console.log(`✅ OTP sent to ${email}`);
    return res.status(200).json({ success: true, message: "OTP sent to your email." });
  } catch (err) {
    console.error("❌ OTP send error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to send OTP. Please try again." });
  }
});

// ── POST /api/tenants/verify-email-otp ───────────────────────────────────────
router.post("/verify-email-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const key   = (email || "").toLowerCase().trim();
    const entry = emailOtpStore.get(key);

    if (!entry) {
      return res.status(400).json({ success: false, message: "OTP expired or not found. Please request a new one." });
    }
    if (Date.now() > entry.expiresAt) {
      emailOtpStore.delete(key);
      return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
    }
    if (entry.otp !== String(otp).trim()) {
      return res.status(400).json({ success: false, message: "Incorrect OTP. Please try again." });
    }

    // Valid — delete used OTP
    emailOtpStore.delete(key);
    return res.status(200).json({ success: true, message: "Email verified successfully." });
  } catch (err) {
    console.error("❌ OTP verify error:", err.message);
    return res.status(500).json({ success: false, message: "Verification failed. Please try again." });
  }
});

// ── Cloudinary setup ──────────────────────────────────────────────────────────
const CLD_CLOUD = (process.env.CLOUDINARY_CLOUD_NAME || "").trim();
const CLD_KEY   = (process.env.CLOUDINARY_API_KEY    || "").trim();
const CLD_SEC   = (process.env.CLOUDINARY_API_SECRET || "").trim();

const CLOUDINARY_READY = !!(CLD_CLOUD && CLD_KEY && CLD_SEC);

if (CLOUDINARY_READY) {
  cloudinary.config({ cloud_name: CLD_CLOUD, api_key: CLD_KEY, api_secret: CLD_SEC });
  console.log("✅ Cloudinary configured — documents will be uploaded to Cloudinary");
} else {
  console.warn("⚠️  Cloudinary env vars missing/empty. Falling back to local disk storage.");
}

// ── Local disk storage ────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "tenant-docs");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext    = path.extname(file.originalname).toLowerCase() || ".jpg";
    const unique = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
    cb(null, `${file.fieldname}-${unique}${ext}`);
  },
});

// ── Multer instance ───────────────────────────────────────────────────────────
const upload = multer({
  storage: CLOUDINARY_READY ? multer.memoryStorage() : diskStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|webp)|application\/pdf$/.test(file.mimetype);
    ok ? cb(null, true) : cb(new Error("Only JPG, PNG, WEBP or PDF files are allowed"));
  },
});

// ── Cloudinary upload helper ──────────────────────────────────────────────────
const uploadToCloudinary = (buffer, folder) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder, resource_type: "auto" }, (err, result) =>
        err ? reject(err) : resolve(result.secure_url)
      )
      .end(buffer);
  });

// ── Document URL resolver ─────────────────────────────────────────────────────
const resolveDocUrls = async (files) => {
  const docs = { aadharFront: null, aadharBack: null, passportPhoto: null };
  if (!files) return docs;

  const resolveOne = async (fileArr, folder) => {
    if (!fileArr || !fileArr[0]) return null;
    const f = fileArr[0];

    if (CLOUDINARY_READY) {
      try {
        const url = await uploadToCloudinary(f.buffer, folder);
        return url;
      } catch (err) {
        console.error(`❌ Cloudinary upload FAILED:`, err.message);
        throw new Error(`Cloudinary upload failed: ${err.message}`);
      }
    }
    const backendBase = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, "");
    return `${backendBase}/uploads/tenant-docs/${f.filename}`;
  };

  docs.aadharFront   = await resolveOne(files.aadharFront,   "tenant_documents/aadhar");
  docs.aadharBack    = await resolveOne(files.aadharBack,    "tenant_documents/aadhar");
  docs.passportPhoto = await resolveOne(files.passportPhoto, "tenant_documents/passport");
  return docs;
};

// ── Auth middleware ───────────────────────────────────────────────────────────
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

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ══════════════════════════════════════════════════════════════════════════════

function isFutureJoiningDate(joiningDate) {
  if (!joiningDate) return false;
  const selected = new Date(`${joiningDate}T00:00:00`);
  if (Number.isNaN(selected.getTime())) return false;
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  return selected.getTime() > todayEnd.getTime();
}

function parseJoiningDate(joiningDate) {
  if (!joiningDate) return null;
  const value = joiningDate instanceof Date
    ? joiningDate
    : new Date(typeof joiningDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(joiningDate)
      ? `${joiningDate}T00:00:00`
      : joiningDate);
  return Number.isNaN(value.getTime()) ? null : value;
}

function shortStayDetails({ shortStayFrom, shortStayTo, shortStayPerDayAmount }) {
  const from = parseJoiningDate(shortStayFrom);
  const to = parseJoiningDate(shortStayTo);
  const perDayAmount = Number(shortStayPerDayAmount);
  if (!from || !to) return { error: "Enter valid short-stay from and to dates." };
  const fromDay = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toDay = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  if (toDay < fromDay) return { error: "Short-stay to date cannot be before the from date." };
  if (!Number.isFinite(perDayAmount) || perDayAmount <= 0) {
    return { error: "Enter a valid per-day amount." };
  }
  const totalDays = Math.floor((toDay - fromDay) / 86400000) + 1;
  return { from, to, perDayAmount, totalDays, totalAmount: totalDays * perDayAmount };
}

function monthIndex(date) {
  return date.getFullYear() * 12 + date.getMonth();
}

function parseMonthYear(monthYear) {
  if (!/^\d{4}-\d{2}$/.test(monthYear || "")) return null;
  const [year, monthNumber] = monthYear.split("-").map(Number);
  if (monthNumber < 1 || monthNumber > 12) return null;
  return { year, month: monthNumber - 1 };
}

function getDueDateForJoiningCycle(joiningDate, year, month) {
  const joinDay = joiningDate.getDate();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(joinDay, lastDay));
}

async function cleanupRentPaymentsBeforeJoiningDate({ tenantId, ownerId, joiningDate, previousJoiningDate }) {
  const nextJoiningDate = parseJoiningDate(joiningDate);
  const oldJoiningDate = parseJoiningDate(previousJoiningDate);
  if (!nextJoiningDate || !oldJoiningDate) return { removedCount: 0, updatedCount: 0 };

  const nextStartMonth = monthIndex(nextJoiningDate);
  const oldStartMonth = monthIndex(oldJoiningDate);
  const shouldRemovePastMonths = nextStartMonth > oldStartMonth;

  const rentDoc = await RentPayment.findOne({ tenantId, owner: ownerId });
  if (!rentDoc) return { removedCount: 0, updatedCount: 0 };

  const originalCount = rentDoc.monthlyPayments.length;
  let updatedCount = 0;
  rentDoc.monthlyPayments = rentDoc.monthlyPayments.filter((payment) => {
    const parsed = parseMonthYear(payment.monthYear);
    if (!parsed) return true;

    if (shouldRemovePastMonths && monthIndex(new Date(parsed.year, parsed.month, 1)) < nextStartMonth) {
      return false;
    }

    const nextDueDate = getDueDateForJoiningCycle(nextJoiningDate, parsed.year, parsed.month);
    if (new Date(payment.dueDate).getTime() !== nextDueDate.getTime()) {
      payment.dueDate = nextDueDate;
      updatedCount++;
    }
    return true;
  });

  const removedCount = originalCount - rentDoc.monthlyPayments.length;
  if (removedCount > 0 || updatedCount > 0) await rentDoc.save();
  return { removedCount, updatedCount };
}

// Generate (or rather, resolve) the owner's PERMANENT Onboarding Link.
// One owner → one fixed, short, clean link that never changes and never expires.
// A short code (8 chars) is generated ONCE and stored on the User document, so
// the same owner always gets the same short link — and it survives restarts.
router.get("/generate-link", auth, async (req, res) => {
  try {
    const owner = await User.findById(req.user.id).select("onboardingCode");
    if (!owner) return res.status(404).json({ message: "Owner not found." });

    // Reuse existing code, or create a unique one on first request.
    if (!owner.onboardingCode) {
      let code, exists = true, tries = 0;
      do {
        code = crypto.randomBytes(6).toString("base64url").slice(0, 8);
        exists = await User.exists({ onboardingCode: code });
      } while (exists && ++tries < 5);
      owner.onboardingCode = code;
      await owner.save();
    }

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const link = `${frontendUrl}/tenant-register/${owner.onboardingCode}`;
    res.json({ link, expiresIn: "never" });
  } catch (err) {
    res.status(500).json({ message: "Server error.", error: err.message });
  }
});

// Resolve a short onboarding code → ownerId.
//   1. Permanent per-owner code stored on the User document (new clean links)
//   2. Legacy in-memory short-token store (old 7-day links still in flight)
async function resolveOwnerFromShortToken(rawToken) {
  const owner = await User.findOne({ onboardingCode: rawToken }).select("_id").lean();
  if (owner) return String(owner._id);

  const entry = shortTokenStore.get(rawToken);
  if (entry && entry.expiresAt >= Date.now()) {
    const decoded = jwt.verify(entry.jwtToken, process.env.JWT_SECRET);
    return decoded.id;
  }
  return null;
}

// ── Onboarding-link share email template ──────────────────────────────────────
const onboardingLinkEmailHtml = (link) => `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Tahoma,sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="padding:40px 15px;">
    <tr><td align="center">
      <table width="520" cellspacing="0" cellpadding="0"
             style="background:#fff;border-radius:16px;overflow:hidden;
                    box-shadow:0 8px 24px rgba(0,0,0,0.09);">
        <tr>
          <td style="background:linear-gradient(135deg,#1e1b4b,#4338ca,#6366f1);
                     padding:36px 32px;text-align:center;">
            <div style="font-size:40px;margin-bottom:10px;">🏨</div>
            <h1 style="margin:0;font-size:22px;color:#fff;font-weight:800;">
              Complete Your Hostel Onboarding
            </h1>
            <p style="margin:8px 0 0;color:#c7d2fe;font-size:13px;">
              Nilayam Hostel — Tenant Onboarding
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px;">
            <p style="margin:0 0 22px;font-size:15px;color:#374151;line-height:1.7;">
              Please open the link below and complete your hostel onboarding form.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${link}"
                 style="display:inline-block;background:linear-gradient(135deg,#4338ca,#6366f1);
                        color:#fff;text-decoration:none;font-size:15px;font-weight:700;
                        padding:14px 34px;border-radius:12px;">
                Open Onboarding Form
              </a>
            </div>
            <p style="margin:18px 0 0;font-size:13px;color:#6b7280;line-height:1.7;">
              If the button does not open, copy and paste this link into Chrome:
            </p>
            <p style="margin:6px 0 0;font-size:13px;color:#4338ca;word-break:break-all;">
              ${link}
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;text-align:center;
                     font-size:12px;color:#9ca3af;">
            &copy; ${new Date().getFullYear()} Nilayam Hostel Management
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ── POST /api/tenants/share-link-email ────────────────────────────────────────
// Owner shares the permanent onboarding link to a candidate's email (automated).
router.post("/share-link-email", auth, async (req, res) => {
  try {
    const { email, link } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "A valid email address is required." });
    }
    if (!link || typeof link !== "string") {
      return res.status(400).json({ message: "Onboarding link is required." });
    }

    await sendBrevoEmail(
      email.trim(),
      "Future Tenant",
      "Complete Your Hostel Onboarding — Nilayam Hostel",
      onboardingLinkEmailHtml(link.trim())
    );

    return res.status(200).json({ message: "Onboarding link sent successfully." });
  } catch (err) {
    console.error("❌ Share onboarding link email error:", err.message);
    return res.status(500).json({ message: "Failed to send email. Please try again." });
  }
});

// Validate Link (Restored JWT Purpose Check)
router.get("/validate-link/:token", async (req, res) => {
  try {
    const raw = req.params.token;
    let ownerId;

    if (raw.length <= 12) {
      // Short code → look up the owner (permanent code or legacy short token).
      ownerId = await resolveOwnerFromShortToken(raw);
      if (!ownerId) {
        return res.status(401).json({ message: "Link is invalid or has expired." });
      }
    } else {
      // Full JWT → verify directly.
      const decoded = jwt.verify(raw, process.env.JWT_SECRET);
      if (decoded.purpose && decoded.purpose !== "tenant-registration") {
        return res.status(403).json({ message: "Invalid link purpose." });
      }
      ownerId = decoded.id;
    }
    const buildings = await Building.find({ owner: ownerId }).select("buildingName address floors").lean();

    const sanitised = buildings.map((b) => ({
      ...b,
      floors: b.floors.map((f) => ({
        ...f,
        rooms: f.rooms.map((r) => ({
          ...r,
          beds: r.beds.filter((bed) => bed.status === "Available"),
        })),
      })),
    }));

    res.json({ valid: true, buildings: sanitised });
  } catch (err) {
    res.status(401).json({ message: "Link is invalid or has expired." });
  }
});

// Self-registration (Restored Input Validation & Bed Occupancy Check)
router.post("/register-via-link", upload.fields([{ name: "aadharFront", maxCount: 1 }, { name: "aadharBack", maxCount: 1 }, { name: "passportPhoto", maxCount: 1 }]), async (req, res) => {
    try {
      const {
        linkToken, name, phone, email, fatherName, fatherPhone, permanentAddress,
        joiningDate, rentAmount, advanceAmount, buildingId, floorId, roomId, bedId,
        tenancyType = "monthly", shortStayFrom, shortStayTo, shortStayPerDayAmount,
      } = req.body;

      let ownerId;
      try {
        if (linkToken && linkToken.length <= 12) {
          ownerId = await resolveOwnerFromShortToken(linkToken);
        } else {
          ownerId = jwt.verify(linkToken, process.env.JWT_SECRET).id;
        }
      } catch { ownerId = null; }
      if (!ownerId) return res.status(401).json({ message: "Invalid link." });

      // ✅ RESTORED: Input Validation
      const isShortStay = tenancyType === "short_stay";
      const shortStay = isShortStay
        ? shortStayDetails({ shortStayFrom, shortStayTo, shortStayPerDayAmount })
        : null;
      if (!name || !phone || !permanentAddress || (!isShortStay && (!joiningDate || !rentAmount))) {
        return res.status(400).json({ message: "name, phone, permanentAddress, joiningDate, rentAmount are required." });
      }
      if (shortStay?.error) return res.status(400).json({ message: shortStay.error });
      if (!isShortStay && isFutureJoiningDate(joiningDate)) {
        return res.status(400).json({ message: "Joining date cannot be in the future." });
      }

      const resolvedJoiningDate = isShortStay ? shortStay.from : joiningDate;
      const resolvedRentAmount = isShortStay ? shortStay.totalAmount : Number(rentAmount);
      const bookingFields = isShortStay ? {
        tenancyType: "short_stay",
        shortStayFrom: shortStay.from,
        shortStayTo: shortStay.to,
        shortStayPerDayAmount: shortStay.perDayAmount,
        shortStayTotalAmount: shortStay.totalAmount,
        shortStayPaidAmount: 0,
      } : { tenancyType: "monthly" };

      const documents = await resolveDocUrls(req.files);
      const advance = advanceAmount && Number(advanceAmount) > 0 ? Number(advanceAmount) : 0;

      if (buildingId && floorId && roomId && bedId && buildingId !== "") {
        const building = await Building.findOne({ _id: buildingId, owner: ownerId });
        if (!building) return res.status(404).json({ message: "Building not found." });
        const floor = building.floors.id(floorId);
        if (!floor) return res.status(400).json({ message: "Selected floor was not found. Please select the room allocation again." });
        const room = floor.rooms.id(roomId);
        if (!room) return res.status(400).json({ message: "Selected room was not found. Please select the room allocation again." });
        const bed = room.beds.id(bedId);

        // ✅ RESTORED: Bed Occupancy Check
        if (!bed) return res.status(400).json({ message: "Selected bed was not found. Please select another bed." });
        if (bed.status === "Occupied") return res.status(400).json({ message: "Bed is already occupied." });

        const allocationInfo = {
          buildingName: building.buildingName, floorNumber: floor.floorNumber,
          roomNumber: room.roomNumber, bedNumber: bed.bedNumber,
        };

        const tenant = new Tenant({
          owner: ownerId, name: name.trim(), phone: phone.trim(), email, fatherName, fatherPhone,
          permanentAddress: permanentAddress.trim(), joiningDate: resolvedJoiningDate, rentAmount: resolvedRentAmount,
          advanceAmount: advance, paidadvanceAmount: 0, documents, buildingId, floorId, roomId, bedId, allocationInfo,
          source: "onboarding-link", isVerified: false, ...bookingFields,
        });
        await tenant.save();
        if (!isShortStay) await generateFirstRentDueWithCatchUpFallback(tenant);

        bed.status = "Occupied"; bed.tenantId = tenant._id;
        await building.save();

        const loc = `${building.buildingName} ➔ Floor ${floor.floorNumber} ➔ Room ${room.roomNumber} ➔ Bed ${bed.bedNumber}`;
        await logActivity(ownerId, "ONBOARD", "Tenant", `New registration: ${name} at ${loc}`);

        await notifyOwnerOnboarding(ownerId, tenant);
        return res.status(201).json({
          message: "Registered successfully!",
          tenant: withOptimizedTenantDocuments(tenant),
        });
      }

      const tenant = new Tenant({
        owner: ownerId, name: name.trim(), phone: phone.trim(), email, fatherName, fatherPhone,
        permanentAddress: permanentAddress.trim(), joiningDate: resolvedJoiningDate, rentAmount: resolvedRentAmount,
        advanceAmount: advance, paidadvanceAmount: 0, documents, source: "onboarding-link", isVerified: false,
        ...bookingFields,
      });
      await tenant.save();
      if (!isShortStay) await generateFirstRentDueWithCatchUpFallback(tenant);
      await logActivity(ownerId, "ONBOARD", "Tenant", `New registration: ${name} (Waiting for room)`);

      await notifyOwnerOnboarding(ownerId, tenant);
      res.status(201).json({
        message: "Registered successfully!",
        tenant: withOptimizedTenantDocuments(tenant),
      });
    } catch (err) { res.status(500).json({ message: "Server error.", error: err.message }); }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTES
// ══════════════════════════════════════════════════════════════════════════════

router.get("/notifications", auth, async (req, res) => {
  try {
    const tenants = await Tenant.find({ owner: req.user.id, source: "onboarding-link" })
      .select("name phone email joiningDate rentAmount allocationInfo isVerified createdAt documents")
      .sort({ createdAt: -1 }).limit(30).lean();
    res.json(tenants.map((tenant) => withOptimizedTenantDocuments(tenant, {
      passportWidth: CLOUDINARY_IMAGE_WIDTHS.avatar,
      passportHeight: CLOUDINARY_IMAGE_WIDTHS.avatar,
      passportCrop: "fill",
      documentWidth: CLOUDINARY_IMAGE_WIDTHS.documentThumb,
    })));
  } catch (err) { res.status(500).json({ message: "Server error." }); }
});

router.patch("/mark-verified", auth, async (req, res) => {
  try {
    await Tenant.updateMany({ owner: req.user.id, source: "onboarding-link", isVerified: false }, { $set: { isVerified: true } });
    res.json({ message: "Marked verified." });
  } catch (err) { res.status(500).json({ message: "Server error." }); }
});

const shortStayResponse = (tenant) => {
  const item = withOptimizedTenantDocuments(tenant, {
    passportWidth: CLOUDINARY_IMAGE_WIDTHS.card,
    passportHeight: CLOUDINARY_IMAGE_WIDTHS.card,
    passportCrop: "fill",
    documentWidth: CLOUDINARY_IMAGE_WIDTHS.documentThumb,
  });
  const totalAmount = Number(item.shortStayTotalAmount || item.rentAmount || 0);
  const paidAmount = Math.min(totalAmount, Math.max(0, Number(item.shortStayPaidAmount || 0)));
  const advanceAmount = Math.max(0, Number(item.advanceAmount || 0));
  const paidAdvanceAmount = Math.min(advanceAmount, Math.max(0, Number(item.paidadvanceAmount || 0)));
  const rentDueAmount = Math.max(0, totalAmount - paidAmount);
  const advancePending = Math.max(0, advanceAmount - paidAdvanceAmount);
  const totalOutstanding = rentDueAmount + advancePending;
  return {
    ...item,
    shortStayTotalAmount: totalAmount,
    shortStayPaidAmount: paidAmount,
    shortStayRentDueAmount: rentDueAmount,
    advancePending,
    totalOutstanding,
    shortStayDueAmount: totalOutstanding,
    shortStayPaymentStatus: totalOutstanding <= 0 ? "Paid" : (paidAmount > 0 || paidAdvanceAmount > 0) ? "Partial" : "Due",
  };
};

router.get("/short-stays", auth, async (req, res) => {
  try {
    const filter = { owner: req.user.id, tenancyType: "short_stay" };
    if (req.query.status) filter.status = req.query.status;
    const tenants = await Tenant.find(filter).sort({ shortStayFrom: -1, createdAt: -1 }).lean();
    res.json(tenants.map(shortStayResponse));
  } catch (err) {
    res.status(500).json({ message: "Unable to load short-stay bookings.", error: err.message });
  }
});

router.patch("/short-stays/:id", auth, async (req, res) => {
  try {
    const tenant = await Tenant.findOne({
      _id: req.params.id, owner: req.user.id, tenancyType: "short_stay",
    });
    if (!tenant) return res.status(404).json({ message: "Short-stay booking not found." });

    const allowed = ["name", "phone", "email", "fatherName", "fatherPhone", "permanentAddress", "advanceAmount"];
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) tenant[key] = req.body[key];
    }
    const shortStay = shortStayDetails({
      shortStayFrom: req.body.shortStayFrom || tenant.shortStayFrom,
      shortStayTo: req.body.shortStayTo || tenant.shortStayTo,
      shortStayPerDayAmount: req.body.shortStayPerDayAmount ?? tenant.shortStayPerDayAmount,
    });
    if (shortStay.error) return res.status(400).json({ message: shortStay.error });
    if (Object.prototype.hasOwnProperty.call(req.body, "shortStayTotalAmount")) {
      const requestedTotal = Number(req.body.shortStayTotalAmount);
      if (!Number.isFinite(requestedTotal) || requestedTotal <= 0) {
        return res.status(400).json({ message: "Enter a valid short-stay total amount." });
      }
      shortStay.totalAmount = requestedTotal;
      shortStay.perDayAmount = requestedTotal / shortStay.totalDays;
    }
    if (Number(tenant.shortStayPaidAmount || 0) > shortStay.totalAmount) {
      return res.status(400).json({ message: "Booking total cannot be less than the amount already paid." });
    }
    tenant.shortStayFrom = shortStay.from;
    tenant.shortStayTo = shortStay.to;
    tenant.shortStayPerDayAmount = shortStay.perDayAmount;
    tenant.shortStayTotalAmount = shortStay.totalAmount;
    tenant.joiningDate = shortStay.from;
    tenant.rentAmount = shortStay.totalAmount;
    await tenant.save();
    await logActivity(req.user.id, "UPDATE", "Tenant", `Updated short stay for ${tenant.name}`);
    res.json({ message: "Short-stay booking updated.", tenant: shortStayResponse(tenant.toObject()) });
  } catch (err) {
    res.status(500).json({ message: "Unable to update short-stay booking.", error: err.message });
  }
});

router.post("/short-stays/:id/extend", auth, async (req, res) => {
  try {
    const tenant = await Tenant.findOne({
      _id: req.params.id, owner: req.user.id, tenancyType: "short_stay", status: "Active",
    });
    if (!tenant) return res.status(404).json({ message: "Active short-stay booking not found." });
    const shortStay = shortStayDetails({
      shortStayFrom: tenant.shortStayFrom,
      shortStayTo: req.body.shortStayTo,
      shortStayPerDayAmount: req.body.shortStayPerDayAmount ?? tenant.shortStayPerDayAmount,
    });
    if (shortStay.error) return res.status(400).json({ message: shortStay.error });
    if (shortStay.to <= tenant.shortStayTo) {
      return res.status(400).json({ message: "Extended stay date must be after the current to date." });
    }
    tenant.shortStayTo = shortStay.to;
    tenant.shortStayPerDayAmount = shortStay.perDayAmount;
    tenant.shortStayTotalAmount = shortStay.totalAmount;
    tenant.rentAmount = shortStay.totalAmount;
    await tenant.save();
    await logActivity(req.user.id, "UPDATE", "Tenant", `Extended short stay for ${tenant.name}`);
    res.json({ message: "Stay extended successfully.", tenant: shortStayResponse(tenant.toObject()) });
  } catch (err) {
    res.status(500).json({ message: "Unable to extend stay.", error: err.message });
  }
});

router.post("/short-stays/:id/pay", auth, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: "Enter a valid payment amount." });
    const tenant = await Tenant.findOne({
      _id: req.params.id, owner: req.user.id, tenancyType: "short_stay",
    });
    if (!tenant) return res.status(404).json({ message: "Short-stay booking not found." });
    const paymentType = req.body.paymentType === "advance" ? "advance" : "booking";
    const due = paymentType === "advance"
      ? Math.max(0, Number(tenant.advanceAmount || 0) - Number(tenant.paidadvanceAmount || 0))
      : Math.max(0, Number(tenant.shortStayTotalAmount || 0) - Number(tenant.shortStayPaidAmount || 0));
    if (due <= 0) return res.status(400).json({ message: paymentType === "advance" ? "Advance is already fully paid." : "Booking rent is already fully paid." });
    if (amount > due) return res.status(400).json({ message: `Payment cannot exceed the due amount of ₹${due}.` });
    if (paymentType === "advance") tenant.paidadvanceAmount = Number(tenant.paidadvanceAmount || 0) + amount;
    else tenant.shortStayPaidAmount = Number(tenant.shortStayPaidAmount || 0) + amount;
    tenant.shortStayPayments.push({ amount, paymentType, note: String(req.body.note || ""), paidAt: new Date() });
    await tenant.save();
    await logActivity(req.user.id, "PAYMENT", "Rent", `Received short-stay payment of ₹${amount} from ${tenant.name}`);
    let emailSent = false;
    let emailWarning = "";
    if (tenant.email) {
      try {
        const email = shortStayPaymentEmail({ tenant, paymentAmount: amount, paymentType, note: req.body.note });
        await sendBrevoEmail(tenant.email, tenant.name, email.subject, email.html);
        emailSent = true;
      } catch (emailError) {
        emailWarning = "Payment was recorded, but the receipt email could not be sent.";
        console.error("Short-stay payment email failed:", emailError.message);
      }
    } else {
      emailWarning = "Payment was recorded, but this guest has no email address.";
    }
    res.json({
      message: emailSent ? `Payment recorded and receipt sent to ${tenant.email}.` : "Payment recorded.",
      emailSent,
      emailWarning,
      tenant: shortStayResponse(tenant.toObject()),
    });
  } catch (err) {
    res.status(500).json({ message: "Unable to record payment.", error: err.message });
  }
});

router.post("/short-stays/:id/remind", auth, async (req, res) => {
  try {
    const tenant = await Tenant.findOne({
      _id: req.params.id, owner: req.user.id, tenancyType: "short_stay",
    });
    if (!tenant) return res.status(404).json({ message: "Short-stay booking not found." });
    if (!tenant.email) return res.status(422).json({ message: "This guest has no email address." });
    const due = Math.max(0, Number(tenant.shortStayTotalAmount || 0) - Number(tenant.shortStayPaidAmount || 0))
      + Math.max(0, Number(tenant.advanceAmount || 0) - Number(tenant.paidadvanceAmount || 0));
    if (due <= 0) return res.status(400).json({ message: "This short-stay booking is already fully paid." });
    const email = shortStayReminderEmail(tenant);
    await sendBrevoEmail(tenant.email, tenant.name, email.subject, email.html);
    await logActivity(req.user.id, "REMINDER", "Rent", `Sent short-stay payment reminder to ${tenant.name}`);
    res.json({ message: `Payment reminder sent to ${tenant.email}.` });
  } catch (err) {
    res.status(500).json({ message: "Unable to send reminder email.", error: err.message });
  }
});

router.post("/short-stays/:id/convert", auth, async (req, res) => {
  try {
    const { joiningDate, rentAmount } = req.body;
    if (!parseJoiningDate(joiningDate) || isFutureJoiningDate(joiningDate)) {
      return res.status(400).json({ message: "Enter a valid joining date that is not in the future." });
    }
    if (!Number.isFinite(Number(rentAmount)) || Number(rentAmount) <= 0) {
      return res.status(400).json({ message: "Enter a valid monthly rent amount." });
    }
    const tenant = await Tenant.findOne({
      _id: req.params.id, owner: req.user.id, tenancyType: "short_stay", status: "Active",
    });
    if (!tenant) return res.status(404).json({ message: "Active short-stay booking not found." });
    tenant.tenancyType = "monthly";
    tenant.joiningDate = parseJoiningDate(joiningDate);
    tenant.rentAmount = Number(rentAmount);
    tenant.shortStayConvertedAt = new Date();
    await tenant.save();
    await generateFirstRentDueWithCatchUpFallback(tenant);
    await logActivity(req.user.id, "UPDATE", "Tenant", `Converted ${tenant.name} from short stay to monthly tenant`);
    res.json({ message: "Short-stay guest converted to a monthly tenant.", tenant: withOptimizedTenantDocuments(tenant) });
  } catch (err) {
    res.status(500).json({ message: "Unable to convert tenant.", error: err.message });
  }
});

// Admin Add Tenant (Restored Validation & Bed Check)
router.post("/", auth, upload.fields([{ name: "aadharFront" }, { name: "aadharBack" }, { name: "passportPhoto" }]), async (req, res) => {
    try {
      const { name, phone, email, fatherName, fatherPhone, permanentAddress, joiningDate, rentAmount, advanceAmount, buildingId, floorId, roomId, bedId } = req.body;
      
      // ✅ RESTORED: Input Validation
      if (!name || !phone || !permanentAddress || !joiningDate || !rentAmount) {
        return res.status(400).json({ message: "Name, phone, permanentAddress, joiningDate, rentAmount are required." });
      }
      if (isFutureJoiningDate(joiningDate)) {
        return res.status(400).json({ message: "Joining date cannot be in the future." });
      }

      const documents = await resolveDocUrls(req.files);
      const advance = advanceAmount ? Number(advanceAmount) : 0;

      if (buildingId && floorId && roomId && bedId && buildingId !== "") {
        const building = await Building.findOne({ _id: buildingId, owner: req.user.id });
        if (!building) return res.status(404).json({ message: "Building not found." });
        const floor = building.floors.id(floorId);
      const room = floor?.rooms.id(roomId);
        const bed = room?.beds.id(bedId);

        // ✅ RESTORED: Bed Occupancy Check
        if (!bed || bed.status === "Occupied") return res.status(400).json({ message: "Bed is already occupied." });

        const allocationInfo = {
          buildingName: building.buildingName, floorNumber: floor.floorNumber,
          roomNumber: room.roomNumber, bedNumber: bed.bedNumber,
        };

        const tenant = new Tenant({
          owner: req.user.id, name: name.trim(), phone: phone.trim(), email, fatherName, fatherPhone, permanentAddress, joiningDate, rentAmount: Number(rentAmount), advanceAmount: advance, paidadvanceAmount: 0, documents, buildingId, floorId, roomId, bedId, allocationInfo
        });
        await tenant.save();
        await generateFirstRentDueWithCatchUpFallback(tenant);

        bed.status = "Occupied"; bed.tenantId = tenant._id;
        await building.save();

        const loc = `${building.buildingName} ➔ Floor ${floor.floorNumber} ➔ Room ${room.roomNumber} ➔ Bed ${bed.bedNumber}`;
        await logActivity(req.user.id, "CREATE", "Tenant", `Added Tenant: ${name} at ${loc}`);
        return res.status(201).json({
          message: "Tenant added.",
          tenant: withOptimizedTenantDocuments(tenant),
        });
      }

      const tenant = new Tenant({ owner: req.user.id, name, phone, email, fatherName, fatherPhone, permanentAddress, joiningDate, rentAmount: Number(rentAmount), advanceAmount: advance, paidadvanceAmount: 0, documents });
      await tenant.save();
      await generateFirstRentDueWithCatchUpFallback(tenant);
      await logActivity(req.user.id, "CREATE", "Tenant", `Added Tenant: ${name} (No Room Assigned)`);
      res.status(201).json({
        message: "Tenant added successfully.",
        tenant: withOptimizedTenantDocuments(tenant),
      });
    } catch (err) { res.status(500).json({ message: "Server error.", error: err.message }); }
  }
);

router.get("/", auth, async (req, res) => {
  try {
    const filter = { owner: req.user.id };
    if (req.query.source) filter.source = req.query.source;
    if (req.query.tenancyType) filter.tenancyType = req.query.tenancyType;
    else filter.tenancyType = { $ne: "short_stay" };
    const tenants = await Tenant.find(filter).sort({ createdAt: -1 }).lean();
    res.json(tenants.map((tenant) => withOptimizedTenantDocuments(tenant, {
      passportWidth: CLOUDINARY_IMAGE_WIDTHS.card,
      passportHeight: CLOUDINARY_IMAGE_WIDTHS.card,
      passportCrop: "fill",
      documentWidth: CLOUDINARY_IMAGE_WIDTHS.documentThumb,
    })));
  } catch (err) { res.status(500).json({ message: "Server error." }); }
});

router.get("/:id", auth, async (req, res) => {
  try {
    const tenant = await Tenant.findOne({ _id: req.params.id, owner: req.user.id }).lean();
    res.json(withOptimizedTenantDocuments(tenant));
  } catch (err) { res.status(500).json({ message: "Server error." }); }
});

router.put("/:id", auth, upload.fields([{ name: "aadharFront" }, { name: "aadharBack" }, { name: "passportPhoto" }]), async (req, res) => {
  try {
    const existingTenant = await Tenant.findOne({ _id: req.params.id, owner: req.user.id });
    if (!existingTenant) return res.status(404).json({ message: "Tenant not found." });

    const updateData = { ...req.body };
    const previousAdvanceAmount = Number(existingTenant.advanceAmount || 0);
    let advanceAmountWasChanged = false;
    if (Object.prototype.hasOwnProperty.call(updateData, "rentAmount")) {
      updateData.rentAmount = Number(updateData.rentAmount || 0);
    }
    if (Object.prototype.hasOwnProperty.call(updateData, "joiningDate")) {
      if (!parseJoiningDate(updateData.joiningDate)) {
        return res.status(400).json({ message: "Enter a valid joining date." });
      }
      if (isFutureJoiningDate(updateData.joiningDate)) {
        return res.status(400).json({ message: "Joining date cannot be in the future." });
      }
    }
    if (Object.prototype.hasOwnProperty.call(updateData, "advanceAmount")) {
      updateData.advanceAmount = Number(updateData.advanceAmount || 0);
      advanceAmountWasChanged = updateData.advanceAmount !== previousAdvanceAmount;
    }
    delete updateData.paidadvanceAmount;
    if (req.files && Object.keys(req.files).length > 0) {
      const newDocs = await resolveDocUrls(req.files);
      if (newDocs.aadharFront)   updateData["documents.aadharFront"]   = newDocs.aadharFront;
      if (newDocs.aadharBack)    updateData["documents.aadharBack"]    = newDocs.aadharBack;
      if (newDocs.passportPhoto) updateData["documents.passportPhoto"] = newDocs.passportPhoto;
    }

    const updatedTenant = await Tenant.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      updateData, { new: true, runValidators: true }
    );

    let rentPaymentCleanup = { removedCount: 0, updatedCount: 0 };
    if (Object.prototype.hasOwnProperty.call(updateData, "joiningDate")) {
      rentPaymentCleanup = await cleanupRentPaymentsBeforeJoiningDate({
        tenantId: updatedTenant._id,
        ownerId: req.user.id,
        joiningDate: updatedTenant.joiningDate,
        previousJoiningDate: existingTenant.joiningDate,
      });
    }

    const info = existingTenant.allocationInfo;
    const loc = info?.buildingName ? `(${info.buildingName} ➔ Room ${info.roomNumber})` : "(Unallocated)";
    await logActivity(req.user.id, "UPDATE", "Tenant", `Updated details for ${updatedTenant.name} ${loc}`);

    if (advanceAmountWasChanged && updatedTenant.email) {
      try {
        const advanceFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
        await sendBrevoEmail(
          updatedTenant.email,
          updatedTenant.name,
          `Advance Amount Updated - ${advanceFmt.format(updatedTenant.advanceAmount || 0)}`,
          advanceAmountUpdatedEmailHtml({
            tenant: updatedTenant,
            previousAdvance: previousAdvanceAmount,
            newAdvance: Number(updatedTenant.advanceAmount || 0),
            paidAdvance: Number(updatedTenant.paidadvanceAmount || 0),
          })
        );
      } catch (e) {
        console.error("Advance update email failed:", e.message);
      }
    }

    res.json({
      message: "Tenant updated.",
      tenant: withOptimizedTenantDocuments(updatedTenant),
      rentPaymentCleanup,
    });
  } catch (err) { res.status(500).json({ message: "Server error.", error: err.message }); }
});

router.delete("/:id/vacate", auth, async (req, res) => {
  try {
    const tenant = await Tenant.findOne({ _id: req.params.id, owner: req.user.id });
    if (!tenant) return res.status(404).json({ message: "Tenant not found." });

    const info = tenant.allocationInfo;
    const locationString = info?.buildingName ? `${info.buildingName} ➔ Floor ${info.floorNumber} ➔ Room ${info.roomNumber} ➔ Bed ${info.bedNumber}` : "Unallocated Room";

    if (tenant.buildingId && tenant.floorId && tenant.roomId && tenant.bedId) {
      const building = await Building.findById(tenant.buildingId);
      if (building) {
        const floor = building.floors.id(tenant.floorId);
        const room  = floor?.rooms.id(tenant.roomId);
        const bed   = room?.beds.id(tenant.bedId);
        if (bed) { bed.status = "Available"; bed.tenantId = null; await building.save(); }
      }
    }

    tenant.status = "Inactive"; tenant.buildingId = null; tenant.floorId = null; tenant.roomId = null; tenant.bedId = null; tenant.allocationInfo = {};
    await tenant.save();

    await logActivity(req.user.id, "VACATE", "Tenant", `Vacated Tenant: ${tenant.name} from ${locationString}`);
    res.json({ message: "Tenant vacated." });
  } catch (err) { res.status(500).json({ message: "Server error." }); }
});

router.put("/:id/reallocate", auth, async (req, res) => {
  try {
    const { buildingId, floorId, roomId, bedId } = req.body;
    
    // ✅ RESTORED: Required ID Validation
    if (!buildingId || !floorId || !roomId || !bedId) {
      return res.status(400).json({ message: "buildingId, floorId, roomId, bedId are required." });
    }

    const tenant = await Tenant.findOne({ _id: req.params.id, owner: req.user.id });
    if (!tenant) return res.status(404).json({ message: "Tenant not found." });

    const oldInfo = tenant.allocationInfo;
    const oldLoc = oldInfo?.buildingName ? `${oldInfo.buildingName} (Rm ${oldInfo.roomNumber})` : "Unallocated";

    if (tenant.bedId) {
      const oldB = await Building.findById(tenant.buildingId);
      const oldBed = oldB?.floors.id(tenant.floorId)?.rooms.id(tenant.roomId)?.beds.id(tenant.bedId);
      if (oldBed) { oldBed.status = "Available"; oldBed.tenantId = null; await oldB.save(); }
    }

    const newB = await Building.findOne({ _id: buildingId, owner: req.user.id });
    if (!newB) return res.status(404).json({ message: "New building not found." });
    const f = newB.floors.id(floorId);
 const r = f?.rooms.id(roomId); 
    const b = r?.beds.id(bedId);

    // ✅ RESTORED: Bed Occupancy Check for Reallocation
    if (!b || b.status === "Occupied") return res.status(400).json({ message: "Selected bed is already occupied." });

    b.status = "Occupied"; b.tenantId = tenant._id;
    await newB.save();

    tenant.buildingId = buildingId; tenant.floorId = floorId; tenant.roomId = roomId; tenant.bedId = bedId;
    tenant.allocationInfo = { buildingName: newB.buildingName, floorNumber: f.floorNumber, roomNumber: r.roomNumber, bedNumber: b.bedNumber };
    await tenant.save();

    const newLoc = `${newB.buildingName} ➔ Floor ${f.floorNumber} ➔ Room ${r.roomNumber} ➔ Bed ${b.bedNumber}`;
    await logActivity(req.user.id, "REALLOCATE", "Tenant", `Moved ${tenant.name} from ${oldLoc} to ${newLoc}`);

    res.json({
      message: "Tenant reallocated.",
      tenant: withOptimizedTenantDocuments(tenant),
    });
  } catch (err) { res.status(500).json({ message: "Server error.", error: err.message }); }
});

export default router;
