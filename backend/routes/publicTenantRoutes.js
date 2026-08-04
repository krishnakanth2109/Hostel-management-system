import express from "express";
import Tenant from "../models/Tenant.js";
import RentPayment from "../models/Rentpayment.js";
import PaymentRequest from "../models/PaymentRequest.js";
import { SECURE_TENANT_ID_RE } from "../utils/tenantSecureId.js";

const router = express.Router();

function getCycleForDate(joiningDate, date = new Date()) {
  const join = new Date(joiningDate);
  if (Number.isNaN(join.getTime())) return null;

  let year = date.getFullYear();
  let month = date.getMonth();
  const joinDay = join.getDate();
  const cycleStartFor = (y, m) => {
    const lastDay = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(joinDay, lastDay));
  };

  let dueDate = cycleStartFor(year, month);
  if (dueDate > date) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
    dueDate = cycleStartFor(year, month);
  }

  return {
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
    dueDate,
  };
}

function getAllCyclesSinceJoining(joiningDate, now = new Date()) {
  const join = new Date(joiningDate);
  if (Number.isNaN(join.getTime())) return [];
  const joinDay = join.getDate();
  const cycles = [];

  let year = join.getFullYear();
  let month = join.getMonth();
  let guard = 0;
  while (guard < 1200) {
    guard++;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const dueDate = new Date(year, month, Math.min(joinDay, lastDay));
    if (dueDate > now) break;
    cycles.push({
      monthYear: `${year}-${String(month + 1).padStart(2, "0")}`,
      dueDate,
    });
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
  }

  return cycles;
}

function getRemainingAmount(record) {
  return Math.max(0, Number(record?.rentAmount || 0) - Number(record?.paidAmount || 0));
}

function getRentStatus(record, pendingAmount) {
  if (record?.status) return record.status;
  if (pendingAmount <= 0) return "Paid";
  if (Number(record?.paidAmount || 0) > 0) return "Partial";
  return "Due";
}

function toPaymentHistory(rentDoc) {
  if (!rentDoc?.monthlyPayments?.length) return [];

  return rentDoc.monthlyPayments
    .flatMap((month) => (month.payments || []).map((payment) => ({
      monthYear: month.monthYear,
      amount: Number(payment.amount || 0),
      paidAt: payment.paidAt,
      note: payment.note || "",
    })))
    .sort((a, b) => new Date(b.paidAt || 0) - new Date(a.paidAt || 0));
}

function toPendingPayments(tenant, rentDoc, pendingRequests) {
  const requestByMonth = new Map(
    pendingRequests.map((request) => [request.monthYear, {
      id: request._id,
      amount: request.requestAmount,
      status: request.status,
    }])
  );

  return getAllCyclesSinceJoining(tenant.joiningDate)
    .map(({ monthYear, dueDate }) => {
      const saved = rentDoc?.monthlyPayments?.find((payment) => payment.monthYear === monthYear);
      const rentAmount = Number(saved?.rentAmount ?? tenant.rentAmount ?? 0);
      const paidAmount = Number(saved?.paidAmount || 0);
      const pendingAmount = Math.max(0, rentAmount - paidAmount);
      return {
        monthYear,
        monthLabel: dueDate.toLocaleString("en-IN", { month: "long", year: "numeric" }),
        dueDate: saved?.dueDate || dueDate,
        rentAmount,
        paidAmount,
        pendingAmount,
        status: saved?.status || (pendingAmount <= 0 ? "Paid" : paidAmount > 0 ? "Partial" : "Due"),
        pendingRequest: requestByMonth.get(monthYear) || null,
      };
    })
    .filter((payment) => payment.pendingAmount > 0)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
}

router.get("/tenant/:secureId", async (req, res) => {
  try {
    const secureId = String(req.params.secureId || "").trim().toLowerCase();
    if (!SECURE_TENANT_ID_RE.test(secureId)) {
      return res.status(404).json({ message: "Invalid or expired link." });
    }

    const tenant = await Tenant.findOne({ secureId, status: "Active" })
      .select("+secureId name phone email fatherName rentAmount advanceAmount paidadvanceAmount joiningDate allocationInfo documents")
      .lean();

    if (!tenant) {
      return res.status(404).json({ message: "Invalid or expired link." });
    }

    const rentDoc = await RentPayment.findOne({ tenantId: tenant._id })
      .select("monthlyPayments")
      .lean();
    const pendingRequests = await PaymentRequest.find({ tenantId: tenant._id, status: "Pending" })
      .select("monthYear requestAmount status")
      .lean();

    const currentCycle = getCycleForDate(tenant.joiningDate);
    const currentRecord = currentCycle
      ? rentDoc?.monthlyPayments?.find((payment) => payment.monthYear === currentCycle.key)
      : null;
    const monthlyRent = Number(currentRecord?.rentAmount ?? tenant.rentAmount ?? 0);
    const paidAmount = Number(currentRecord?.paidAmount || 0);
    const pendingAmount = Math.max(0, monthlyRent - paidAmount);
    const dueDate = currentRecord?.dueDate || currentCycle?.dueDate || tenant.joiningDate;

    res.json({
      tenant: {
        name: tenant.name,
        profile: tenant.documents?.passportPhoto || null,
        phone: tenant.phone,
        email: tenant.email || "",
        fatherName: tenant.fatherName || "",
        building: tenant.allocationInfo?.buildingName || "",
        floor: tenant.allocationInfo?.floorNumber ?? "",
        room: tenant.allocationInfo?.roomNumber || "",
        bed: tenant.allocationInfo?.bedNumber ?? "",
        monthlyRent,
        dueAmount: monthlyRent,
        paidAmount,
        pendingAmount,
        dueDate,
        rentStatus: getRentStatus(currentRecord, pendingAmount),
        joiningDate: tenant.joiningDate,
        pendingPayments: toPendingPayments(tenant, rentDoc, pendingRequests),
        paymentHistory: toPaymentHistory(rentDoc),
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error." });
  }
});

export default router;
