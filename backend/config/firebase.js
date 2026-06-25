// config/firebase.js — Firebase Admin SDK bootstrap for push notifications.
//
// Credentials are loaded (in priority order) from:
//   1. FIREBASE_SERVICE_ACCOUNT      → the whole service-account JSON as a string
//   2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
//   3. backend/serviceAccountKey.json file on disk
//
// If none are present the server still boots — push is simply disabled with a
// warning (same graceful-degradation pattern used for Cloudinary).
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

let initialized = false;

function loadServiceAccount() {
  // 1. Full JSON blob in a single env var (best for Render / hosted envs)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
      console.error("❌ FIREBASE_SERVICE_ACCOUNT is not valid JSON:", e.message);
    }
  }

  // 2. Individual fields. The private key keeps real newlines, so when it is
  //    stored as a single-line env var we restore the "\n" escapes.
  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return {
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }

  // 3. Local JSON file (handy for local development)
  const filePath = path.join(__dirname, "..", "serviceAccountKey.json");
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (e) {
      console.error("❌ serviceAccountKey.json is not valid JSON:", e.message);
    }
  }

  return null;
}

export function initFirebase() {
  if (initialized) return admin;

  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    console.warn("⚠️  Firebase service account not configured — push notifications disabled.");
    return null;
  }

  try {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    initialized = true;
    console.log("✅ Firebase Admin initialized — push notifications enabled");
    return admin;
  } catch (err) {
    console.error("❌ Firebase init failed:", err.message);
    return null;
  }
}

export function isFirebaseReady() {
  return initialized;
}

export default admin;
