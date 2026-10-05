import cron from "node-cron";
import Building from "../models/Building.js";
import RentPayment from "../models/Rentpayment.js";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import WhatsAppReminderLog from "../models/WhatsAppReminderLog.js";
import WhatsAppReminderSettings from "../models/WhatsAppReminderSettings.js";
import { formatWhatsAppPhoneNumber, sendRentReminder } from "./whatsappService.js";

const DEFAULT_CRON = "0 9 * * *";
const DEFAULT_TIMEZONE = "Asia/Kolkata";
const OUTSTANDING_STATUSES = ["Due", "Partial"];

function dateFormatter(timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function dateParts(date, timeZone) {
  const parts = dateFormatter(timeZone).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function getCalendarDateKey(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const { year, month, day } = dateParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addCalendarDays(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function formatDueDate(dateKey) {
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year}`;
}

function formatRentMonth(monthYear) {
  if (!/^\d{4}-\d{2}$/.test(String(monthYear || ""))) return String(monthYear || "");
  const [year, month] = monthYear.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

function getRemainingRent(record) {
  const rentAmount = Number(record?.rentAmount || 0);
  const paidAmount = Number(record?.paidAmount || 0);
  if (!Number.isFinite(rentAmount) || !Number.isFinite(paidAmount)) return NaN;
  return Math.max(0, rentAmount - paidAmount);
}

function getAdvancePending(tenant) {
  const advanceAmount = Math.max(0, Number(tenant?.advanceAmount || 0));
  const paidAdvance = Math.min(
    advanceAmount,
    Math.max(0, Number(tenant?.paidadvanceAmount || 0))
  );
  return Math.max(0, advanceAmount - paidAdvance);
}

function formatAmount(amount) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(amount);
}

function getPreviousPending(monthlyPayments, currentMonthlyPayment) {
  const currentMonthYear = String(currentMonthlyPayment.monthYear || "");
  if (!/^\d{4}-\d{2}$/.test(currentMonthYear)) {
    return { total: 0, summary: "No previous pending amount" };
  }

  const records = (monthlyPayments || [])
    .filter((record) => {
      const monthYear = String(record.monthYear || "");
      return String(record._id) !== String(currentMonthlyPayment._id)
        && OUTSTANDING_STATUSES.includes(record.status)
        && /^\d{4}-\d{2}$/.test(monthYear)
        && monthYear < currentMonthYear
        && getRemainingRent(record) > 0;
    })
    .map((record) => ({
      monthYear: record.monthYear,
      remaining: getRemainingRent(record),
    }))
    .sort((a, b) => String(b.monthYear).localeCompare(String(a.monthYear)));

  if (records.length === 0) {
    return { total: 0, summary: "No previous pending amount" };
  }

  return {
    total: records.reduce((sum, record) => sum + record.remaining, 0),
    summary: records
      .map((record) => `${formatRentMonth(record.monthYear)} - ₹${formatAmount(record.remaining)}`)
      .join("; "),
  };
}

function safeError(error) {
  return {
    code: String(error?.code || "REMINDER_ERROR").slice(0, 100),
    message: String(error?.message || "WhatsApp reminder failed.").slice(0, 500),
    status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
  };
}

function reminderIdentity(rentPayment, monthlyPayment, dueDateKey, reminderType) {
  return {
    rentPayment: rentPayment._id,
    monthlyPayment: monthlyPayment._id,
    dueDateKey,
    reminderType,
  };
}

async function logPreflightFailure({
  rentPayment,
  monthlyPayment,
  tenant,
  dueDate,
  dueDateKey,
  reminderType,
  recipientPhone,
  error,
}) {
  try {
    await WhatsAppReminderLog.updateOne(
      reminderIdentity(rentPayment, monthlyPayment, dueDateKey, reminderType),
      {
        $setOnInsert: {
          owner: rentPayment.owner,
          tenant: tenant._id,
          recipientPhone: recipientPhone || "MISSING",
          dueDate,
          status: "FAILED",
          sendAttempted: false,
          error: safeError(error),
        },
      },
      { upsert: true }
    );
  } catch (logError) {
    if (logError?.code !== 11000) {
      console.error("[WhatsAppReminder] Could not persist validation failure:", logError.message);
    }
  }
}

async function reserveReminder({
  rentPayment,
  monthlyPayment,
  tenant,
  recipientPhone,
  dueDate,
  dueDateKey,
  reminderType,
  processingDateKey,
}) {
  const identity = reminderIdentity(rentPayment, monthlyPayment, dueDateKey, reminderType);
  const values = {
    owner: rentPayment.owner,
    tenant: tenant._id,
    recipientPhone,
    dueDate,
    status: "PROCESSING",
    sendAttempted: true,
    error: null,
  };

  try {
    return await WhatsAppReminderLog.create({ ...identity, ...values });
  } catch (error) {
    if (error?.code !== 11000) throw error;

    // Only failures that happened before contacting Meta are safe to retry.
    const retryable = await WhatsAppReminderLog.findOneAndUpdate(
      { ...identity, status: "FAILED", sendAttempted: false },
      { $set: values },
      { returnDocument: "after" }
    );
    if (retryable) return retryable;

    const skippedAt = new Date();
    await WhatsAppReminderLog.updateOne(
      identity,
      [
        {
          $set: {
            duplicateSkipCount: { $add: [{ $ifNull: ["$duplicateSkipCount", 0] }, 1] },
            duplicateSkipTodayCount: {
              $cond: [
                { $eq: ["$duplicateSkipTodayDate", processingDateKey] },
                { $add: [{ $ifNull: ["$duplicateSkipTodayCount", 0] }, 1] },
                1,
              ],
            },
            duplicateSkipTodayDate: processingDateKey,
            lastDuplicateSkippedAt: skippedAt,
          },
        },
      ],
      { updatePipeline: true }
    );
    return null;
  }
}

async function getAutomationAccess(ownerId = null) {
  const settings = await WhatsAppReminderSettings.findOne({ key: "global" }).lean();
  if (!settings?.globalEnabled) {
    return { globalEnabled: false, owners: [], blockedReason: "GLOBAL_DISABLED" };
  }

  const ownerQuery = {
    role: "user",
    loginStatus: "active",
    whatsappRemindersEnabled: true,
    ...(ownerId ? { _id: ownerId } : {}),
  };
  const owners = await User.find(ownerQuery).select("name owner email ph").lean();
  return {
    globalEnabled: true,
    owners,
    blockedReason: owners.length ? null : "OWNER_DISABLED_OR_BLOCKED",
  };
}

function broadDateWindow(dateKeys) {
  const timestamps = dateKeys.map((key) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  });
  return {
    $gte: new Date(Math.min(...timestamps) - 24 * 60 * 60 * 1000),
    $lt: new Date(Math.max(...timestamps) + 2 * 24 * 60 * 60 * 1000),
  };
}

function reminderTypeFor(dueDateKey, todayKey, twoDaysFromTodayKey) {
  if (dueDateKey === todayKey) return "DUE_TODAY";
  if (dueDateKey === twoDaysFromTodayKey) return "TWO_DAYS_BEFORE";
  return null;
}

function logSummary(trigger, summary) {
  console.log(
    `[WhatsAppReminder] ${trigger} completed for ${summary.processingDate} (${summary.timeZone}): ` +
    `eligible=${summary.eligibleRecordsFound}, sent=${summary.sent}, ` +
    `duplicates=${summary.skippedDuplicates}, invalidPhones=${summary.invalidOrMissingPhones}, ` +
    `failed=${summary.failed}`
  );
}

/**
 * Shared processor used by cron, startup catch-up, and the authenticated manual route.
 * It intentionally considers only reminders valid for the current calendar day.
 */
export async function processRentReminders({
  ownerId = null,
  now = new Date(),
  trigger = "MANUAL",
  timeZone = (process.env.WHATSAPP_REMINDER_TIMEZONE || DEFAULT_TIMEZONE).trim(),
} = {}) {
  const todayKey = getCalendarDateKey(now, timeZone);
  const twoDaysFromTodayKey = addCalendarDays(todayKey, 2);
  const dueDateWindow = broadDateWindow([todayKey, twoDaysFromTodayKey]);
  const summary = {
    trigger,
    processingDate: todayKey,
    timeZone,
    eligibleRecordsFound: 0,
    sent: 0,
    skippedDuplicates: 0,
    invalidOrMissingPhones: 0,
    failed: 0,
  };

  const access = await getAutomationAccess(ownerId);
  if (access.blockedReason) {
    summary.automationBlockedReason = access.blockedReason;
    logSummary(trigger, summary);
    return summary;
  }
  const enabledOwnerIds = access.owners.map((owner) => owner._id);

  const rentQuery = {
    owner: { $in: enabledOwnerIds },
    monthlyPayments: {
      $elemMatch: {
        status: { $in: OUTSTANDING_STATUSES },
        dueDate: dueDateWindow,
      },
    },
  };
  const rentPayments = await RentPayment.find(rentQuery).lean();
  const tenantIds = [...new Set(rentPayments.map((rent) => String(rent.tenantId)))];
  const tenants = tenantIds.length
    ? await Tenant.find({ _id: { $in: tenantIds }, status: "Active" }).lean()
    : [];
  const tenantsById = new Map(tenants.map((tenant) => [String(tenant._id), tenant]));
  const buildingIds = [...new Set(tenants.filter((tenant) => tenant.buildingId).map((tenant) => String(tenant.buildingId)))];
  const buildings = buildingIds.length
    ? await Building.find({ _id: { $in: buildingIds } }, { buildingName: 1 }).lean()
    : [];
  const buildingsById = new Map(buildings.map((building) => [String(building._id), building]));

  for (const rentPayment of rentPayments) {
    const tenant = tenantsById.get(String(rentPayment.tenantId));
    if (!tenant) continue;

    for (const monthlyPayment of rentPayment.monthlyPayments || []) {
      if (!OUTSTANDING_STATUSES.includes(monthlyPayment.status)) continue;
      const currentRentPending = getRemainingRent(monthlyPayment);
      if (!Number.isFinite(currentRentPending) || currentRentPending <= 0) continue;

      const dueDate = new Date(monthlyPayment.dueDate);
      if (Number.isNaN(dueDate.getTime())) continue;
      const dueDateKey = getCalendarDateKey(dueDate, timeZone);
      const reminderType = reminderTypeFor(dueDateKey, todayKey, twoDaysFromTodayKey);
      if (!reminderType) continue;

      summary.eligibleRecordsFound += 1;
      let recipientPhone;
      try {
        recipientPhone = formatWhatsAppPhoneNumber(tenant.phone);
      } catch (error) {
        await logPreflightFailure({
          rentPayment,
          monthlyPayment,
          tenant,
          dueDate,
          dueDateKey,
          reminderType,
          recipientPhone: String(tenant.phone || "").trim(),
          error,
        });
        summary.invalidOrMissingPhones += 1;
        console.warn(`[WhatsAppReminder] Invalid phone for tenant ${tenant._id}; reminder skipped.`);
        continue;
      }

      const building = tenant.buildingId ? buildingsById.get(String(tenant.buildingId)) : null;
      const hostelName = String(building?.buildingName || tenant.allocationInfo?.buildingName || "").trim();
      const tenantName = String(tenant.name || "").trim();
      const rentMonth = formatRentMonth(monthlyPayment.monthYear);
      const advancePending = getAdvancePending(tenant);
      const previousPending = getPreviousPending(rentPayment.monthlyPayments, monthlyPayment);
      const totalPending = currentRentPending + advancePending + previousPending.total;
      if (
        !tenantName
        || !hostelName
        || !rentMonth
        || !Number.isFinite(advancePending)
        || !Number.isFinite(totalPending)
      ) {
        const error = new Error("Required WhatsApp reminder template data is missing.");
        error.code = "REMINDER_DATA_INVALID";
        await logPreflightFailure({
          rentPayment,
          monthlyPayment,
          tenant,
          dueDate,
          dueDateKey,
          reminderType,
          recipientPhone,
          error,
        });
        summary.failed += 1;
        console.warn(`[WhatsAppReminder] Missing template data for rent payment ${rentPayment._id}/${monthlyPayment._id}.`);
        continue;
      }

      let reminderLog;
      try {
        reminderLog = await reserveReminder({
          rentPayment,
          monthlyPayment,
          tenant,
          recipientPhone,
          dueDate,
          dueDateKey,
          reminderType,
          processingDateKey: todayKey,
        });
        if (!reminderLog) {
          summary.skippedDuplicates += 1;
          continue;
        }
      } catch (error) {
        summary.failed += 1;
        console.error(`[WhatsAppReminder] Could not reserve reminder ${rentPayment._id}/${monthlyPayment._id}:`, error.message);
        continue;
      }

      try {
        const result = await sendRentReminder({
          phoneNumber: recipientPhone,
          tenantName,
          hostelName,
          month: rentMonth,
          currentRentPending: formatAmount(currentRentPending),
          advancePending: formatAmount(advancePending),
          previousPendingSummary: previousPending.summary,
          totalPending: formatAmount(totalPending),
          dueDate: formatDueDate(dueDateKey),
        });
        reminderLog.status = "SENT";
        reminderLog.metaMessageId = result.messageId;
        reminderLog.recipientPhone = result.recipient || recipientPhone;
        reminderLog.sentAt = new Date();
        reminderLog.error = null;
        await reminderLog.save();
        summary.sent += 1;
      } catch (error) {
        reminderLog.status = "FAILED";
        reminderLog.error = safeError(error);
        await reminderLog.save().catch((saveError) => {
          console.error(`[WhatsAppReminder] Could not persist failure log ${reminderLog._id}:`, saveError.message);
        });
        summary.failed += 1;
        console.error(`[WhatsAppReminder] Send failed for reminder ${reminderLog._id}:`, error.message);
      }
    }
  }

  logSummary(trigger, summary);
  return summary;
}

/** Read-only projection of reminders that would be processed on a calendar day. */
export async function forecastRentReminders({
  processingDateKey,
  ownerId = null,
  timeZone = (process.env.WHATSAPP_REMINDER_TIMEZONE || DEFAULT_TIMEZONE).trim(),
} = {}) {
  const dateKey = processingDateKey || getCalendarDateKey(new Date(), timeZone);
  const twoDaysLaterKey = addCalendarDays(dateKey, 2);
  const access = await getAutomationAccess(ownerId);
  if (access.blockedReason) {
    return {
      processingDate: dateKey,
      timeZone,
      globalEnabled: access.globalEnabled,
      totalTenants: 0,
      totalReminders: 0,
      byOwner: [],
    };
  }

  const ownerById = new Map(access.owners.map((owner) => [String(owner._id), owner]));
  const rentPayments = await RentPayment.find({
    owner: { $in: access.owners.map((owner) => owner._id) },
    monthlyPayments: {
      $elemMatch: {
        status: { $in: OUTSTANDING_STATUSES },
        dueDate: broadDateWindow([dateKey, twoDaysLaterKey]),
      },
    },
  }).lean();
  const tenantIds = [...new Set(rentPayments.map((rent) => String(rent.tenantId)))];
  const tenants = tenantIds.length
    ? await Tenant.find({ _id: { $in: tenantIds }, status: "Active" })
        .select("owner name phone buildingId allocationInfo.buildingName advanceAmount paidadvanceAmount")
        .lean()
    : [];
  const tenantsById = new Map(tenants.map((tenant) => [String(tenant._id), tenant]));
  const buildingIds = [...new Set(tenants.filter((tenant) => tenant.buildingId).map((tenant) => String(tenant.buildingId)))];
  const buildings = buildingIds.length
    ? await Building.find({ _id: { $in: buildingIds } }).select("buildingName").lean()
    : [];
  const buildingsById = new Map(buildings.map((building) => [String(building._id), building]));
  const candidates = [];

  for (const rentPayment of rentPayments) {
    const tenant = tenantsById.get(String(rentPayment.tenantId));
    if (!tenant || !ownerById.has(String(rentPayment.owner))) continue;
    for (const monthlyPayment of rentPayment.monthlyPayments || []) {
      if (!OUTSTANDING_STATUSES.includes(monthlyPayment.status)) continue;
      if (!(getRemainingRent(monthlyPayment) > 0)) continue;
      const dueDate = new Date(monthlyPayment.dueDate);
      if (Number.isNaN(dueDate.getTime())) continue;
      const dueDateKey = getCalendarDateKey(dueDate, timeZone);
      const reminderType = reminderTypeFor(dueDateKey, dateKey, twoDaysLaterKey);
      if (!reminderType) continue;
      const building = tenant.buildingId ? buildingsById.get(String(tenant.buildingId)) : null;
      const hostelName = String(building?.buildingName || tenant.allocationInfo?.buildingName || "").trim();
      const rentMonth = formatRentMonth(monthlyPayment.monthYear);
      const advancePending = getAdvancePending(tenant);
      const previousPending = getPreviousPending(rentPayment.monthlyPayments, monthlyPayment);
      const totalPending = getRemainingRent(monthlyPayment) + advancePending + previousPending.total;
      try {
        formatWhatsAppPhoneNumber(tenant.phone);
      } catch {
        continue;
      }
      if (!String(tenant.name || "").trim() || !hostelName || !rentMonth || !Number.isFinite(totalPending)) continue;
      candidates.push({ rentPayment, monthlyPayment, tenant, dueDateKey, reminderType });
    }
  }

  const existingLogs = candidates.length
    ? await WhatsAppReminderLog.find({
        rentPayment: { $in: [...new Set(candidates.map((item) => item.rentPayment._id))] },
        dueDateKey: { $in: [dateKey, twoDaysLaterKey] },
        reminderType: { $in: ["DUE_TODAY", "TWO_DAYS_BEFORE"] },
      }).select("rentPayment monthlyPayment dueDateKey reminderType status sendAttempted").lean()
    : [];
  const logByKey = new Map(existingLogs.map((log) => [
    `${log.rentPayment}:${log.monthlyPayment}:${log.dueDateKey}:${log.reminderType}`,
    log,
  ]));
  const sendable = candidates.filter((item) => {
    const key = `${item.rentPayment._id}:${item.monthlyPayment._id}:${item.dueDateKey}:${item.reminderType}`;
    const log = logByKey.get(key);
    return !log || (log.status === "FAILED" && !log.sendAttempted);
  });

  const grouped = new Map();
  for (const item of sendable) {
    const ownerIdKey = String(item.rentPayment.owner);
    const owner = ownerById.get(ownerIdKey);
    if (!grouped.has(ownerIdKey)) {
      grouped.set(ownerIdKey, {
        ownerId: ownerIdKey,
        businessName: owner?.name || "",
        ownerName: owner?.owner || owner?.name || "",
        tenantIds: new Set(),
        DUE_TODAY: 0,
        TWO_DAYS_BEFORE: 0,
      });
    }
    const row = grouped.get(ownerIdKey);
    row.tenantIds.add(String(item.tenant._id));
    row[item.reminderType] += 1;
  }

  const byOwner = [...grouped.values()].map((row) => ({
    ownerId: row.ownerId,
    businessName: row.businessName,
    ownerName: row.ownerName,
    tenantCount: row.tenantIds.size,
    reminderCount: row.DUE_TODAY + row.TWO_DAYS_BEFORE,
    reminderTypes: {
      DUE_TODAY: row.DUE_TODAY,
      TWO_DAYS_BEFORE: row.TWO_DAYS_BEFORE,
    },
  }));

  return {
    processingDate: dateKey,
    timeZone,
    globalEnabled: true,
    totalTenants: new Set(sendable.map((item) => String(item.tenant._id))).size,
    totalReminders: sendable.length,
    byOwner,
  };
}

export async function initializeWhatsAppReminderAutomation() {
  const configuredCron = (process.env.WHATSAPP_REMINDER_CRON || DEFAULT_CRON).trim();
  const timeZone = (process.env.WHATSAPP_REMINDER_TIMEZONE || DEFAULT_TIMEZONE).trim();

  if (!cron.validate(configuredCron)) {
    throw new Error(`Invalid WHATSAPP_REMINDER_CRON expression: ${configuredCron}`);
  }
  // Throws at startup for an invalid IANA timezone instead of silently scheduling incorrectly.
  dateFormatter(timeZone).format(new Date());
  await WhatsAppReminderLog.init();

  cron.schedule(
    configuredCron,
    () => processRentReminders({ trigger: "CRON", timeZone }).catch((error) => {
      console.error("[WhatsAppReminder] Cron run failed:", error.message);
    }),
    { timezone: timeZone, noOverlap: true }
  );
  console.log(`[WhatsAppReminder] Scheduled with cron "${configuredCron}" in ${timeZone}.`);

  // Current-day-only catch-up. The unique log makes repeated restarts safe.
  await processRentReminders({ trigger: "STARTUP", timeZone });

  // Detect process suspension (for example, a sleeping host) and run the same
  // current-day-only catch-up as soon as the event loop becomes active again.
  let lastHeartbeat = Date.now();
  const wakeDetector = setInterval(() => {
    const currentTime = Date.now();
    const elapsed = currentTime - lastHeartbeat;
    lastHeartbeat = currentTime;
    if (elapsed > 90 * 1000) {
      processRentReminders({ trigger: "WAKEUP", timeZone }).catch((error) => {
        console.error("[WhatsAppReminder] Wake-up catch-up failed:", error.message);
      });
    }
  }, 60 * 1000);
  wakeDetector.unref?.();
}
