import crypto from "crypto";
import Tenant from "../models/Tenant.js";

export const SECURE_TENANT_ID_RE = /^[a-f0-9]{32}$/;

export function createTenantSecureId() {
  return crypto.randomBytes(16).toString("hex");
}

export async function ensureTenantSecureId(tenant) {
  if (tenant?.secureId) return tenant.secureId;

  for (let attempt = 0; attempt < 5; attempt++) {
    const secureId = createTenantSecureId();
    try {
      const result = await Tenant.updateOne(
        { _id: tenant._id, $or: [{ secureId: { $exists: false } }, { secureId: null }, { secureId: "" }] },
        { $set: { secureId } }
      );
      if (result.modifiedCount || result.upsertedCount) return secureId;

      const existing = await Tenant.findById(tenant._id).select("+secureId").lean();
      if (existing?.secureId) return existing.secureId;
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }

  throw new Error("Unable to generate tenant secure link.");
}

export async function backfillTenantSecureIds() {
  const tenants = await Tenant.find({
    $or: [{ secureId: { $exists: false } }, { secureId: null }, { secureId: "" }],
  }).select("+secureId").lean();

  for (const tenant of tenants) {
    await ensureTenantSecureId(tenant);
  }

  if (tenants.length) {
    console.log(`[TenantSecureId] Generated secure IDs for ${tenants.length} existing tenant(s).`);
  }
}
