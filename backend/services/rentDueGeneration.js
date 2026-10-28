import crypto from "crypto";
import cron from "node-cron";
import mongoose from "mongoose";
import RentPayment from "../models/Rentpayment.js";
import Tenant from "../models/Tenant.js";

export const RENT_DUE_TIME_ZONE = "Asia/Kolkata";
export const RENT_DUE_ADVANCE_DAYS = 5;

function datePartsInTimeZone(date, timeZone = RENT_DUE_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, Number(value)]));
}

function joiningDateParts(joiningDate) {
  if (typeof joiningDate === "string") {
    const match = joiningDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
  }

  const date = new Date(joiningDate);
  if (Number.isNaN(date.getTime())) return null;
  // Mongoose stores date-only form values as UTC midnight. UTC accessors preserve
  // the calendar date selected by the owner regardless of the server timezone.
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}

export function getDueDateForCycle(joiningDate, year, month) {
  const join = joiningDateParts(joiningDate);
  if (!join) return new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(join.day, lastDay)));
}

export function getMonthYearKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function getRentAmountForDue(tenant, rentAmount) {
  const amount = Number(rentAmount == null ? tenant.rentAmount || 0 : rentAmount);
  return Number.isFinite(amount) ? amount : 0;
}

export function getFirstRentCycle(joiningDate) {
  const join = joiningDateParts(joiningDate);
  if (!join) return null;
  return {
    year: join.year,
    month: join.month,
    monthYear: getMonthYearKey(join.year, join.month),
    dueDate: getDueDateForCycle(joiningDate, join.year, join.month),
  };
}

export function getEligibleRentCycles(joiningDate, now = new Date(), advanceDays = RENT_DUE_ADVANCE_DAYS) {
  const join = joiningDateParts(joiningDate);
  if (!join) return [];

  const today = datePartsInTimeZone(now);
  const threshold = new Date(Date.UTC(today.year, today.month - 1, today.day + advanceDays));
  const thresholdIndex = threshold.getUTCFullYear() * 12 + threshold.getUTCMonth();
  const cycles = [];
  let year = join.year;
  let month = join.month;

  while (year * 12 + month <= thresholdIndex && cycles.length < 1200) {
    const dueDate = getDueDateForCycle(joiningDate, year, month);
    if (dueDate.getTime() <= threshold.getTime()) {
      cycles.push({ year, month, monthYear: getMonthYearKey(year, month), dueDate });
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return cycles;
}

export async function getOrCreateTenantRentDoc(tenant, ownerId = tenant.owner) {
  try {
    await RentPayment.updateOne(
      { tenantId: tenant._id },
      { $setOnInsert: { owner: ownerId, tenantId: tenant._id, monthlyPayments: [] } },
      { upsert: true }
    );
  } catch (error) {
    // A concurrent process may win the unique tenantId upsert. In that case the
    // desired ledger already exists and is safe to use.
    if (error?.code !== 11000) throw error;
  }
  return RentPayment.findOne({ tenantId: tenant._id });
}

export async function ensureMonthlyRentDue(tenant, { year, month, monthYear, dueDate, rentAmount }, ownerId = tenant.owner) {
  const key = monthYear || getMonthYearKey(year, month);
  const cycleDueDate = dueDate || getDueDateForCycle(tenant.joiningDate, year, month);
  const cycleRentAmount = getRentAmountForDue(tenant, rentAmount);
  await getOrCreateTenantRentDoc(tenant, ownerId);

  const generatedDueAt = new Date();
  const result = await RentPayment.updateOne(
    {
      tenantId: tenant._id,
      monthlyPayments: { $not: { $elemMatch: { monthYear: key } } },
    },
    {
      $push: {
        monthlyPayments: {
          monthYear: key,
          dueDate: cycleDueDate,
          generatedDueAt,
          rentAmount: cycleRentAmount,
          paidAmount: 0,
          status: "Due",
          payments: [],
        },
      },
    }
  );

  const rentDoc = await RentPayment.findOne({ tenantId: tenant._id });
  return {
    generated: result.modifiedCount === 1,
    generatedDueAt: result.modifiedCount === 1 ? generatedDueAt : null,
    rentDoc,
    record: rentDoc?.monthlyPayments?.find((payment) => payment.monthYear === key) || null,
  };
}

export async function generateFirstRentDue(tenant) {
  const firstCycle = getFirstRentCycle(tenant.joiningDate);
  if (!firstCycle) throw new Error("Tenant has an invalid joining date.");
  return ensureMonthlyRentDue(tenant, firstCycle);
}

export async function generateFirstRentDueWithCatchUpFallback(
  tenant,
  { generateDue = generateFirstRentDue, logger = console } = {}
) {
  try {
    return await generateDue(tenant);
  } catch (error) {
    logger.error(
      `[RentDueGeneration] Immediate first due failed for tenant ${tenant._id}: ${error?.message || String(error)}. Scheduler catch-up will retry.`
    );
    return {
      generated: false,
      deferredToCatchUp: true,
      error: error?.message || String(error),
    };
  }
}

export async function generateEligibleRentDues(
  now = new Date(),
  { tenantModel = Tenant, ensureDue = ensureMonthlyRentDue, logger = console } = {}
) {
  const tenants = await tenantModel.find({ status: "Active", joiningDate: { $lte: now } });
  let generatedCount = 0;
  const failures = [];

  for (const tenant of tenants) {
    const cycles = getEligibleRentCycles(tenant.joiningDate, now);
    for (const cycle of cycles) {
      try {
        const result = await ensureDue(tenant, cycle);
        if (result.generated) generatedCount += 1;
      } catch (error) {
        const failure = {
          tenantId: String(tenant._id),
          monthYear: cycle.monthYear,
          error: error?.message || String(error),
        };
        failures.push(failure);
        logger.error(
          `[RentDueScheduler] Failed tenant ${failure.tenantId}, period ${failure.monthYear}: ${failure.error}`
        );
      }
    }
  }
  return {
    tenantCount: tenants.length,
    generatedCount,
    failureCount: failures.length,
    failures,
  };
}

const LOCK_ID = "rent-due-generation-daily";
const LOCK_LEASE_MS = 30 * 60 * 1000;
let schedulerRunning = false;

async function acquireSchedulerLock(ownerToken, now) {
  try {
    const result = await mongoose.connection.collection("schedulerlocks").findOneAndUpdate(
      {
        _id: LOCK_ID,
        $or: [{ lockedUntil: { $lte: now } }, { lockedUntil: { $exists: false } }],
      },
      {
        $set: { ownerToken, lockedUntil: new Date(now.getTime() + LOCK_LEASE_MS), acquiredAt: now },
      },
      { upsert: true, returnDocument: "after" }
    );
    const lock = result?.value || result;
    return lock?.ownerToken === ownerToken;
  } catch (error) {
    if (error?.code === 11000) return false;
    throw error;
  }
}

async function runScheduledRentDueGeneration() {
  if (schedulerRunning) return { skipped: true, reason: "in-process-overlap" };
  schedulerRunning = true;
  const ownerToken = crypto.randomUUID();
  const startedAt = new Date();
  let lockHeartbeat = null;

  try {
    if (!(await acquireSchedulerLock(ownerToken, startedAt))) {
      return { skipped: true, reason: "another-instance-running" };
    }
    lockHeartbeat = setInterval(() => {
      const heartbeatAt = new Date();
      mongoose.connection.collection("schedulerlocks").updateOne(
        { _id: LOCK_ID, ownerToken },
        { $set: { lockedUntil: new Date(heartbeatAt.getTime() + LOCK_LEASE_MS), heartbeatAt } }
      ).catch((error) => console.error("[RentDueScheduler] Lock heartbeat failed:", error.message));
    }, 60 * 1000);
    lockHeartbeat.unref?.();
    const result = await generateEligibleRentDues(startedAt);
    console.log(
      `[RentDueScheduler] Checked ${result.tenantCount} tenants; generated ${result.generatedCount} dues; ${result.failureCount} failures.`
    );
    return result;
  } catch (error) {
    console.error("[RentDueScheduler] Generation failed:", error.message);
    throw error;
  } finally {
    if (lockHeartbeat) clearInterval(lockHeartbeat);
    schedulerRunning = false;
    await mongoose.connection.collection("schedulerlocks").updateOne(
      { _id: LOCK_ID, ownerToken },
      { $set: { lockedUntil: new Date(), releasedAt: new Date() } }
    ).catch((error) => console.error("[RentDueScheduler] Lock release failed:", error.message));
  }
}

export function initializeRentDueScheduler() {
  cron.schedule("0 0 * * *", () => {
    runScheduledRentDueGeneration().catch(() => {});
  }, { timezone: RENT_DUE_TIME_ZONE });

  // Startup catch-up makes eligible periods recover after downtime rather than
  // waiting for the next midnight run.
  runScheduledRentDueGeneration().catch(() => {});
  console.log("[RentDueScheduler] Scheduled daily at 12:00 AM Asia/Kolkata.");
}
