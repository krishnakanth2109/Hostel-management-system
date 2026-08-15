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
import path from "path";
import { fileURLToPath } from "url";
import autoMailRouter, { initAllCronJobs } from "./routes/Automailroutes.js";
import { initFirebase } from "./config/firebase.js";
import { backfillTenantSecureIds } from "./utils/tenantSecureId.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

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
});

// ── Helper: compute expiry date ───────────────────────────────────────────────
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
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
      .populate("plan", "name price days beds isFree")
      .lean();
    if (!user) return res.status(404).json({ message: "User not found." });
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
app.post("/api/register", async (req, res) => {
  try {
    const { name, owner, ph, email, password, address, planId } = req.body;

    if (!name || !owner || !ph || !email || !password || !address)
      return res.status(400).json({ message: "All fields are required." });

    const existing = await User.findOne({ email: email.toLowerCase().trim() }).select("_id").lean();
    if (existing)
      return res.status(400).json({ message: "Email already registered." });

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

    const user = new User({
      name:            name.trim(),
      owner:           owner.trim(),
      ph:              ph.trim(),
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
    res.status(500).json({ message: "Server error.", error: err.message });
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password required." });

    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .populate("plan", "name price days beds isFree");

    if (!user)
      return res.status(400).json({ message: "Invalid credentials." });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(400).json({ message: "Invalid credentials." });

    // ── Pending approval ──────────────────────────────────────────────────────
    if (user.loginStatus === "pending") {
      return res.status(403).json({
        message: "Your account is awaiting approval. We will respond shortly.",
        pending: true,
        extensionPending: user.extensionRequest?.requested || false,
      });
    }

    // ── Blocked ───────────────────────────────────────────────────────────────
    if (user.role !== "master" && user.loginStatus === "blocked") {
      return res.status(403).json({
        message: "Your login has been stopped by the website owner. Please contact support.",
        blocked: true,
      });
    }

    // ── Plan expiry check (runs for ALL non-master users who have a plan) ─────
    if (user.role !== "master" && user.planExpiresAt) {
      const now = new Date();
      if (now > new Date(user.planExpiresAt)) {
        if (user.planStatus !== "expired") {
          user.planStatus = "expired";
          await user.save();
        }
        return res.status(403).json({
          message: "Your plan has expired. Please renew to continue.",
          planExpired: true,
          planInfo: {
            planName:        user.planName,
            planActivatedAt: user.planActivatedAt,
            planExpiresAt:   user.planExpiresAt,
            planRenewalAt:   user.planRenewalAt,
            usedFreePlan:    user.usedFreePlan,
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
        });
      }
    }

    // ── Also block if already marked expired ─────────────────────────────────
    if (user.role !== "master" && user.planStatus === "expired") {
      return res.status(403).json({
        message: "Your plan has expired. Please renew to continue.",
        planExpired: true,
        planInfo: {
          planName:        user.planName,
          planActivatedAt: user.planActivatedAt,
          planExpiresAt:   user.planExpiresAt,
          planRenewalAt:   user.planRenewalAt,
          usedFreePlan:    user.usedFreePlan,
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
      });
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
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
