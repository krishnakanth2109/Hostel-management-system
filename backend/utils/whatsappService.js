import axios from "axios";

const DEFAULT_API_VERSION = "v25.0";
const DEFAULT_TEMPLATE_NAME = "rent_due_reminder";
const OWNER_OTP_TEMPLATE_NAME = "nilayam_otp_verification";
const OTP_PLACEHOLDER = "{{OTP}}";

function getWhatsAppConfig() {
  const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  const apiVersion = (process.env.WHATSAPP_API_VERSION || DEFAULT_API_VERSION).trim();
  const templateName = (process.env.WHATSAPP_TEMPLATE_NAME || DEFAULT_TEMPLATE_NAME).trim();

  if (!accessToken || !phoneNumberId || !templateName || !apiVersion) {
    const error = new Error("WhatsApp Cloud API is not fully configured.");
    error.code = "WHATSAPP_CONFIG_ERROR";
    throw error;
  }

  if (!/^\d+$/.test(phoneNumberId) || !/^v\d+\.\d+$/.test(apiVersion)) {
    const error = new Error("WhatsApp Cloud API configuration is invalid.");
    error.code = "WHATSAPP_CONFIG_ERROR";
    throw error;
  }

  return { accessToken, phoneNumberId, apiVersion, templateName };
}

function replaceOtpPlaceholder(value, otp, state) {
  if (Array.isArray(value)) return value.map((item) => replaceOtpPlaceholder(item, otp, state));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceOtpPlaceholder(item, otp, state)])
    );
  }
  if (typeof value === "string" && value.includes(OTP_PLACEHOLDER)) {
    state.replacements += 1;
    return value.replaceAll(OTP_PLACEHOLDER, otp);
  }
  return value;
}

export function buildOwnerOtpTemplatePayload({ phoneNumber, otp, env = process.env }) {
  const languageCode = (env.WHATSAPP_OTP_TEMPLATE_LANGUAGE || "").trim();
  const componentsJson = (env.WHATSAPP_OTP_TEMPLATE_COMPONENTS_JSON || "").trim();
  const templateName = (env.WHATSAPP_OTP_TEMPLATE_NAME || OWNER_OTP_TEMPLATE_NAME).trim();

  if (!languageCode || !componentsJson || !templateName) {
    const error = new Error(
      "WhatsApp OTP template configuration is incomplete. Set its approved language and components."
    );
    error.code = "WHATSAPP_OTP_CONFIG_ERROR";
    throw error;
  }

  let configuredComponents;
  try {
    configuredComponents = JSON.parse(componentsJson);
  } catch {
    const error = new Error("WHATSAPP_OTP_TEMPLATE_COMPONENTS_JSON must be valid JSON.");
    error.code = "WHATSAPP_OTP_CONFIG_ERROR";
    throw error;
  }
  if (!Array.isArray(configuredComponents)) {
    const error = new Error("WhatsApp OTP template components must be a JSON array.");
    error.code = "WHATSAPP_OTP_CONFIG_ERROR";
    throw error;
  }

  const state = { replacements: 0 };
  const components = replaceOtpPlaceholder(configuredComponents, String(otp), state);
  if (state.replacements === 0) {
    const error = new Error(`WhatsApp OTP template components must contain ${OTP_PLACEHOLDER}.`);
    error.code = "WHATSAPP_OTP_CONFIG_ERROR";
    throw error;
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: formatWhatsAppPhoneNumber(phoneNumber),
    type: "template",
    template: { name: templateName, language: { code: languageCode }, components },
  };
}

export async function sendOwnerLoginOtp({ phoneNumber, otp }) {
  const { accessToken, phoneNumberId, apiVersion } = getWhatsAppConfig();
  const payload = buildOwnerOtpTemplatePayload({ phoneNumber, otp });

  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      payload,
      {
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        timeout: 15000,
      }
    );
    return { messageId: data.messages?.[0]?.id || null };
  } catch (err) {
    const metaError = err.response?.data?.error;
    console.error("WhatsApp Cloud API OTP delivery error:", {
      status: err.response?.status || null,
      code: metaError?.code || null,
      type: metaError?.type || null,
      message: metaError?.message || err.message,
      fbtraceId: metaError?.fbtrace_id || null,
    });
    const error = new Error("Meta could not accept the WhatsApp OTP message.");
    error.code = "WHATSAPP_API_ERROR";
    error.status = err.response?.status || 502;
    throw error;
  }
}

export function formatWhatsAppPhoneNumber(phoneNumber) {
  let digits = String(phoneNumber ?? "").replace(/\D/g, "");

  if (digits.startsWith("00")) digits = digits.slice(2);

  // Normalize Indian mobile numbers to 91XXXXXXXXXX for Meta.
  if (/^[6-9]\d{9}$/.test(digits)) {
    digits = `91${digits}`;
  } else if (/^0[6-9]\d{9}$/.test(digits)) {
    digits = `91${digits.slice(1)}`;
  } else if (/^091[6-9]\d{9}$/.test(digits)) {
    digits = digits.slice(1);
  }

  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    const error = new Error("Enter a valid phone number with its country code.");
    error.code = "INVALID_PHONE_NUMBER";
    throw error;
  }

  return digits;
}

/**
 * Send the approved rent_due_reminder Meta WhatsApp template.
 * Body variables: tenant name, hostel name, month, current rent pending,
 * advance pending, previous pending summary, total pending, due date.
 */
export async function sendRentReminder({
  phoneNumber,
  tenantName,
  hostelName,
  month,
  currentRentPending,
  advancePending,
  previousPendingSummary,
  totalPending,
  dueDate,
}) {
  const { accessToken, phoneNumberId, apiVersion, templateName } = getWhatsAppConfig();
  const recipient = formatWhatsAppPhoneNumber(phoneNumber);

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient,
    type: "template",
    template: {
      name: templateName,
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: String(tenantName) },
            { type: "text", text: String(hostelName) },
            { type: "text", text: String(month) },
            { type: "text", text: String(currentRentPending) },
            { type: "text", text: String(advancePending) },
            { type: "text", text: String(previousPendingSummary) },
            { type: "text", text: String(totalPending) },
            { type: "text", text: String(dueDate) },
          ],
        },
      ],
    },
  };

  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    return {
      messageId: data.messages?.[0]?.id || null,
      recipient: data.contacts?.[0]?.wa_id || recipient,
      messageStatus: data.messages?.[0]?.message_status || "accepted",
    };
  } catch (err) {
    const metaError = err.response?.data?.error;
    console.error("WhatsApp Cloud API error:", {
      status: err.response?.status || null,
      code: metaError?.code || null,
      type: metaError?.type || null,
      message: metaError?.message || err.message,
      fbtraceId: metaError?.fbtrace_id || null,
    });

    const error = new Error("Meta could not accept the WhatsApp reminder.");
    error.code = "WHATSAPP_API_ERROR";
    error.status = err.response?.status || 502;
    throw error;
  }
}
