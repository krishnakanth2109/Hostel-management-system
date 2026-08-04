import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, CalendarDays, Mail, Phone, UserRound, X } from "lucide-react";
import { API } from "../api.js";

const money = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
    .format(Number(value || 0));

const dateText = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

function LoadingState() {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-6xl animate-pulse">
        <div className="h-36 rounded-lg bg-slate-200" />
        <div className="mt-6 h-64 rounded-lg bg-slate-200" />
      </div>
    </div>
  );
}

function InvalidState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <AlertCircle size={24} />
        </div>
        <h1 className="mt-5 text-2xl font-black text-slate-950">Invalid or Expired Link</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This rent details link could not be verified. Please contact your hostel management for a fresh link.
        </p>
      </div>
    </div>
  );
}

function DetailBox({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-black uppercase text-slate-400">{label}</div>
      <div className="mt-2 break-words text-base font-black text-slate-950">{value || "-"}</div>
    </div>
  );
}

function PaymentRequestModal({ tenant, payment, secureId, onClose, onSubmitted }) {
  const [amount, setAmount] = useState(payment.pendingAmount);
  const [mode, setMode] = useState("online");
  const [receipt, setReceipt] = useState(null);
  const [cashGivenAt, setCashGivenAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    const requestAmount = Number(amount || 0);
    if (!Number.isFinite(requestAmount) || requestAmount <= 0) {
      setError("Enter a valid request amount.");
      return;
    }
    if (requestAmount > payment.pendingAmount) {
      setError("Request amount cannot exceed pending amount.");
      return;
    }
    if (mode === "online" && !receipt) {
      setError("Please attach the receipt for online payment.");
      return;
    }
    if (mode === "cash" && !cashGivenAt) {
      setError("Please select cash handover date and time.");
      return;
    }

    const body = new FormData();
    body.append("monthYear", payment.monthYear);
    body.append("requestAmount", String(requestAmount));
    body.append("paymentMode", mode);
    if (mode === "online") body.append("receipt", receipt);
    if (mode === "cash") body.append("cashGivenAt", cashGivenAt);

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/payment-requests/public/tenant/${secureId}/payment-request`, {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to submit payment request.");
      onSubmitted(data.message);
    } catch (err) {
      setError(err.message || "Failed to submit payment request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/65 px-0 pt-10 sm:items-center sm:px-4 sm:py-10">
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[28px] bg-white p-6 shadow-2xl sm:rounded-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-black uppercase text-indigo-600">Payment Request</div>
            <h2 className="mt-1 text-2xl font-black text-slate-950">{payment.monthLabel}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {tenant.name} can request full or partial payment approval.
            </p>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <DetailBox label="Rent" value={money(payment.rentAmount)} />
          <DetailBox label="Paid" value={money(payment.paidAmount)} />
          <DetailBox label="Due" value={money(payment.pendingAmount)} />
        </div>

        <label className="mt-6 block text-xs font-black uppercase text-slate-500">Request Amount</label>
        <input
          type="number"
          min="1"
          max={payment.pendingAmount}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-4 text-xl font-black outline-none focus:border-indigo-500"
        />

        <div className="mt-5 text-xs font-black uppercase text-slate-500">Payment Mode</div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMode("online")}
            className={`rounded-lg border px-4 py-3 font-black ${mode === "online" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600"}`}
          >
            Online
          </button>
          <button
            type="button"
            onClick={() => setMode("cash")}
            className={`rounded-lg border px-4 py-3 font-black ${mode === "cash" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600"}`}
          >
            Cash
          </button>
        </div>

        {mode === "online" ? (
          <>
            <label className="mt-5 block text-xs font-black uppercase text-slate-500">Receipt Image/PDF</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setReceipt(e.target.files?.[0] || null)}
              className="mt-2 w-full rounded-lg border border-dashed border-slate-300 px-4 py-4 text-sm"
            />
          </>
        ) : (
          <>
            <label className="mt-5 block text-xs font-black uppercase text-slate-500">Cash Given Date & Time</label>
            <input
              type="datetime-local"
              value={cashGivenAt}
              onChange={(e) => setCashGivenAt(e.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-indigo-500"
            />
          </>
        )}

        {error && <div className="mt-4 rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>}

        <button
          onClick={submit}
          disabled={submitting}
          className="mt-5 w-full rounded-lg bg-indigo-600 px-4 py-4 text-base font-black text-white shadow-lg shadow-indigo-600/20 disabled:opacity-60"
        >
          {submitting ? "Submitting..." : "Submit Request"}
        </button>
      </div>
    </div>
  );
}

export default function PublicTenantRentDetails() {
  const { secureId } = useParams();
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [success, setSuccess] = useState("");

  const loadTenant = async (signal) => {
    setLoading(true);
    setNotFound(false);
    try {
      const res = await fetch(`${API}/public/tenant/${secureId}`, { signal });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error("Unable to load tenant rent details.");
      const data = await res.json();
      setTenant(data.tenant);
    } catch (err) {
      if (err.name !== "AbortError") setNotFound(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    if (secureId) loadTenant(controller.signal);
    else {
      setNotFound(true);
      setLoading(false);
    }
    return () => controller.abort();
  }, [secureId]);

  const pendingPayments = tenant?.pendingPayments || [];
  const totalDue = useMemo(
    () => pendingPayments.reduce((sum, payment) => sum + Number(payment.pendingAmount || 0), 0),
    [pendingPayments]
  );

  if (loading) return <LoadingState />;
  if (notFound || !tenant) return <InvalidState />;

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 sm:px-8 sm:py-10">
      <main className="mx-auto max-w-6xl">
        {success && (
          <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
            {success}
          </div>
        )}

        <section className="rounded-lg bg-slate-950 p-6 text-center text-white shadow-lg sm:p-8 sm:text-left">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
              {tenant.profile ? (
                <img src={tenant.profile} alt={tenant.name} className="h-24 w-24 rounded-full border-4 border-white object-cover" />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-white/10">
                  <UserRound size={42} />
                </div>
              )}
              <div>
                <h1 className="text-3xl font-black">{tenant.name}</h1>
                <div className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-200 sm:justify-start"><Phone size={15} /> {tenant.phone || "-"}</div>
                {tenant.fatherName && <div className="mt-2 text-sm text-slate-200">Father: {tenant.fatherName}</div>}
                <div className="mt-2 text-sm text-slate-200">Room {tenant.room || "-"} / Bed {tenant.bed || "-"}</div>
              </div>
            </div>
            <div className="space-y-2 text-sm text-slate-100">
              <div className="flex items-center justify-center gap-2 sm:justify-start"><Mail size={15} /> {tenant.email || "-"}</div>
              <div>{tenant.building || "-"}</div>
              <div>Floor {tenant.floor || "-"}</div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-black uppercase text-slate-400">Pending Payments To Pay</div>
              <h2 className="mt-1 text-2xl font-black text-slate-950">
                Total Due: <span className="text-rose-600">{money(totalDue)}</span>
              </h2>
            </div>
            <span className="w-fit rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">
              {pendingPayments.length} month(s)
            </span>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {pendingPayments.length ? pendingPayments.map((payment) => (
              <div key={payment.monthYear} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-black text-slate-950">{payment.monthLabel}</h3>
                    <p className="mt-1 text-sm font-bold text-slate-500">
                      Paid {money(payment.paidAmount)} of {money(payment.rentAmount)}
                    </p>
                  </div>
                  <div className="text-xl font-black text-rose-600">{money(payment.pendingAmount)}</div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-indigo-600"
                    style={{ width: `${Math.min(100, (Number(payment.paidAmount || 0) / Number(payment.rentAmount || 1)) * 100)}%` }}
                  />
                </div>
                {payment.pendingRequest ? (
                  <button disabled className="mt-4 w-full rounded-lg bg-amber-100 px-4 py-3 font-black text-amber-800">
                    Request Pending For {money(payment.pendingRequest.amount)}
                  </button>
                ) : (
                  <button onClick={() => setSelectedPayment(payment)} className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-3 font-black text-white">
                    Click to update payment
                  </button>
                )}
              </div>
            )) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 font-bold text-emerald-800">
                No pending rent payments.
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">More Details</h2>
            <div className="mt-4 grid gap-3">
              <DetailBox label="Joining Date" value={dateText(tenant.joiningDate)} />
              <DetailBox label="Monthly Rent" value={money(tenant.monthlyRent)} />
              <DetailBox label="Due Date" value={dateText(tenant.dueDate)} />
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">All Payment History</h2>
            <div className="mt-4 space-y-3">
              {tenant.paymentHistory?.length ? tenant.paymentHistory.map((payment, index) => (
                <div key={`${payment.monthYear}-${index}`} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex justify-between gap-3">
                    <div>
                      <div className="font-black text-slate-950">{payment.monthYear}</div>
                      <div className="mt-1 text-sm text-slate-500">{dateText(payment.paidAt)}</div>
                    </div>
                    <div className="font-black text-emerald-700">{money(payment.amount)}</div>
                  </div>
                </div>
              )) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">
                  No payment history available.
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {selectedPayment && (
        <PaymentRequestModal
          tenant={tenant}
          payment={selectedPayment}
          secureId={secureId}
          onClose={() => setSelectedPayment(null)}
          onSubmitted={(message) => {
            setSelectedPayment(null);
            setSuccess(message || "Payment request submitted successfully. Waiting for owner approval.");
            loadTenant();
          }}
        />
      )}
    </div>
  );
}
