import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, RefreshCw, Search, X } from "lucide-react";
import { API, authHeaders } from "../api.js";
import { resolveOptimizedMediaUrl } from "../utils/cloudinaryDelivery.js";

const BACKEND_URL = API.replace(/\/api.*$/, "");

const money = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
    .format(Number(value || 0));

const dateText = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const receiptUrl = (url) => {
  if (!url) return "";
  return resolveOptimizedMediaUrl(url, BACKEND_URL, { width: 1000 });
};

function StatusPill({ status }) {
  const styles = {
    Pending: "bg-amber-100 text-amber-800",
    Approved: "bg-emerald-100 text-emerald-800",
    Rejected: "bg-rose-100 text-rose-800",
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${styles[status] || styles.Pending}`}>{status}</span>;
}

function RejectModal({ request, onClose, onReject }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!reason.trim()) {
      setError("Please enter rejection reason.");
      return;
    }
    setSaving(true);
    try {
      await onReject(request, reason.trim());
      onClose();
    } catch (err) {
      setError(err.message || "Failed to reject request.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-950">Reject Payment Request</h2>
            <p className="mt-1 text-sm text-slate-500">{request.tenantId?.name} - {request.monthYear}</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500"><X size={18} /></button>
        </div>
        <label className="mt-5 block text-xs font-black uppercase text-slate-500">Reason sent to tenant</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          className="mt-2 w-full rounded-lg border border-slate-200 p-3 outline-none focus:border-rose-500"
          placeholder="Example: Receipt amount does not match the rent payment."
        />
        {error && <div className="mt-3 rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>}
        <button onClick={submit} disabled={saving} className="mt-4 w-full rounded-lg bg-rose-600 px-4 py-3 font-black text-white disabled:opacity-60">
          {saving ? "Rejecting..." : "Reject & Send Mail"}
        </button>
      </div>
    </div>
  );
}

export default function PaymentRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [actingId, setActingId] = useState("");
  const [rejecting, setRejecting] = useState(null);
  const [toast, setToast] = useState("");

  const loadRequests = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/payment-requests`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load payment requests.");
      setRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load payment requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRequests(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((request) => {
      const tenant = request.tenantId || {};
      return `${tenant.name || ""} ${tenant.phone || ""} ${tenant.email || ""} ${request.monthYear} ${request.status}`.toLowerCase().includes(q);
    });
  }, [requests, query]);

  const approve = async (request) => {
    setActingId(request._id);
    setToast("");
    try {
      const res = await fetch(`${API}/payment-requests/${request._id}/approve`, {
        method: "PATCH",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Approval failed.");
      setToast(data.message || "Payment approved.");
      await loadRequests();
    } catch (err) {
      setToast(err.message || "Approval failed.");
    } finally {
      setActingId("");
    }
  };

  const reject = async (request, reason) => {
    setActingId(request._id);
    setToast("");
    const res = await fetch(`${API}/payment-requests/${request._id}/reject`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    setActingId("");
    if (!res.ok) throw new Error(data.message || "Reject failed.");
    setToast(data.message || "Payment rejected.");
    await loadRequests();
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-950">Payment Requests</h1>
          <p className="mt-1 text-sm text-slate-500">Approve or reject tenant-submitted payment requests.</p>
        </div>
        <button onClick={loadRequests} className="flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="mt-5 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <Search size={18} className="text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tenant, phone, month or status"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      {toast && <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700">{toast}</div>}
      {error && <div className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>}

      <div className="mt-5 hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3 text-right">Requested</th>
              <th className="px-4 py-3">Proof</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((request) => (
              <tr key={request._id} className="border-t border-slate-100">
                <td className="px-4 py-4">
                  <div className="font-black text-slate-950">{request.tenantId?.name || "-"}</div>
                  <div className="mt-1 text-xs text-slate-500">{request.tenantId?.phone || ""} {request.tenantId?.email || ""}</div>
                </td>
                <td className="px-4 py-4">
                  <div className="font-bold text-slate-800">{request.monthYear}</div>
                  <div className="mt-1 text-xs text-slate-500">Due {dateText(request.dueDate)}</div>
                </td>
                <td className="px-4 py-4 capitalize">{request.paymentMode}</td>
                <td className="px-4 py-4 text-right font-black text-slate-950">{money(request.requestAmount)}</td>
                <td className="px-4 py-4">
                  {request.receiptUrl ? (
                    <a href={receiptUrl(request.receiptUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-indigo-600">
                      Receipt <ExternalLink size={14} />
                    </a>
                  ) : (
                    <span className="text-xs text-slate-500">Cash: {dateText(request.cashGivenAt)}</span>
                  )}
                </td>
                <td className="px-4 py-4"><StatusPill status={request.status} /></td>
                <td className="px-4 py-4 text-right">
                  {request.status === "Pending" ? (
                    <div className="flex justify-end gap-2">
                      <button onClick={() => approve(request)} disabled={actingId === request._id} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-60">
                        <Check size={14} /> Approve
                      </button>
                      <button onClick={() => setRejecting(request)} disabled={actingId === request._id} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-black text-white disabled:opacity-60">
                        <X size={14} /> Reject
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Closed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-4 lg:hidden">
        {filtered.map((request) => (
          <div key={request._id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-black text-slate-950">{request.tenantId?.name || "-"}</div>
                <div className="mt-1 text-xs text-slate-500">{request.tenantId?.phone || ""}</div>
              </div>
              <StatusPill status={request.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs font-black uppercase text-slate-400">Month</div><div className="font-bold">{request.monthYear}</div></div>
              <div><div className="text-xs font-black uppercase text-slate-400">Amount</div><div className="font-black">{money(request.requestAmount)}</div></div>
              <div><div className="text-xs font-black uppercase text-slate-400">Mode</div><div className="font-bold capitalize">{request.paymentMode}</div></div>
              <div><div className="text-xs font-black uppercase text-slate-400">Submitted</div><div className="font-bold">{dateText(request.createdAt)}</div></div>
            </div>
            {request.receiptUrl ? (
              <a href={receiptUrl(request.receiptUrl)} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 font-bold text-indigo-600">
                View Receipt <ExternalLink size={14} />
              </a>
            ) : (
              <div className="mt-4 text-sm font-bold text-slate-600">Cash given: {dateText(request.cashGivenAt)}</div>
            )}
            {request.status === "Pending" && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button onClick={() => approve(request)} disabled={actingId === request._id} className="rounded-lg bg-emerald-600 px-3 py-3 text-sm font-black text-white disabled:opacity-60">Approve</button>
                <button onClick={() => setRejecting(request)} disabled={actingId === request._id} className="rounded-lg bg-rose-600 px-3 py-3 text-sm font-black text-white disabled:opacity-60">Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {!loading && filtered.length === 0 && (
        <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500">
          No payment requests found.
        </div>
      )}
      {loading && <div className="mt-5 rounded-lg bg-white p-8 text-center text-sm font-bold text-slate-500">Loading payment requests...</div>}

      {rejecting && <RejectModal request={rejecting} onClose={() => setRejecting(null)} onReject={reject} />}
    </div>
  );
}
