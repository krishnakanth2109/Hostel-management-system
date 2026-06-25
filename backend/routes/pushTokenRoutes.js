// routes/pushTokenRoutes.js — register / unregister owner FCM device tokens.
import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = express.Router();

// Same lightweight JWT auth pattern used across the other routers.
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

// ── POST /api/push-tokens/register ────────────────────────────────────────────
// Called by the mobile app after login. Stores the device's FCM token against
// the logged-in owner (idempotent — updates timestamp if it already exists).
router.post("/register", auth, async (req, res) => {
  try {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ message: "token is required." });

    // A device may have been used by another owner before (shared phone / re-login).
    // Detach this token from every other user first so a push only ever reaches
    // the owner currently logged in on that device.
    await User.updateMany(
      { _id: { $ne: req.user.id }, "fcmTokens.token": token },
      { $pull: { fcmTokens: { token } } }
    );

    // Update in place if the current user already has this token...
    const updated = await User.updateOne(
      { _id: req.user.id, "fcmTokens.token": token },
      { $set: { "fcmTokens.$.platform": platform || "android", "fcmTokens.$.updatedAt": new Date() } }
    );

    // ...otherwise push a new entry.
    if (!updated.matchedCount) {
      await User.updateOne(
        { _id: req.user.id },
        { $push: { fcmTokens: { token, platform: platform || "android", updatedAt: new Date() } } }
      );
    }

    res.json({ message: "Token registered." });
  } catch (err) {
    res.status(500).json({ message: "Server error.", error: err.message });
  }
});

// ── POST /api/push-tokens/unregister ──────────────────────────────────────────
// Called on logout so a signed-out device stops receiving the owner's pushes.
router.post("/unregister", auth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "token is required." });
    await User.updateOne({ _id: req.user.id }, { $pull: { fcmTokens: { token } } });
    res.json({ message: "Token removed." });
  } catch (err) {
    res.status(500).json({ message: "Server error.", error: err.message });
  }
});

export default router;
