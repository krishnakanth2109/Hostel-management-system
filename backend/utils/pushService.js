// utils/pushService.js — send FCM push notifications to an owner's devices.
import admin, { initFirebase, isFirebaseReady } from "../config/firebase.js";
import User from "../models/User.js";

/**
 * Send a push notification to every device an owner is logged in on.
 * Stale / unregistered tokens are pruned from the user document automatically.
 *
 * @param {string} ownerId                 - User._id of the hostel owner
 * @param {object} payload
 * @param {string} payload.title           - Notification title
 * @param {string} payload.body            - Notification body
 * @param {object} [payload.data]          - Extra key/value data (stringified)
 * @returns {Promise<{sent:number, failed?:number, skipped?:boolean, error?:string}>}
 */
export async function sendPushToOwner(ownerId, { title, body, data = {} }) {
  // Lazily initialise Firebase the first time we actually need to send.
  if (!isFirebaseReady()) {
    initFirebase();
    if (!isFirebaseReady()) return { sent: 0, skipped: true };
  }

  const owner = await User.findById(ownerId).select("fcmTokens");
  const tokens = (owner?.fcmTokens || []).map((t) => t.token).filter(Boolean);
  if (!tokens.length) return { sent: 0 };

  // FCM data values must all be strings.
  const stringData = {};
  Object.entries(data).forEach(([k, v]) => {
    stringData[k] = String(v ?? "");
  });

  const message = {
    tokens,
    notification: { title, body },
    data: stringData,
    android: {
      priority: "high",
      notification: {
        channelId: "onboarding",
        sound: "default",
        // Lets a notification-tap deep-link to the onboarding screen.
        clickAction: "OPEN_ONBOARDING",
      },
    },
    apns: {
      headers: { "apns-priority": "10" },
      payload: { aps: { sound: "default", badge: 1 } },
    },
  };

  try {
    const resp = await admin.messaging().sendEachForMulticast(message);

    // Prune tokens FCM tells us are dead so we don't keep retrying them.
    const invalid = [];
    resp.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || "";
        if (
          code.includes("registration-token-not-registered") ||
          code.includes("invalid-registration-token") ||
          code.includes("invalid-argument")
        ) {
          invalid.push(tokens[i]);
        }
      }
    });

    if (invalid.length) {
      await User.updateOne(
        { _id: ownerId },
        { $pull: { fcmTokens: { token: { $in: invalid } } } }
      );
    }

    return { sent: resp.successCount, failed: resp.failureCount };
  } catch (err) {
    console.error("❌ Push send error:", err.message);
    return { sent: 0, error: err.message };
  }
}
