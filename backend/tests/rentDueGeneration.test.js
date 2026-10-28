import test from "node:test";
import assert from "node:assert/strict";
import {
  getDueDateForCycle,
  getEligibleRentCycles,
  getFirstRentCycle,
  getRentAmountForDue,
} from "../services/rentDueGeneration.js";

const isoDay = (date) => date.toISOString().slice(0, 10);

test("the first cycle is the joining period and is available immediately", () => {
  const cycle = getFirstRentCycle("2025-01-31");
  assert.equal(cycle.monthYear, "2025-01");
  assert.equal(isoDay(cycle.dueDate), "2025-01-31");
});

test("a supplied payment-request rent snapshot overrides the tenant's current rent", () => {
  const tenant = { rentAmount: 6000 };
  assert.equal(getRentAmountForDue(tenant), 6000);
  assert.equal(getRentAmountForDue(tenant, 5000), 5000);
});

test("January 31 cycle returns to the original day after February", () => {
  const joiningDate = new Date("2025-01-31T00:00:00.000Z");
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((month) => isoDay(getDueDateForCycle(joiningDate, 2025, month))),
    ["2025-01-31", "2025-02-28", "2025-03-31", "2025-04-30", "2025-05-31"]
  );
});

test("January 31 uses February 29 in a leap year", () => {
  assert.equal(isoDay(getDueDateForCycle("2024-01-31", 2024, 1)), "2024-02-29");
});

test("February 29 preserves a 29th cycle day", () => {
  const joiningDate = "2024-02-29";
  assert.deepEqual(
    [2, 3, 4].map((month) => isoDay(getDueDateForCycle(joiningDate, 2024, month))),
    ["2024-03-29", "2024-04-29", "2024-05-29"]
  );
});

test("the 30th falls back only in shorter months", () => {
  const joiningDate = "2025-01-30";
  assert.deepEqual(
    [0, 1, 2, 3].map((month) => isoDay(getDueDateForCycle(joiningDate, 2025, month))),
    ["2025-01-30", "2025-02-28", "2025-03-30", "2025-04-30"]
  );
});

test("a subsequent due becomes eligible exactly five IST calendar days early", () => {
  const beforeWindow = getEligibleRentCycles(
    "2025-01-31",
    new Date("2025-02-22T18:29:59.999Z") // Feb 22, 11:59:59.999 PM IST
  );
  const atWindow = getEligibleRentCycles(
    "2025-01-31",
    new Date("2025-02-22T18:30:00.000Z") // Feb 23, 12:00 AM IST
  );

  assert.deepEqual(beforeWindow.map(({ monthYear }) => monthYear), ["2025-01"]);
  assert.deepEqual(atWindow.map(({ monthYear }) => monthYear), ["2025-01", "2025-02"]);
});

test("catch-up includes missed cycles but never cycles beyond the five-day window", () => {
  const cycles = getEligibleRentCycles("2025-01-31", new Date("2025-04-25T18:30:00.000Z"));
  assert.deepEqual(cycles.map(({ monthYear }) => monthYear), [
    "2025-01",
    "2025-02",
    "2025-03",
    "2025-04",
  ]);
});
