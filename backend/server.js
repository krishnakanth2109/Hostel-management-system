import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";

import User from "./models/User.js";
import Plan from "./models/Plan.js";
import buildingRoutes from "./routes/buildingRoutes.js";
import tenantRoutes from "./routes/tenantRoutes.js";
import masterRoutes from "./routes/masterRoutes.js";
import rentRoutes from "./routes/rentroutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import planRoutes from "./routes/planroutes.js";
import approvalRoutes from "./routes/approvalroutes.js";
import pushTokenRoutes from "./routes/pushTokenRoutes.js";
import publicTenantRoutes from "./routes/publicTenantRoutes.js";
import paymentRequestRoutes from "./routes/paymentRequestRoutes.js";
import whatsappRoutes from "./routes/whatsappRoutes.js";
import masterWhatsAppReminderRoutes from "./routes/masterWhatsAppReminderRoutes.js";
import path from "path";
import { fileURLToPath } from "url";
import autoMailRouter, { initAllCronJobs } from "./routes/Automailroutes.js";
import { initFirebase } from "./config/firebase.js";
import { backfillTenantSecureIds } from "./utils/tenantSecureId.js";
import { initializeWhatsAppReminderAutomation } from "./utils/whatsappReminderAutomation.js";
import { initializeRentDueScheduler } from "./services/rentDueGeneration.js";
import { sendOwnerLoginOtp } from "./utils/whatsappService.js";
import {
  indianMobileLookupRegex,
  normalizeIndianMobile,
  OwnerLoginOtpManager,
  SlidingWindowRateLimiter,
} from "./utils/ownerLoginOtp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const ownerLoginOtpManager = new OwnerLoginOtpManager({ pepper: process.env.JWT_SECRET });
const ownerOtpSendIpLimiter = new SlidingWindowRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
const ownerOtpVerifyIpLimiter = new SlidingWindowRateLimiter({ limit: 30, windowMs: 15 * 60 * 1000 });
const registrationOtpManager = new OwnerLoginOtpManager({ pepper: process.env.JWT_SECRET });
const registrationVerificationStore = new Map();

const app = express();
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  "https://hostel-management-system-sk.netlify.app",
  "https://nilayamhostelmanagement.in.net",
  "https://hrms-420.netlify.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "https://nilayam.netlify.app",
  "https://hrms-vaz.netlify.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/$/, "");
      if (allowedOrigins.includes(cleanOrigin)) {
        callback(null, true);
      } else {
        console.log("❌ Blocked by CORS:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// Temporary WhatsApp integration routes. Keep before all application routes/fallbacks.
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/master/whatsapp-reminders", masterWhatsAppReminderRoutes);

// ── Health Check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.status(200).json({ message: "Backend API is successfully running!" });
});

// ── Database ──────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URL)
  .then(() => {
    console.log("✅ MongoDB connected");
  })
  .catch((err) => {
    console.error("❌ MongoDB error:", err);
  });

// 👇 Run cron ONLY after DB is ready
mongoose.connection.once("open", () => {
  backfillTenantSecureIds().catch((err) => {
    console.error("[TenantSecureId] Backfill failed:", err.message);
  });
  initAllCronJobs();
  initializeRentDueScheduler();
  initializeWhatsAppReminderAutomation().catch((err) => {
    console.error("[WhatsAppReminder] Automation initialization failed:", err.message);
  });
});

// ── Helper: compute expiry date ───────────────────────────────────────────────
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function applyPlanExpiryIfNeeded(user) {
  if (!user || user.role === "master" || !user.planExpiresAt) return false;

  const expired = new Date() >= new Date(user.planExpiresAt);
  if (!expired) return false;

  let changed = false;
  if (user.planStatus !== "expired") {
    user.planStatus = "expired";
    changed = true;
  }
  if (user.loginStatus !== "blocked") {
    user.loginStatus = "blocked";
    changed = true;
  }
  if (changed) await user.save();
  return true;
}

function expiredPlanPayload(user) {
  return {
    message: "Your plan has expired. Please renew to continue.",
    planExpired: true,
    planInfo: {
      planName:        user.planName,
      planActivatedAt: user.planActivatedAt,
      planExpiresAt:   user.planExpiresAt,
      planRenewalAt:   user.planRenewalAt,
      usedFreePlan:    user.usedFreePlan,
      planBeds:        user.planBeds,
      plan:            user.plan,
    },
    extensionPending: user.extensionRequest?.requested || false,
    userId: user._id,
    userInfo: {
      name:    user.name,
      owner:   user.owner,
      email:   user.email,
      ph:      user.ph,
      address: user.address,
    },
  };
}

function blockedLoginPayload(user) {
  return {
    message: "Your login has been stopped by Nilayam management. Please contact support for more information.",
    blocked: true,
    userInfo: {
      name:    user.name,
      owner:   user.owner,
      email:   user.email,
      ph:      user.ph,
      address: user.address,
    },
  };
}

function loginUserPayload(user) {
  return {
    id:              user._id,
    name:            user.name,
    owner:           user.owner,
    ph:              user.ph,
    email:           user.email,
    address:         user.address,
    role:            user.role,
    loginStatus:     user.loginStatus,
    planStatus:      user.planStatus,
    planActivatedAt: user.planActivatedAt,
    planExpiresAt:   user.planExpiresAt,
    planRenewalAt:   user.planRenewalAt,
    usedFreePlan:    user.usedFreePlan,
    planBeds:        user.planBeds,
  };
}

async function sendOwnerLoginRestriction(res, user) {
  if (user.loginStatus === "pending") {
    res.status(403).json({
      message: "Your account is awaiting approval. We will respond shortly.",
      pending: true,
      extensionPending: user.extensionRequest?.requested || false,
    });
    return true;
  }
  if (user.loginStatus === "blocked" && user.planStatus === "expired") {
    res.status(403).json(expiredPlanPayload(user));
    return true;
  }
  if (user.loginStatus === "blocked") {
    res.status(403).json(blockedLoginPayload(user));
    return true;
  }
  if (user.planExpiresAt && new Date() >= new Date(user.planExpiresAt)) {
    await applyPlanExpiryIfNeeded(user);
    res.status(403).json(expiredPlanPayload(user));
    return true;
  }
  if (user.planStatus === "expired") {
    await applyPlanExpiryIfNeeded(user);
    res.status(403).json(expiredPlanPayload(user));
    return true;
  }
  return false;
}

async function findOwnerByMobile(normalizedMobile) {
  const owners = await User.find({
    role: "user",
    ph: indianMobileLookupRegex(normalizedMobile),
  })
    .limit(2)
    .populate("plan", "name price days beds isFree");

  if (owners.length > 1) {
    const error = new Error("Multiple owner accounts use this mobile number. Please contact support.");
    error.code = "DUPLICATE_OWNER_MOBILE";
    throw error;
  }
  return owners[0] || null;
}

function registrationVerificationDigest(token) {
  return crypto.createHmac("sha256", process.env.JWT_SECRET).update(token).digest();
}

function issueRegistrationVerification(mobile) {
  const token = crypto.randomBytes(32).toString("hex");
  registrationVerificationStore.set(mobile, {
    tokenHash: registrationVerificationDigest(token),
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  return token;
}

function consumeRegistrationVerification(mobile, token) {
  const entry = registrationVerificationStore.get(mobile);
  if (!entry || entry.expiresAt <= Date.now() || !token) {
    registrationVerificationStore.delete(mobile);
    return false;
  }
  const suppliedHash = registrationVerificationDigest(String(token));
  if (!crypto.timingSafeEqual(entry.tokenHash, suppliedHash)) return false;
  registrationVerificationStore.delete(mobile);
  return true;
}

const passwordResetStore = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of passwordResetStore.entries()) {
    if (data.expiresAt < now) passwordResetStore.delete(email);
  }
}, 5 * 60 * 1000);

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

async function sendBrevoEmail(toEmail, toName, subject, htmlContent) {
  const apiKey      = (process.env.BREVO_API_KEY      || "").trim();
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || "").trim();
  const senderName  = (process.env.BREVO_SENDER_NAME  || "Nilayam Hostel").trim();
  if (!apiKey || !senderEmail) throw new Error("Brevo credentials missing in .env");

  const { data } = await axios.post(BREVO_API_URL, {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: toEmail, name: toName || "Nilayam User" }],
    subject,
    htmlContent,
  }, {
    headers: { "Content-Type": "application/json", "api-key": apiKey },
  });
  return data;
}

const passwordResetOtpEmailHtml = ({ otpCode, name }) => `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Tahoma,sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="padding:40px 15px;">
    <tr><td align="center">
      <table width="520" cellspacing="0" cellpadding="0" style="background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.12);">
        <tr>
          <td style="background:linear-gradient(135deg,#1e1b4b,#4338ca,#6366f1);padding:34px 30px;text-align:center;">
            <div style="font-size:40px;margin-bottom:10px;">🔐</div>
            <h1 style="margin:0;font-size:22px;color:#fff;font-weight:800;">Reset Your Password</h1>
            <p style="margin:8px 0 0;color:#c7d2fe;font-size:13px;">Nilayam Hostel Management</p>
          </td>
        </tr>
        <tr>
          <td style="padding:34px 32px;">
            <p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.7;">
              Hello <strong>${name || "there"}</strong>, use this one-time code to verify your password reset request.
              The code expires in <strong>10 minutes</strong>.
            </p>
            <div style="text-align:center;margin:26px 0;">
              <span style="display:inline-block;letter-spacing:10px;font-size:40px;font-weight:800;color:#4338ca;background:#eef2ff;padding:15px 30px;border-radius:14px;border:2px solid #c7d2fe;">
                ${otpCode}
              </span>
            </div>
            <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;line-height:1.6;">
              Do not share this code with anyone.<br/>
              If you did not request this, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;text-align:center;font-size:12px;color:#9ca3af;">
            &copy; ${new Date().getFullYear()} Nilayam Hostel Management
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ── Auth middleware (any logged-in user) ──────────────────────────────────────
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: "No token." });
  try {
    const decoded = jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token." });
  }
}

// ── GET own profile ───────────────────────────────────────────────────────────
app.get("/api/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password")
      .populate("plan", "name price days beds isFree");
    if (!user) return res.status(404).json({ message: "User not found." });

    const expired = await applyPlanExpiryIfNeeded(user);
    if (expired) {
      return res.status(403).json(expiredPlanPayload(user));
    }

    if (user.role !== "master" && user.loginStatus === "blocked") {
      return res.status(403).json(blockedLoginPayload(user));
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error.", error: err.message });
  }
});

// ── PATCH own profile (name, owner, email, ph, address, password) ─────────────
app.post("/api/forgot-password/send-otp", async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    if (!email) return res.status(400).json({ message: "Email is required." });

    const user = await User.findOne({ email }).select("name owner email").lean();
    if (!user) return res.status(404).json({ message: "No account found with this email." });

    const otp = String(Math.floor(10000 + Math.random() * 90000));
    passwordResetStore.set(email, {
      otp,
      verified: false,
      resetToken: null,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    await sendBrevoEmail(
      email,
      user.owner || user.name || "Nilayam User",
      "Password Reset OTP - Nilayam Hostel",
      passwordResetOtpEmailHtml({ otpCode: otp, name: user.owner || user.name })
    );

    res.json({ success: true, message: "OTP sent to your email." });
  } catch (err) {
    console.error("Password reset OTP error:", err.message);
    res.status(500).json({ message: "Failed to send OTP. Please try again." });
  }
});

app.post("/api/forgot-password/verify-otp", async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const otp = String(req.body.otp || "").trim();
    const entry = passwordResetStore.get(email);

    if (!email || !otp) return res.status(400).json({ message: "Email and OTP are required." });
    if (!entry) return res.status(400).json({ message: "OTP expired or not found. Please request a new one." });
    if (entry.expiresAt < Date.now()) {
      passwordResetStore.delete(email);
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }
    if (entry.otp !== otp) return res.status(400).json({ message: "Incorrect OTP. Please try again." });

    const resetToken = crypto.randomBytes(24).toString("hex");
    passwordResetStore.set(email, {
      ...entry,
      verified: true,
      resetToken,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    res.json({ success: true, resetToken, message: "OTP verified." });
  } catch (err) {
    res.status(500).json({ message: "Server error.", error: err.message });
  }
});

app.post("/api/forgot-password/update", async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const resetToken = String(req.body.resetToken || "").trim();
    const password = String(req.body.password || "").trim();
    const entry = passwordResetStore.get(email);

    if (!email || !resetToken || !password)
      return res.status(400).json({ message: "Email, verification token and password are required." });
    if (password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    if (!entry || !entry.verified || entry.resetToken !== resetToken || entry.expiresAt < Date.now()) {
      passwordResetStore.delete(email);
      return res.status(400).json({ message: "Verification expired. Please request a new OTP." });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "No account found with this email." });

    user.password = await bcrypt.hash(password, 10);
    await user.save();
    passwordResetStore.delete(email);

    res.json({ success: true, message: "Password updated successfully." });
  } catch (err) {
    res.status(500).json({ message: "Server error.", error: err.message });
  }
});

app.patch("/api/profile", authMiddleware, async (req, res) => {
  try {
    const { name, owner, email, ph, address, password } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found." });

    // Check email uniqueness if changing
    if (email && email.toLowerCase().trim() !== user.email) {
      const exists = await User.findOne({ email: email.toLowerCase().trim() }).select("_id").lean();
      if (exists) return res.status(400).json({ message: "Email already in use." });
      user.email = email.toLowerCase().trim();
    }

    if (name)    user.name    = name.trim();
    if (owner)   user.owner   = owner.trim();
    if (ph)      user.ph      = ph.trim();
    if (address) user.address = address.trim();

    // Password update — only if provided and non-empty
    if (password && password.trim().length > 0) {
      if (password.trim().length < 6)
        return res.status(400).json({ message: "Password must be at least 6 characters." });
      user.password = await bcrypt.hash(password.trim(), 10);
    }

    await user.save();

    const saved = await User.findById(user._id)
      .select("-password")
      .populate("plan", "name price days beds isFree")
      .lean();

    res.json({ message: "Profile updated successfully.", user: saved });
  } catch (err) {
    res.status(500).json({ message: "Server error.", error: err.message });
  }
});

// ── Register ──────────────────────────────────────────────────────────────────
app.post("/api/register/send-otp", async (req, res) => {
  let otpKey = null;
  let issuedNonce = null;
  try {
    const mobile = normalizeIndianMobile(req.body?.mobile);
    const email = String(req.body?.email || "").toLowerCase().trim();
    ownerOtpSendIpLimiter.consume(`register-ip:${req.ip}`);
    ownerOtpSendIpLimiter.consume(`register-mobile:${mobile}`);

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }
    const existingEmail = await User.findOne({ email }).select("_id").lean();
    if (existingEmail) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const existing = await User.findOne({
      role: "user",
      ph: indianMobileLookupRegex(mobile),
    }).select("_id").lean();
    if (existing) {
      return res.status(409).json({ message: "An account already exists with this mobile number." });
    }

    otpKey = `register:${mobile}`;
    const issued = registrationOtpManager.issue(otpKey, mobile);
    issuedNonce = issued.nonce;
    await sendOwnerLoginOtp({ phoneNumber: mobile, otp: issued.otp });

    res.json({
      success: true,
      message: "OTP sent to your WhatsApp number.",
      expiresInSeconds: issued.expiresInSeconds,
      resendAfterSeconds: issued.resendAfterSeconds,
    });
  } catch (err) {
    if (otpKey && issuedNonce) registrationOtpManager.cancel(otpKey, issuedNonce);
    if (err.code === "INVALID_MOBILE") return res.status(400).json({ message: err.message });
    if (err.code === "RESEND_COOLDOWN" || err.code === "RATE_LIMITED") {
      res.set("Retry-After", String(err.retryAfterSeconds || 60));
      return res.status(429).json({ message: err.message, retryAfterSeconds: err.retryAfterSeconds || 60 });
    }
    if (err.code === "WHATSAPP_CONFIG_ERROR" || err.code === "WHATSAPP_OTP_CONFIG_ERROR") {
      return res.status(503).json({ message: "WhatsApp OTP verification is not fully configured." });
    }
    if (err.code === "WHATSAPP_API_ERROR") {
      return res.status(502).json({ message: "Unable to send the WhatsApp OTP right now. Please try again." });
    }
    console.error("Registration OTP send error:", err.message);
    res.status(500).json({ message: "Unable to send OTP. Please try again." });
  }
});

app.post("/api/register/verify-otp", async (req, res) => {
  try {
    const mobile = normalizeIndianMobile(req.body?.mobile);
    const otp = String(req.body?.otp || "").trim();
    if (!/^\d{6}$/.test(otp)) return res.status(400).json({ message: "Enter the 6-digit OTP." });

    ownerOtpVerifyIpLimiter.consume(`register-ip:${req.ip}`);
    ownerOtpVerifyIpLimiter.consume(`register-mobile:${mobile}`);
    registrationOtpManager.verify(`register:${mobile}`, mobile, otp);

    res.json({
      success: true,
      verificationToken: issueRegistrationVerification(mobile),
      message: "Mobile number verified.",
    });
  } catch (err) {
    if (err.code === "INVALID_MOBILE") return res.status(400).json({ message: err.message });
    if (["OTP_EXPIRED", "INVALID_OTP", "OTP_ATTEMPTS_EXCEEDED"].includes(err.code)) {
      return res.status(400).json({ message: err.message, remainingAttempts: err.remainingAttempts });
    }
    if (err.code === "RATE_LIMITED") {
      res.set("Retry-After", String(err.retryAfterSeconds || 60));
      return res.status(429).json({ message: err.message, retryAfterSeconds: err.retryAfterSeconds || 60 });
    }
    console.error("Registration OTP verification error:", err.message);
    res.status(500).json({ message: "Unable to verify OTP. Please try again." });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const { name, owner, ph, email, password, address, planId, verificationToken } = req.body;

    if (!name || !owner || !ph || !email || !password || !address)
      return res.status(400).json({ message: "All fields are required." });

    const normalizedMobile = normalizeIndianMobile(ph);

    const existing = await User.findOne({ email: email.toLowerCase().trim() }).select("_id").lean();
    if (existing)
      return res.status(400).json({ message: "Email already registered." });

    const existingMobile = await User.findOne({
      role: "user",
      ph: indianMobileLookupRegex(normalizedMobile),
    }).select("_id").lean();
    if (existingMobile)
      return res.status(400).json({ message: "Mobile number already registered." });

    const hashed = await bcrypt.hash(password, 10);

    let loginStatus      = "active";
    let planRef          = null;
    let planName         = null;
    let planStatus       = "none";
    let planActivatedAt  = null;
    let planExpiresAt    = null;
    let usedFreePlan     = false;
    let planBeds         = null;

    if (planId) {
      const plan = await Plan.findById(planId).lean();
      if (!plan) return res.status(400).json({ message: "Selected plan not found." });

      planRef  = plan._id;
      planName = plan.name;

      if (plan.isFree) {
        usedFreePlan    = true;
        loginStatus     = "active";
        planStatus      = "active";
        planActivatedAt = new Date();
        planExpiresAt   = addDays(planActivatedAt, plan.days);
        planBeds        = plan.beds;
      } else {
        loginStatus = "pending";
        planStatus  = "none";
        planBeds    = null;
      }
    }

    if (!consumeRegistrationVerification(normalizedMobile, verificationToken)) {
      return res.status(403).json({ message: "Verify your mobile number with WhatsApp OTP before creating the account." });
    }

    const user = new User({
      name:            name.trim(),
      owner:           owner.trim(),
      ph:              normalizedMobile.slice(2),
      email:           email.toLowerCase().trim(),
      password:        hashed,
      address:         address.trim(),
      role:            "user",
      loginStatus,
      plan:            planRef,
      planName,
      planStatus,
      planActivatedAt,
      planExpiresAt,
      planRenewalAt:   null,
      usedFreePlan,
      planBeds,
    });

    await user.save();

    if (loginStatus === "pending") {
      return res.status(201).json({
        message: "Registered! Your account is pending approval.",
        pending: true,
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(201).json({
      message: "Registered successfully!",
      token,
      pending: false,
      user: {
        id:              user._id,
        name:            user.name,
        owner:           user.owner,
        ph:              user.ph,
        email:           user.email,
        address:         user.address,
        role:            user.role,
        loginStatus:     user.loginStatus,
        planStatus:      user.planStatus,
        planActivatedAt: user.planActivatedAt,
        planExpiresAt:   user.planExpiresAt,
        planRenewalAt:   user.planRenewalAt,
        usedFreePlan:    user.usedFreePlan,
        planBeds:        user.planBeds,
      },
    });
  } catch (err) {
    if (err.code === "INVALID_MOBILE") return res.status(400).json({ message: err.message });
    res.status(500).json({ message: "Server error.", error: err.message });
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
app.post("/api/owner-login/send-otp", async (req, res) => {
  let ownerId = null;
  let issuedNonce = null;
  try {
    const mobile = normalizeIndianMobile(req.body?.mobile);
    ownerOtpSendIpLimiter.consume(`ip:${req.ip}`);
    ownerOtpSendIpLimiter.consume(`mobile:${mobile}`);

    const owner = await findOwnerByMobile(mobile);
    if (!owner) {
      return res.status(404).json({
        message: "No owner account was found with this mobile number.",
        accountNotFound: true,
      });
    }
    if (await sendOwnerLoginRestriction(res, owner)) return;

    ownerId = String(owner._id);
    const issued = ownerLoginOtpManager.issue(ownerId, mobile);
    issuedNonce = issued.nonce;
    await sendOwnerLoginOtp({ phoneNumber: mobile, otp: issued.otp });

    res.json({
      success: true,
      message: "OTP sent to your registered WhatsApp number.",
      expiresInSeconds: issued.expiresInSeconds,
      resendAfterSeconds: issued.resendAfterSeconds,
    });
  } catch (err) {
    if (ownerId && issuedNonce) ownerLoginOtpManager.cancel(ownerId, issuedNonce);

    if (err.code === "INVALID_MOBILE") return res.status(400).json({ message: err.message });
    if (err.code === "DUPLICATE_OWNER_MOBILE") return res.status(409).json({ message: err.message });
    if (err.code === "RESEND_COOLDOWN" || err.code === "RATE_LIMITED") {
      res.set("Retry-After", String(err.retryAfterSeconds || 60));
      return res.status(429).json({ message: err.message, retryAfterSeconds: err.retryAfterSeconds || 60 });
    }
    if (err.code === "WHATSAPP_CONFIG_ERROR" || err.code === "WHATSAPP_OTP_CONFIG_ERROR") {
      console.error("Owner OTP configuration error:", err.message);
      return res.status(503).json({ message: "WhatsApp OTP login is not fully configured. Please contact support." });
    }
    if (err.code === "WHATSAPP_API_ERROR") {
      return res.status(502).json({ message: "Unable to send the WhatsApp OTP right now. Please try again." });
    }
    console.error("Owner OTP send error:", err.message);
    res.status(500).json({ message: "Unable to send OTP. Please try again." });
  }
});

app.post("/api/owner-login/verify-otp", async (req, res) => {
  try {
    const mobile = normalizeIndianMobile(req.body?.mobile);
    const otp = String(req.body?.otp || "").trim();
    if (!/^\d{6}$/.test(otp)) return res.status(400).json({ message: "Enter the 6-digit OTP." });

    ownerOtpVerifyIpLimiter.consume(`ip:${req.ip}`);
    ownerOtpVerifyIpLimiter.consume(`mobile:${mobile}`);
    const owner = await findOwnerByMobile(mobile);
    if (!owner) {
      return res.status(404).json({
        message: "No owner account was found with this mobile number.",
        accountNotFound: true,
      });
    }
    if (await sendOwnerLoginRestriction(res, owner)) return;

    ownerLoginOtpManager.verify(String(owner._id), mobile, otp);
    const token = jwt.sign(
      { id: owner._id, role: owner.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Logged in successfully!",
      token,
      user: loginUserPayload(owner),
    });
  } catch (err) {
    if (err.code === "INVALID_MOBILE") return res.status(400).json({ message: err.message });
    if (err.code === "DUPLICATE_OWNER_MOBILE") return res.status(409).json({ message: err.message });
    if (["OTP_EXPIRED", "INVALID_OTP", "OTP_ATTEMPTS_EXCEEDED"].includes(err.code)) {
      return res.status(400).json({
        message: err.message,
        remainingAttempts: err.remainingAttempts,
        expired: err.code === "OTP_EXPIRED",
      });
    }
    if (err.code === "RATE_LIMITED") {
      res.set("Retry-After", String(err.retryAfterSeconds || 60));
      return res.status(429).json({ message: err.message, retryAfterSeconds: err.retryAfterSeconds || 60 });
    }
    console.error("Owner OTP verification error:", err.message);
    res.status(500).json({ message: "Unable to verify OTP. Please try again." });
  }
});

// Existing email/password endpoint remains available for backward compatibility.
app.post("/api/login", async (req, res) => {
  try {
    const { email, password, masterOnly } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password required." });

    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .populate("plan", "name price days beds isFree");

    if (!user)
      return res.status(400).json({ message: "Invalid credentials." });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(400).json({ message: "Invalid credentials." });

    if (masterOnly === true && user.role !== "master")
      return res.status(403).json({ message: "Owner accounts must sign in with WhatsApp OTP." });

    // ── Pending approval ──────────────────────────────────────────────────────
    if (user.loginStatus === "pending") {
      return res.status(403).json({
        message: "Your account is awaiting approval. We will respond shortly.",
        pending: true,
        extensionPending: user.extensionRequest?.requested || false,
      });
    }

    // ── Blocked ───────────────────────────────────────────────────────────────
    if (user.role !== "master" && user.loginStatus === "blocked" && user.planStatus === "expired") {
      return res.status(403).json(expiredPlanPayload(user));
    }

    if (user.role !== "master" && user.loginStatus === "blocked") {
      return res.status(403).json(blockedLoginPayload(user));
    }

    // ── Plan expiry check (runs for ALL non-master users who have a plan) ─────
    if (user.role !== "master" && user.planExpiresAt) {
      const now = new Date();
      if (now >= new Date(user.planExpiresAt)) {
        await applyPlanExpiryIfNeeded(user);
        return res.status(403).json(expiredPlanPayload(user));
      }
    }

    // ── Also block if already marked expired ─────────────────────────────────
    if (user.role !== "master" && user.planStatus === "expired") {
      await applyPlanExpiryIfNeeded(user);
      return res.status(403).json(expiredPlanPayload(user));
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Logged in successfully!",
      token,
      user: {
        id:              user._id,
        name:            user.name,
        owner:           user.owner,
        ph:              user.ph,
        email:           user.email,
        address:         user.address,
        role:            user.role,
        loginStatus:     user.loginStatus,
        planStatus:      user.planStatus,
        planActivatedAt: user.planActivatedAt,
        planExpiresAt:   user.planExpiresAt,
        planRenewalAt:   user.planRenewalAt,
        usedFreePlan:    user.usedFreePlan,
        planBeds:        user.planBeds,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error.", error: err.message });
  }
});

// ── Request Plan Extension ────────────────────────────────────────────────────
app.post("/api/request-extension", async (req, res) => {
  try {
    const { userId, planId } = req.body;
    if (!userId || !planId)
      return res.status(400).json({ message: "userId and planId required." });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    const plan = await Plan.findById(planId).lean();
    if (!plan || !plan.isActive)
      return res.status(404).json({ message: "Plan not found or inactive." });

    if (plan.isFree)
      return res.status(400).json({ message: "Cannot request extension with a free plan." });

    user.extensionRequest = {
      requested:   true,
      planId:      plan._id,
      planName:    plan.name,
      planPrice:   plan.price,
      planDays:    plan.days,
      requestedAt: new Date(),
    };
    user.loginStatus = "pending";
    await user.save();

    res.json({ message: "Extension request submitted. Awaiting admin approval.", pending: true });
  } catch (err) {
    res.status(500).json({ message: "Server error.", error: err.message });
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/buildings",  buildingRoutes);
app.use("/api/tenants",    tenantRoutes);
app.use("/api/rent",       rentRoutes);
app.use("/api/master",     masterRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/plans",      planRoutes);
app.use("/api/approval",   approvalRoutes);
app.use("/api/auto-mail", autoMailRouter);
app.use("/api/push-tokens", pushTokenRoutes);
app.use("/api/public", publicTenantRoutes);
app.use("/api/payment-requests", paymentRequestRoutes);

// ── Push notifications ──────────────────────────────────────────────────────
// Initialise Firebase Admin at startup (no-op + warning if not configured).
initFirebase();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
  console.log(`✅ WhatsApp route registered: POST http://localhost:${PORT}/api/whatsapp/test-rent-reminder`);
  console.log(`✅ WhatsApp automation trigger: POST http://localhost:${PORT}/api/whatsapp/process-rent-reminders`);
});
