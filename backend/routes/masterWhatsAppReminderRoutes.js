import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Building from "../models/Building.js";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import WhatsAppReminderLog from "../models/WhatsAppReminderLog.js";
import WhatsAppReminderSettings from "../models/WhatsAppReminderSettings.js";
import {
  addCalendarDays,
  forecastRentReminders,
  getCalendarDateKey,
} from "../utils/whatsappReminderAutomation.js";

const router = express.Router();
const TIMEZONE = "Asia/Kolkata";

const masterAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided." });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "master") return res.status(403).json({ message: "Access denied. Master only." });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token." });
  }
};

function calendarRange(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  if (!year || !month || !day) return null;
  const start = new Date(Date.UTC(year, month - 1, day) - 330 * 60 * 1000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function currentMonthRange(todayKey) {
  const [year, month] = todayKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1) - 330 * 60 * 1000);
  const end = new Date(Date.UTC(year, month, 1) - 330 * 60 * 1000);
  return { start, end };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getGlobalSettings() {
  return WhatsAppReminderSettings.findOne({ key: "global" }).lean();
}

function ownerStatus(owner, globalEnabled) {
  if (owner.loginStatus !== "active") return "Blocked";
  return globalEnabled && owner.whatsappRemindersEnabled ? "Active" : "Disabled";
}

async function ownerCountMaps() {
  const [buildings, tenantCounts] = await Promise.all([
    Building.find().select("owner buildingName").sort({ buildingName: 1 }).lean(),
    Tenant.aggregate([
      { $match: { status: "Active" } },
      { $group: { _id: "$owner", count: { $sum: 1 } } },
    ]),
  ]);
  const buildingMap = new Map();
  for (const building of buildings) {
    const ownerId = String(building.owner);
    if (!buildingMap.has(ownerId)) buildingMap.set(ownerId, []);
    buildingMap.get(ownerId).push({ _id: building._id, buildingName: building.buildingName });
  }
  return {
    buildings: buildingMap,
    tenants: new Map(tenantCounts.map((row) => [String(row._id), row.count])),
  };
}

router.get("/settings", masterAuth, async (req, res) => {
  try {
    const settings = await getGlobalSettings();
    res.json({
      globalEnabled: settings?.globalEnabled === true,
      updatedAt: settings?.updatedAt || null,
    });
  } catch (error) {
    res.status(500).json({ message: "Could not load WhatsApp reminder settings." });
  }
});

router.patch("/settings", masterAuth, async (req, res) => {
  if (typeof req.body.globalEnabled !== "boolean") {
    return res.status(400).json({ message: "globalEnabled must be a boolean." });
  }
  try {
    const settings = await WhatsAppReminderSettings.findOneAndUpdate(
      { key: "global" },
      { $set: { globalEnabled: req.body.globalEnabled, updatedBy: req.user.id } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({
      message: `Global WhatsApp reminders ${settings.globalEnabled ? "enabled" : "disabled"}.`,
      globalEnabled: settings.globalEnabled,
      updatedAt: settings.updatedAt,
    });
  } catch (error) {
    res.status(500).json({ message: "Could not update WhatsApp reminder settings." });
  }
});

router.get("/owners", masterAuth, async (req, res) => {
  try {
    const [settings, owners, counts] = await Promise.all([
      getGlobalSettings(),
      User.find({ role: "user" })
        .select("name owner email ph loginStatus whatsappRemindersEnabled")
        .sort({ createdAt: -1 })
        .lean(),
      ownerCountMaps(),
    ]);
    const globalEnabled = settings?.globalEnabled === true;
    res.json(owners.map((owner) => ({
      _id: owner._id,
      businessName: owner.name,
      ownerName: owner.owner,
      email: owner.email,
      phone: owner.ph,
      loginStatus: owner.loginStatus,
      whatsappRemindersEnabled: owner.whatsappRemindersEnabled === true,
      effectiveStatus: ownerStatus(owner, globalEnabled),
      buildingCount: counts.buildings.get(String(owner._id))?.length || 0,
      properties: counts.buildings.get(String(owner._id)) || [],
      activeTenantCount: counts.tenants.get(String(owner._id)) || 0,
    })));
  } catch (error) {
    res.status(500).json({ message: "Could not load owner reminder settings." });
  }
});

router.patch("/owners/:ownerId", masterAuth, async (req, res) => {
  if (typeof req.body.whatsappRemindersEnabled !== "boolean") {
    return res.status(400).json({ message: "whatsappRemindersEnabled must be a boolean." });
  }
  try {
    const owner = await User.findOneAndUpdate(
      { _id: req.params.ownerId, role: "user" },
      { $set: { whatsappRemindersEnabled: req.body.whatsappRemindersEnabled } },
      { new: true }
    ).select("name owner email ph loginStatus whatsappRemindersEnabled").lean();
    if (!owner) return res.status(404).json({ message: "Owner not found." });
    const settings = await getGlobalSettings();
    res.json({
      message: `WhatsApp reminders ${owner.whatsappRemindersEnabled ? "enabled" : "disabled"} for ${owner.owner || owner.name}.`,
      owner: {
        ...owner,
        effectiveStatus: ownerStatus(owner, settings?.globalEnabled === true),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Could not update owner reminder settings." });
  }
});

router.get("/forecast", masterAuth, async (req, res) => {
  try {
    const todayKey = getCalendarDateKey(new Date(), TIMEZONE);
    const forecast = await forecastRentReminders({
      processingDateKey: addCalendarDays(todayKey, 1),
      timeZone: TIMEZONE,
    });
    res.json(forecast);
  } catch (error) {
    console.error("[WhatsAppReminderAdmin] Forecast failed:", error.message);
    res.status(500).json({ message: "Could not calculate tomorrow's reminder forecast." });
  }
});

router.get("/summary", masterAuth, async (req, res) => {
  try {
    const todayKey = getCalendarDateKey(new Date(), TIMEZONE);
    const today = calendarRange(todayKey);
    const [settings, owners, sentToday, failedToday, duplicateToday, invalidToday, forecast] = await Promise.all([
      getGlobalSettings(),
      User.find({ role: "user" }).select("loginStatus whatsappRemindersEnabled").lean(),
      WhatsAppReminderLog.countDocuments({ status: "SENT", sentAt: { $gte: today.start, $lt: today.end } }),
      WhatsAppReminderLog.countDocuments({ status: "FAILED", updatedAt: { $gte: today.start, $lt: today.end } }),
      WhatsAppReminderLog.aggregate([
        { $match: { duplicateSkipTodayDate: todayKey } },
        { $group: { _id: null, count: { $sum: "$duplicateSkipTodayCount" } } },
      ]),
      WhatsAppReminderLog.countDocuments({
        status: "FAILED",
        "error.code": "INVALID_PHONE_NUMBER",
        createdAt: { $gte: today.start, $lt: today.end },
      }),
      forecastRentReminders({ processingDateKey: addCalendarDays(todayKey, 1), timeZone: TIMEZONE }),
    ]);
    const globalEnabled = settings?.globalEnabled === true;
    res.json({
      globalEnabled,
      ownersOn: owners.filter((owner) => owner.whatsappRemindersEnabled && owner.loginStatus === "active").length,
      ownersOff: owners.filter((owner) => !owner.whatsappRemindersEnabled && owner.loginStatus === "active").length,
      blockedOwners: owners.filter((owner) => owner.loginStatus !== "active").length,
      messagesSentToday: sentToday,
      failedToday,
      duplicatesSkippedToday: duplicateToday[0]?.count || 0,
      invalidPhonesToday: invalidToday,
      scheduledForTomorrow: forecast.totalReminders,
      tenantsScheduledForTomorrow: forecast.totalTenants,
    });
  } catch (error) {
    console.error("[WhatsAppReminderAdmin] Summary failed:", error.message);
    res.status(500).json({ message: "Could not load WhatsApp reminder analytics." });
  }
});

router.get("/owners/analytics", masterAuth, async (req, res) => {
  try {
    const todayKey = getCalendarDateKey(new Date(), TIMEZONE);
    const today = calendarRange(todayKey);
    const month = currentMonthRange(todayKey);
    const [owners, settings, grouped, lastSentRows, failures, forecast] = await Promise.all([
      User.find({ role: "user" }).select("name owner email ph loginStatus whatsappRemindersEnabled").lean(),
      getGlobalSettings(),
      WhatsAppReminderLog.aggregate([
        { $addFields: { eventAt: { $ifNull: ["$sentAt", "$updatedAt"] } } },
        {
          $group: {
            _id: "$owner",
            sentThisMonth: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "SENT"] }, { $gte: ["$sentAt", month.start] }, { $lt: ["$sentAt", month.end] }] }, 1, 0] } },
            sentToday: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "SENT"] }, { $gte: ["$sentAt", today.start] }, { $lt: ["$sentAt", today.end] }] }, 1, 0] } },
            failedThisMonth: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "FAILED"] }, { $gte: ["$updatedAt", month.start] }, { $lt: ["$updatedAt", month.end] }] }, 1, 0] } },
            failedToday: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "FAILED"] }, { $gte: ["$updatedAt", today.start] }, { $lt: ["$updatedAt", today.end] }] }, 1, 0] } },
            duplicateSkipped: { $sum: { $ifNull: ["$duplicateSkipCount", 0] } },
            invalidPhones: { $sum: { $cond: [{ $eq: ["$error.code", "INVALID_PHONE_NUMBER"] }, 1, 0] } },
          },
        },
      ]),
      WhatsAppReminderLog.aggregate([
        { $match: { status: "SENT" } },
        { $sort: { sentAt: -1 } },
        { $group: { _id: "$owner", log: { $first: "$$ROOT" } } },
      ]),
      WhatsAppReminderLog.aggregate([
        { $match: { status: "FAILED" } },
        { $sort: { updatedAt: -1 } },
        { $group: { _id: "$owner", error: { $first: "$error" } } },
      ]),
      forecastRentReminders({ processingDateKey: addCalendarDays(todayKey, 1), timeZone: TIMEZONE }),
    ]);

    const groupedByOwner = new Map(grouped.map((row) => [String(row._id), row]));
    const lastSentByOwner = new Map(lastSentRows.map((row) => [String(row._id), row.log]));
    const failureByOwner = new Map(failures.map((row) => [String(row._id), row.error]));
    const forecastByOwner = new Map(forecast.byOwner.map((row) => [String(row.ownerId), row]));
    const lastLogs = lastSentRows.map((row) => row.log).filter(Boolean);
    const tenantIds = [...new Set(lastLogs.filter((log) => log.tenant).map((log) => String(log.tenant)))];
    const tenants = tenantIds.length
      ? await Tenant.find({ _id: { $in: tenantIds } }).select("name phone buildingId allocationInfo.buildingName").lean()
      : [];
    const tenantById = new Map(tenants.map((tenant) => [String(tenant._id), tenant]));
    const buildingIds = [...new Set(tenants.filter((tenant) => tenant.buildingId).map((tenant) => String(tenant.buildingId)))];
    const buildings = buildingIds.length
      ? await Building.find({ _id: { $in: buildingIds } }).select("buildingName").lean()
      : [];
    const buildingById = new Map(buildings.map((building) => [String(building._id), building]));
    const globalEnabled = settings?.globalEnabled === true;

    res.json(owners.map((owner) => {
      const analytics = groupedByOwner.get(String(owner._id));
      const lastLog = lastSentByOwner.get(String(owner._id));
      const tenant = lastLog?.tenant ? tenantById.get(String(lastLog.tenant)) : null;
      const building = tenant?.buildingId ? buildingById.get(String(tenant.buildingId)) : null;
      return {
        ownerId: owner._id,
        businessName: owner.name,
        ownerName: owner.owner,
        effectiveStatus: ownerStatus(owner, globalEnabled),
        lastReminderAt: lastLog?.sentAt || null,
        lastRecipientTenantName: tenant?.name || null,
        lastRecipientPhone: lastLog?.recipientPhone || tenant?.phone || null,
        lastPropertyName: building?.buildingName || tenant?.allocationInfo?.buildingName || null,
        sentThisMonth: analytics?.sentThisMonth || 0,
        sentToday: analytics?.sentToday || 0,
        failedThisMonth: analytics?.failedThisMonth || 0,
        failedToday: analytics?.failedToday || 0,
        duplicateSkipped: analytics?.duplicateSkipped || 0,
        invalidPhones: analytics?.invalidPhones || 0,
        scheduledTomorrow: forecastByOwner.get(String(owner._id))?.reminderCount || 0,
        lastFailureReason: failureByOwner.get(String(owner._id))?.message || null,
      };
    }));
  } catch (error) {
    console.error("[WhatsAppReminderAdmin] Owner analytics failed:", error.message);
    res.status(500).json({ message: "Could not load owner-wise WhatsApp analytics." });
  }
});

function historyDateMatch(query) {
  const todayKey = getCalendarDateKey(new Date(), TIMEZONE);
  let from = query.from;
  let to = query.to;
  if (query.date) from = to = query.date;
  if (query.preset === "today") from = to = todayKey;
  if (query.preset === "month") {
    from = `${todayKey.slice(0, 7)}-01`;
    to = todayKey;
  }
  const start = from ? calendarRange(from)?.start : null;
  const end = to ? calendarRange(to)?.end : null;
  if (!start && !end) return null;
  return { ...(start ? { $gte: start } : {}), ...(end ? { $lt: end } : {}) };
}

router.get("/history", masterAuth, async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const baseMatch = {};
    if (req.query.ownerId && mongoose.Types.ObjectId.isValid(req.query.ownerId)) {
      baseMatch.owner = new mongoose.Types.ObjectId(req.query.ownerId);
    }
    if (req.query.reminderType) baseMatch.reminderType = req.query.reminderType;
    if (req.query.status === "SKIPPED") baseMatch.duplicateSkipCount = { $gt: 0 };
    else if (req.query.status) baseMatch.status = req.query.status;

    const eventAtMatch = historyDateMatch(req.query);
    const tenantSearch = String(req.query.search || "").trim();
    const escapedTenantSearch = escapeRegex(tenantSearch);
    const phoneSearch = tenantSearch.replace(/[^0-9+]/g, "");
    const propertyId = String(req.query.propertyId || "").trim();
    const pipeline = [
      { $match: baseMatch },
      {
        $addFields: {
          eventAt: req.query.status === "SKIPPED"
            ? { $ifNull: ["$lastDuplicateSkippedAt", "$createdAt"] }
            : { $ifNull: ["$sentAt", "$createdAt"] },
        },
      },
      ...(eventAtMatch ? [{ $match: { eventAt: eventAtMatch } }] : []),
      { $lookup: { from: "users", localField: "owner", foreignField: "_id", as: "ownerDoc" } },
      { $unwind: { path: "$ownerDoc", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "tenants", localField: "tenant", foreignField: "_id", as: "tenantDoc" } },
      { $unwind: { path: "$tenantDoc", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "buildings", localField: "tenantDoc.buildingId", foreignField: "_id", as: "buildingDoc" } },
      { $unwind: { path: "$buildingDoc", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "rentpayments", localField: "rentPayment", foreignField: "_id", as: "rentDoc" } },
      { $unwind: { path: "$rentDoc", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          monthlyRecord: {
            $arrayElemAt: [{
              $filter: {
                input: { $ifNull: ["$rentDoc.monthlyPayments", []] },
                as: "payment",
                cond: { $eq: ["$$payment._id", "$monthlyPayment"] },
              },
            }, 0],
          },
          propertyName: { $ifNull: ["$buildingDoc.buildingName", "$tenantDoc.allocationInfo.buildingName"] },
        },
      },
      ...(propertyId && mongoose.Types.ObjectId.isValid(propertyId)
        ? [{ $match: { "buildingDoc._id": new mongoose.Types.ObjectId(propertyId) } }]
        : []),
      ...(tenantSearch ? [{
        $match: {
          $or: [
            { "tenantDoc.name": { $regex: escapedTenantSearch, $options: "i" } },
            ...(phoneSearch ? [{ recipientPhone: { $regex: phoneSearch, $options: "i" } }] : []),
          ],
        },
      }] : []),
      {
        $facet: {
          rows: [
            { $sort: { eventAt: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                eventAt: 1,
                ownerId: "$owner",
                ownerName: { $ifNull: ["$ownerDoc.owner", "$ownerDoc.name"] },
                businessName: "$ownerDoc.name",
                propertyName: 1,
                tenantId: "$tenant",
                tenantName: "$tenantDoc.name",
                tenantPhone: "$recipientPhone",
                rentMonth: "$monthlyRecord.monthYear",
                reminderType: 1,
                dueDate: 1,
                metaMessageId: 1,
                status: 1,
                errorReason: "$error.message",
                duplicateSkipCount: { $ifNull: ["$duplicateSkipCount", 0] },
              },
            },
          ],
          totals: [{
            $group: {
              _id: null,
              totalRecords: { $sum: 1 },
              sent: { $sum: { $cond: [{ $eq: ["$status", "SENT"] }, 1, 0] } },
              failed: { $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] } },
              skipped: { $sum: { $ifNull: ["$duplicateSkipCount", 0] } },
            },
          }],
        },
      },
    ];
    const [result] = await WhatsAppReminderLog.aggregate(pipeline);
    const totals = result?.totals?.[0] || { totalRecords: 0, sent: 0, failed: 0, skipped: 0 };
    const month = currentMonthRange(getCalendarDateKey(new Date(), TIMEZONE));
    const tenantIds = [...new Set((result?.rows || []).filter((row) => row.tenantId).map((row) => String(row.tenantId)))];
    const tenantMonthlyCounts = tenantIds.length
      ? await WhatsAppReminderLog.aggregate([
          {
            $match: {
              tenant: { $in: tenantIds.map((id) => new mongoose.Types.ObjectId(id)) },
              status: "SENT",
              sentAt: { $gte: month.start, $lt: month.end },
            },
          },
          { $group: { _id: "$tenant", count: { $sum: 1 } } },
        ])
      : [];
    const tenantCountMap = new Map(tenantMonthlyCounts.map((row) => [String(row._id), row.count]));
    const rows = (result?.rows || []).map((row) => ({
      ...row,
      tenantMessageCountCurrentMonth: tenantCountMap.get(String(row.tenantId)) || 0,
    }));
    res.json({
      data: rows,
      totals,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(totals.totalRecords / limit)),
    });
  } catch (error) {
    console.error("[WhatsAppReminderAdmin] History failed:", error.message);
    res.status(500).json({ message: "Could not load WhatsApp reminder history." });
  }
});

export default router;
