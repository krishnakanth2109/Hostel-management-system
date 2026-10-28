import test from "node:test";
import assert from "node:assert/strict";
import {
  generateEligibleRentDues,
  generateFirstRentDueWithCatchUpFallback,
} from "../services/rentDueGeneration.js";

test("due generation records a period failure and continues with later periods and tenants", async () => {
  const tenants = [
    { _id: "tenant-1", joiningDate: "2025-01-31", rentAmount: 5000 },
    { _id: "tenant-2", joiningDate: "2025-01-31", rentAmount: 6000 },
  ];
  const calls = [];
  const errors = [];

  const result = await generateEligibleRentDues(
    new Date("2025-02-22T18:30:00.000Z"),
    {
      tenantModel: { find: async () => tenants },
      ensureDue: async (tenant, cycle) => {
        calls.push(`${tenant._id}:${cycle.monthYear}`);
        if (tenant._id === "tenant-1" && cycle.monthYear === "2025-02") {
          throw new Error("simulated write failure");
        }
        return { generated: true };
      },
      logger: { error: (message) => errors.push(message) },
    }
  );

  assert.deepEqual(calls, [
    "tenant-1:2025-01",
    "tenant-1:2025-02",
    "tenant-2:2025-01",
    "tenant-2:2025-02",
  ]);
  assert.equal(result.tenantCount, 2);
  assert.equal(result.generatedCount, 3);
  assert.equal(result.failureCount, 1);
  assert.deepEqual(result.failures, [{
    tenantId: "tenant-1",
    monthYear: "2025-02",
    error: "simulated write failure",
  }]);
  assert.match(errors[0], /tenant-1, period 2025-02/);
});

test("an immediate first-due failure is logged and deferred to scheduler catch-up", async () => {
  const errors = [];
  const result = await generateFirstRentDueWithCatchUpFallback(
    { _id: "tenant-1" },
    {
      generateDue: async () => { throw new Error("temporary database failure"); },
      logger: { error: (message) => errors.push(message) },
    }
  );

  assert.deepEqual(result, {
    generated: false,
    deferredToCatchUp: true,
    error: "temporary database failure",
  });
  assert.match(errors[0], /tenant tenant-1/);
  assert.match(errors[0], /Scheduler catch-up will retry/);
});
