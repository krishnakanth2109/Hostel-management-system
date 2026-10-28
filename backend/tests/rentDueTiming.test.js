import test from "node:test";
import assert from "node:assert/strict";
import { getRentDueTiming, splitRentDueAmounts } from "../utils/rentDueTiming.js";

test("future rent is separated from currently due totals without changing its balance", () => {
  const timing = getRentDueTiming(
    "2025-02-28T00:00:00.000Z",
    new Date("2025-02-22T18:30:00.000Z") // Feb 23, 12:00 AM IST
  );
  const amounts = splitRentDueAmounts({
    currentRemaining: 5000,
    arrearsTotal: 1000,
    advancePending: 500,
    isUpcoming: timing.isUpcoming,
  });

  assert.equal(timing.isUpcoming, true);
  assert.equal(amounts.upcomingAmount, 5000);
  assert.equal(amounts.totalAccumulatedDue, 1500);
});

test("due timing changes at IST midnight, not at UTC midnight", () => {
  const dueDate = "2025-02-28T00:00:00.000Z";
  const beforeDueDay = getRentDueTiming(dueDate, new Date("2025-02-27T18:29:59.999Z"));
  const startOfDueDay = getRentDueTiming(dueDate, new Date("2025-02-27T18:30:00.000Z"));
  const afterDueDay = getRentDueTiming(dueDate, new Date("2025-02-28T18:30:00.000Z"));

  assert.deepEqual(beforeDueDay, {
    isUpcoming: true,
    isDueToday: false,
    isOverdue: false,
    daysUntilDue: 1,
    daysOverdue: null,
  });
  assert.deepEqual(startOfDueDay, {
    isUpcoming: false,
    isDueToday: true,
    isOverdue: false,
    daysUntilDue: 0,
    daysOverdue: null,
  });
  assert.deepEqual(afterDueDay, {
    isUpcoming: false,
    isDueToday: false,
    isOverdue: true,
    daysUntilDue: null,
    daysOverdue: 1,
  });
});

test("rent due on its IST calendar day is included in currently due totals", () => {
  const timing = getRentDueTiming(
    "2025-02-28T00:00:00.000Z",
    new Date("2025-02-27T18:30:00.000Z")
  );
  const amounts = splitRentDueAmounts({ currentRemaining: 5000, isUpcoming: timing.isUpcoming });

  assert.equal(amounts.upcomingAmount, 0);
  assert.equal(amounts.totalAccumulatedDue, 5000);
});
