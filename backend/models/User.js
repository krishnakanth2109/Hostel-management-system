// models/User.js — with planActivatedAt, planExpiresAt, planRenewalAt + extension support
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true },
    owner:       { type: String, required: true },
    ph:          { type: String, required: true },
    email:       { type: String, required: true, unique: true },
    password:    { type: String, required: true },
    address:     { type: String, required: true },
    role:        { type: String, enum: ["user", "master"], default: "user" },
    loginStatus: { type: String, enum: ["active", "blocked", "pending"], default: "active" },

    // ── Permanent onboarding short code ───────────────────────────────────────
    // One fixed, never-expiring short code per owner, used to build a clean
    // short onboarding link (e.g. /tenant-register/Ab3xK9pQ). Generated once on
    // first request and reused forever; survives server restarts.
    onboardingCode: { type: String, default: null, index: true },

    // Plan reference
    plan:     { type: mongoose.Schema.Types.ObjectId, ref: "Plan", default: null },
    planName: { type: String, default: null },

    // ── Plan lifecycle timestamps ─────────────────────────────────────────────
    // Set at registration (free) or at approval (paid)
    planActivatedAt: { type: Date, default: null },
    // planActivatedAt + plan.days  → login blocked when now > planExpiresAt
    planExpiresAt:   { type: Date, default: null },
    // Updated each time a renewal/extension is approved by master
    planRenewalAt:   { type: Date, default: null },

    // ── Plan status ───────────────────────────────────────────────────────────
    planStatus: { type: String, enum: ["active", "expired", "none"], default: "none" },

    // ── Accumulated bed limit ─────────────────────────────────────────────────
    // On new registration/approval: set to plan.beds
    // On extension approval: incremented by the new extension plan's beds
    // This is the actual enforced bed limit used across buildingRoutes
    planBeds: { type: Number, default: null },

    // Prevent re-using free trial on renewal
    usedFreePlan: { type: Boolean, default: false },

    // ── Push notifications (FCM device tokens) ────────────────────────────────
    // Every device the owner is logged in on registers its FCM token here so we
    // can push real-time onboarding alerts to all of them (WhatsApp-style).
    fcmTokens: [
      {
        token:     { type: String, required: true },
        platform:  { type: String, default: "android" },
        updatedAt: { type: Date,   default: Date.now },
      },
    ],

    // ── Extension / renewal request ───────────────────────────────────────────
    extensionRequest: {
      requested:   { type: Boolean, default: false },
      planId:      { type: mongoose.Schema.Types.ObjectId, ref: "Plan", default: null },
      planName:    { type: String, default: null },
      planPrice:   { type: Number, default: null },
      planDays:    { type: Number, default: null },
      requestedAt: { type: Date,   default: null },
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);