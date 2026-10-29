import test from "node:test";
import assert from "node:assert/strict";
import {
  indianMobileLookupRegex,
  normalizeIndianMobile,
  OWNER_OTP_MAX_ATTEMPTS,
  OWNER_OTP_RESEND_MS,
  OWNER_OTP_TTL_MS,
  OwnerLoginOtpManager,
  SlidingWindowRateLimiter,
} from "../utils/ownerLoginOtp.js";
import { buildOwnerOtpTemplatePayload } from "../utils/whatsappService.js";

test("Indian owner mobiles normalize without changing the stored owner account", () => {
  assert.equal(normalizeIndianMobile("98765 43210"), "919876543210");
  assert.equal(normalizeIndianMobile("+91-98765-43210"), "919876543210");
  assert.equal(normalizeIndianMobile("09876543210"), "919876543210");
  assert.throws(() => normalizeIndianMobile("12345"), { code: "INVALID_MOBILE" });

  const lookup = indianMobileLookupRegex("919876543210");
  assert.equal(lookup.test("+91 98765-43210"), true);
  assert.equal(lookup.test("9876543210"), true);
  assert.equal(lookup.test("9876543211"), false);
});

test("OTP is hashed, accepted once, and cannot be reused", () => {
  const manager = new OwnerLoginOtpManager({
    pepper: "test-only-pepper",
    generateOtp: () => "482901",
  });
  const issued = manager.issue("owner-1", "919876543210");

  assert.equal(issued.expiresInSeconds, 600);
  assert.equal(manager.entries.get("owner-1").otpHash.toString().includes(issued.otp), false);
  assert.equal(manager.verify("owner-1", "919876543210", "482901"), true);
  assert.throws(
    () => manager.verify("owner-1", "919876543210", "482901"),
    { code: "OTP_EXPIRED" }
  );
});

test("expired OTPs and excessive incorrect attempts are rejected", () => {
  let now = 1_000;
  const expiredManager = new OwnerLoginOtpManager({
    pepper: "test-only-pepper",
    now: () => now,
    generateOtp: () => "111111",
  });
  expiredManager.issue("owner-1", "919876543210");
  now += OWNER_OTP_TTL_MS + 1;
  assert.throws(
    () => expiredManager.verify("owner-1", "919876543210", "111111"),
    { code: "OTP_EXPIRED" }
  );

  const attemptsManager = new OwnerLoginOtpManager({
    pepper: "test-only-pepper",
    generateOtp: () => "222222",
  });
  attemptsManager.issue("owner-2", "919876543211");
  for (let attempt = 1; attempt < OWNER_OTP_MAX_ATTEMPTS; attempt += 1) {
    assert.throws(
      () => attemptsManager.verify("owner-2", "919876543211", "000000"),
      { code: "INVALID_OTP" }
    );
  }
  assert.throws(
    () => attemptsManager.verify("owner-2", "919876543211", "000000"),
    { code: "OTP_ATTEMPTS_EXCEEDED" }
  );
  assert.throws(
    () => attemptsManager.verify("owner-2", "919876543211", "222222"),
    { code: "OTP_ATTEMPTS_EXCEEDED" }
  );
});

test("resend cooldown and request rate limiting are enforced", () => {
  let now = 10_000;
  const manager = new OwnerLoginOtpManager({
    pepper: "test-only-pepper",
    now: () => now,
    generateOtp: () => "333333",
  });
  manager.issue("owner-1", "919876543210");
  assert.throws(() => manager.issue("owner-1", "919876543210"), { code: "RESEND_COOLDOWN" });
  now += OWNER_OTP_RESEND_MS;
  assert.doesNotThrow(() => manager.issue("owner-1", "919876543210"));

  const limiter = new SlidingWindowRateLimiter({ limit: 2, windowMs: 1000, now: () => now });
  limiter.consume("client");
  limiter.consume("client");
  assert.throws(() => limiter.consume("client"), { code: "RATE_LIMITED" });
  now += 1001;
  assert.doesNotThrow(() => limiter.consume("client"));
});

test("OTP template payload requires explicit approved language and component format", () => {
  assert.throws(
    () => buildOwnerOtpTemplatePayload({ phoneNumber: "9876543210", otp: "123456", env: {} }),
    { code: "WHATSAPP_OTP_CONFIG_ERROR" }
  );

  const payload = buildOwnerOtpTemplatePayload({
    phoneNumber: "9876543210",
    otp: "123456",
    env: {
      WHATSAPP_OTP_TEMPLATE_NAME: "nilayam_otp_verification",
      WHATSAPP_OTP_TEMPLATE_LANGUAGE: "en",
      WHATSAPP_OTP_TEMPLATE_COMPONENTS_JSON: JSON.stringify([
        { type: "body", parameters: [{ type: "text", text: "{{OTP}}" }] },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: "{{OTP}}" }],
        },
      ]),
    },
  });

  assert.equal(payload.template.name, "nilayam_otp_verification");
  assert.equal(payload.template.language.code, "en");
  assert.equal(payload.template.components[0].parameters[0].text, "123456");
  assert.equal(payload.template.components[1].sub_type, "url");
  assert.equal(payload.template.components[1].index, "0");
  assert.equal(payload.template.components[1].parameters[0].text, "123456");
  assert.equal(payload.to, "919876543210");
});
