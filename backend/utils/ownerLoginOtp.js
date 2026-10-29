import crypto from "crypto";

export const OWNER_OTP_TTL_MS = 10 * 60 * 1000;
export const OWNER_OTP_RESEND_MS = 60 * 1000;
export const OWNER_OTP_MAX_ATTEMPTS = 5;
export const OWNER_OTP_MAX_SENDS_PER_HOUR = 5;

export function normalizeIndianMobile(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);

  if (!/^[6-9]\d{9}$/.test(digits)) {
    const error = new Error("Enter a valid 10-digit Indian mobile number.");
    error.code = "INVALID_MOBILE";
    throw error;
  }
  return `91${digits}`;
}

export function indianMobileLookupRegex(normalizedMobile) {
  const local = normalizeIndianMobile(normalizedMobile).slice(2).split("").join("[\\s().-]*");
  return new RegExp(`^\\s*(?:\\+?91[\\s().-]*|0[\\s().-]*)?${local}\\s*$`);
}

function otpDigest({ pepper, ownerId, mobile, nonce, otp }) {
  return crypto
    .createHmac("sha256", pepper)
    .update(`${ownerId}:${mobile}:${nonce}:${otp}`)
    .digest();
}

export class SlidingWindowRateLimiter {
  constructor({ limit, windowMs, now = () => Date.now() }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.entries = new Map();
  }

  consume(key) {
    const current = this.now();
    const recent = (this.entries.get(key) || []).filter((time) => current - time < this.windowMs);
    if (recent.length >= this.limit) {
      const error = new Error("Too many requests. Please try again later.");
      error.code = "RATE_LIMITED";
      error.retryAfterSeconds = Math.max(1, Math.ceil((this.windowMs - (current - recent[0])) / 1000));
      throw error;
    }
    recent.push(current);
    this.entries.set(key, recent);
    if (this.entries.size > 10_000) this.entries.delete(this.entries.keys().next().value);
  }
}

export class OwnerLoginOtpManager {
  constructor({
    pepper,
    now = () => Date.now(),
    generateOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0"),
  }) {
    if (!pepper) throw new Error("JWT_SECRET is required for secure OTP hashing.");
    this.pepper = pepper;
    this.now = now;
    this.generateOtp = generateOtp;
    this.entries = new Map();
  }

  issue(ownerId, mobile) {
    const current = this.now();
    const existing = this.entries.get(ownerId);
    const recentSends = (existing?.sendTimes || []).filter((time) => current - time < 60 * 60 * 1000);

    if (existing?.resendAt > current) {
      const error = new Error("Please wait before requesting another OTP.");
      error.code = "RESEND_COOLDOWN";
      error.retryAfterSeconds = Math.ceil((existing.resendAt - current) / 1000);
      throw error;
    }
    if (recentSends.length >= OWNER_OTP_MAX_SENDS_PER_HOUR) {
      const error = new Error("OTP request limit reached. Please try again later.");
      error.code = "RATE_LIMITED";
      error.retryAfterSeconds = Math.ceil((60 * 60 * 1000 - (current - recentSends[0])) / 1000);
      throw error;
    }

    const otp = this.generateOtp();
    const nonce = crypto.randomBytes(16).toString("hex");
    this.entries.set(ownerId, {
      mobile,
      nonce,
      otpHash: otpDigest({ pepper: this.pepper, ownerId, mobile, nonce, otp }),
      expiresAt: current + OWNER_OTP_TTL_MS,
      resendAt: current + OWNER_OTP_RESEND_MS,
      attempts: 0,
      sendTimes: [...recentSends, current],
    });

    return { otp, nonce, expiresInSeconds: OWNER_OTP_TTL_MS / 1000, resendAfterSeconds: OWNER_OTP_RESEND_MS / 1000 };
  }

  cancel(ownerId, nonce) {
    const entry = this.entries.get(ownerId);
    if (!entry || entry.nonce !== nonce) return;
    this.entries.set(ownerId, { ...entry, otpHash: null, expiresAt: 0, resendAt: 0 });
  }

  verify(ownerId, mobile, otp) {
    const entry = this.entries.get(ownerId);
    if (!entry || !entry.otpHash || entry.mobile !== mobile || entry.expiresAt <= this.now()) {
      const error = new Error("OTP has expired or was not found. Please request a new OTP.");
      error.code = "OTP_EXPIRED";
      throw error;
    }
    if (entry.attempts >= OWNER_OTP_MAX_ATTEMPTS) {
      const error = new Error("Too many incorrect attempts. Please request a new OTP.");
      error.code = "OTP_ATTEMPTS_EXCEEDED";
      throw error;
    }

    const supplied = otpDigest({ pepper: this.pepper, ownerId, mobile, nonce: entry.nonce, otp });
    if (!crypto.timingSafeEqual(entry.otpHash, supplied)) {
      entry.attempts += 1;
      const remainingAttempts = OWNER_OTP_MAX_ATTEMPTS - entry.attempts;
      const error = new Error(
        remainingAttempts > 0
          ? `Incorrect OTP. ${remainingAttempts} attempt${remainingAttempts === 1 ? "" : "s"} remaining.`
          : "Too many incorrect attempts. Please request a new OTP."
      );
      error.code = remainingAttempts > 0 ? "INVALID_OTP" : "OTP_ATTEMPTS_EXCEEDED";
      error.remainingAttempts = remainingAttempts;
      throw error;
    }

    // Removing the entry makes the code single-use before a JWT is issued.
    this.entries.delete(ownerId);
    return true;
  }
}
