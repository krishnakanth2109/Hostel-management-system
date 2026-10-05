import express from "express";
import jwt from "jsonwebtoken";
import { sendRentReminder } from "../utils/whatsappService.js";
import { processRentReminders } from "../utils/whatsappReminderAutomation.js";

const router = express.Router();

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

router.get("/ping", (req, res) => {
  res.json({ success: true });
});

// Temporary manual integration test. No frontend route or scheduler uses this.
router.post("/test-rent-reminder", auth, async (req, res) => {
  console.log("WhatsApp test endpoint hit");
  const requiredFields = [
    "phoneNumber",
    "tenantName",
    "hostelName",
    "month",
    "currentRentPending",
    "advancePending",
    "previousPendingSummary",
    "totalPending",
    "dueDate",
  ];
  const missingFields = requiredFields.filter(
    (field) => req.body[field] == null || String(req.body[field]).trim() === ""
  );

  if (missingFields.length) {
    return res.status(400).json({
      success: false,
      message: `Missing required fields: ${missingFields.join(", ")}.`,
    });
  }

  try {
    const result = await sendRentReminder(req.body);
    res.json({
      success: true,
      message: "Rent reminder accepted by Meta.",
      data: result,
    });
  } catch (err) {
    const status = err.code === "INVALID_PHONE_NUMBER"
      ? 400
      : err.code === "WHATSAPP_CONFIG_ERROR"
        ? 500
        : 502;

    res.status(status).json({
      success: false,
      message: err.message,
    });
  }
});

// Runs the same current-day processor used by cron and startup catch-up.
router.post("/process-rent-reminders", auth, async (req, res) => {
  try {
    const summary = await processRentReminders({
      ownerId: req.user.id,
      trigger: "MANUAL",
    });
    res.json({
      success: true,
      message: "WhatsApp rent reminder processing completed.",
      summary,
    });
  } catch (err) {
    console.error("[WhatsAppReminder] Manual run failed:", err.message);
    res.status(500).json({
      success: false,
      message: "WhatsApp rent reminder processing failed.",
    });
  }
});

export default router;
