import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeIndianRupee, BedDouble, CalendarDays, CheckCircle2,
  CreditCard, IndianRupee, Mail, MoreVertical, Pencil, Phone,
  PhoneCall, RefreshCw, UserRoundCheck, X,
} from "lucide-react";
import { API, authHeaders } from "../api.js";

const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(Number(value || 0));

const dateText = (value) => value
  ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
  : "—";

const dateValue = (value) => value ? new Date(value).toISOString().slice(0, 10) : "";

const daysBetween = (from, to) => {
  if (!from || !to || to < from) return 0;
  return Math.floor((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000) + 1;
};

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

function Modal({ title, subtitle, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm" onMouseDown={onClose}>
      <div className={`max-h-[92vh] w-full ${wide ? "max-w-3xl" : "max-w-lg"} overflow-y-auto rounded-2xl bg-white shadow-2xl`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-5 py-4">
          <div><h2 className="text-lg font-extrabold text-slate-900">{title}</h2>{subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}</div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={19} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><span>{label}</span>{children}</label>;
}

export default function ShortStayBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Active");
  const [selected, setSelected] = useState(null);
  const [action, setAction] = useState(null);
  const [saving, setSaving] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/tenants/short-stays`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to load bookings.");
      setBookings(data);
      setSelected((current) => current ? data.find((item) => item._id === current._id) || null : null);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!error) return undefined;
    const timer = window.setTimeout(() => setError(""), 3000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const visible = useMemo(() => bookings.filter((item) => {
    const matchesFilter = filter === "All" || item.status === filter;
    const haystack = `${item.name} ${item.phone} ${item.email || ""} ${item.allocationInfo?.buildingName || ""} ${item.allocationInfo?.roomNumber || ""}`.toLowerCase();
    return matchesFilter && haystack.includes(query.trim().toLowerCase());
  }), [bookings, filter, query]);

  const stats = useMemo(() => ({
    total: bookings.length,
    active: bookings.filter((b) => b.status === "Active").length,
    due: bookings.reduce((sum, b) => sum + Number(b.shortStayDueAmount || 0), 0),
    completed: bookings.filter((b) => new Date(b.shortStayTo) < new Date(new Date().toDateString())).length,
  }), [bookings]);

  const openAction = (type, booking) => {
    setMenuOpenId(null);
    const base = {
      name: booking.name || "", phone: booking.phone || "", email: booking.email || "",
      fatherName: booking.fatherName || "", fatherPhone: booking.fatherPhone || "",
      permanentAddress: booking.permanentAddress || "",
      shortStayFrom: dateValue(booking.shortStayFrom), shortStayTo: dateValue(booking.shortStayTo),
      shortStayPerDayAmount: booking.shortStayPerDayAmount || "",
      shortStayTotalAmount: booking.shortStayTotalAmount || "",
    };
    if (type === "extend") base.shortStayTo = "";
    if (type === "convert") Object.assign(base, { joiningDate: dateValue(new Date()), rentAmount: "" });
    if (type === "pay") {
      const paymentType = Number(booking.shortStayRentDueAmount || 0) > 0 ? "booking" : "advance";
      Object.assign(base, {
        paymentType,
        amount: paymentType === "booking" ? booking.shortStayRentDueAmount : booking.advancePending,
        note: "",
      });
    }
    setAction({ type, booking, form: base, error: "" });
  };

  const updateAction = (key, value) => setAction((current) => ({ ...current, form: { ...current.form, [key]: value }, error: "" }));
  const updateEditPricing = (key, value) => setAction((current) => {
    const form = { ...current.form, [key]: value };
    const days = daysBetween(form.shortStayFrom, form.shortStayTo);
    if (key === "shortStayTotalAmount") {
      const total = Number(value || 0);
      form.shortStayPerDayAmount = days > 0 && total > 0 ? Math.round((total / days) * 100) / 100 : "";
    } else {
      const perDay = Number(form.shortStayPerDayAmount || 0);
      form.shortStayTotalAmount = days > 0 && perDay > 0 ? Math.round((days * perDay) * 100) / 100 : "";
    }
    return { ...current, form, error: "" };
  });
  const changePaymentType = (paymentType) => setAction((current) => ({
    ...current,
    form: {
      ...current.form,
      paymentType,
      amount: paymentType === "advance" ? current.booking.advancePending : current.booking.shortStayRentDueAmount,
    },
    error: "",
  }));

  const submitAction = async () => {
    const { type, booking, form } = action;
    const routes = {
      edit: { path: `/tenants/short-stays/${booking._id}`, method: "PATCH" },
      extend: { path: `/tenants/short-stays/${booking._id}/extend`, method: "POST" },
      convert: { path: `/tenants/short-stays/${booking._id}/convert`, method: "POST" },
      pay: { path: `/tenants/short-stays/${booking._id}/pay`, method: "POST" },
    };
    setSaving(true);
    try {
      const res = await fetch(`${API}${routes[type].path}`, { method: routes[type].method, headers: authHeaders(), body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Action failed.");
      setNotice(data.emailWarning || data.message || "Saved successfully.");
      setAction(null); await load();
    } catch (err) { setAction((current) => ({ ...current, error: err.message })); } finally { setSaving(false); }
  };

  const vacate = async (booking) => {
    if (!window.confirm(`Vacate ${booking.name} now? Their assigned bed will be released.`)) return;
    try {
      const res = await fetch(`${API}/tenants/${booking._id}/vacate`, { method: "DELETE", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to vacate tenant.");
      setNotice(data.message || "Tenant vacated.");
      setSelected(null); await load();
    } catch (err) { setError(err.message); }
  };

  const sendReminder = async (booking) => {
    setMenuOpenId(null); setError(""); setNotice("");
    try {
      const res = await fetch(`${API}/tenants/short-stays/${booking._id}/remind`, {
        method: "POST", headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to send reminder.");
      setNotice(data.message);
    } catch (err) { setError(err.message); }
  };

  const selectedPaymentDue = action?.type === "pay"
    ? Number(action.form.paymentType === "advance" ? action.booking.advancePending : action.booking.shortStayRentDueAmount)
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Owner workspace</p><h1 className="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">Short Stay Bookings</h1><p className="mt-1 text-sm text-slate-500">Day-wise guests, stay dates and payment status in one place.</p></div>
          <button onClick={load} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"><RefreshCw size={16} /> Refresh</button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[["Bookings", stats.total, <CalendarDays key="bookings-icon" size={20} className="mb-3 text-indigo-600" />], ["Active", stats.active, <UserRoundCheck key="active-icon" size={20} className="mb-3 text-indigo-600" />], ["Pending", money(stats.due), <IndianRupee key="pending-icon" size={20} className="mb-3 text-indigo-600" />], ["Stay completed", stats.completed, <CheckCircle2 key="completed-icon" size={20} className="mb-3 text-indigo-600" />]].map(([label, value, icon]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">{icon}<p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-xl font-black text-slate-900">{value}</p></div>
          ))}
        </div>

        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search guest, phone, building or room..." className={`${inputClass} flex-1`} />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${inputClass} sm:w-44`}><option>Active</option><option>Inactive</option><option>All</option></select>
        </div>

        {loading ? <div className="py-20 text-center text-sm font-semibold text-slate-500">Loading short-stay bookings…</div> : visible.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center"><BedDouble className="mx-auto text-slate-300" size={40} /><p className="mt-3 font-bold text-slate-700">No short-stay bookings found</p><p className="mt-1 text-sm text-slate-400">Day-wise onboarding submissions will appear here.</p></div> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((booking) => {
              const completed = new Date(booking.shortStayTo) < new Date(new Date().toDateString());
              const statusColor = booking.shortStayPaymentStatus === "Paid" ? "bg-emerald-100 text-emerald-700" : booking.shortStayPaymentStatus === "Partial" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700";
              return <article key={booking._id} onClick={() => { setMenuOpenId(null); setSelected(booking); }} className="relative cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-lg font-extrabold text-slate-900">{booking.name}</h2><p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><Phone size={13} /> {booking.phone}</p></div><div className="flex items-start gap-2"><div className="flex max-w-[150px] flex-wrap justify-end gap-1.5">{completed && <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-extrabold uppercase text-violet-700">Stay completed</span>}<span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase ${statusColor}`}>{booking.shortStayPaymentStatus}</span></div><div className="relative" onClick={(e) => e.stopPropagation()}><button onClick={() => setMenuOpenId((id) => id === booking._id ? null : booking._id)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900" aria-label={`More options for ${booking.name}`}><MoreVertical size={18} /></button>{menuOpenId === booking._id && <div className="absolute right-0 top-11 z-30 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"><button onClick={() => openAction("edit", booking)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"><Pencil size={15} /> Edit details</button>{booking.status === "Active" && <><button onClick={() => openAction("extend", booking)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"><CalendarDays size={15} /> Extend stay</button><button onClick={() => openAction("convert", booking)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-50"><UserRoundCheck size={15} /> Convert tenant</button>{booking.shortStayDueAmount > 0 && <button onClick={() => sendReminder(booking)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-amber-700 hover:bg-amber-50"><Mail size={15} /> Email reminder</button>}<div className="my-1 border-t border-slate-100" /><button onClick={() => vacate(booking)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50"><X size={15} /> Vacate tenant</button></>}</div>}</div></div></div>
                <div className="mt-4 rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between text-sm"><span className="text-slate-500">{dateText(booking.shortStayFrom)} → {dateText(booking.shortStayTo)}</span><strong className="text-slate-800">{money(booking.shortStayPerDayAmount)}/day</strong></div><p className="mt-2 text-xs text-slate-500">{booking.allocationInfo?.buildingName ? `${booking.allocationInfo.buildingName} · Room ${booking.allocationInfo.roomNumber} · Bed ${booking.allocationInfo.bedNumber}` : "Room not assigned"}</p></div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div><p className="text-[10px] font-bold uppercase text-slate-400">Stay total</p><p className="text-sm font-black text-slate-800">{money(booking.shortStayTotalAmount)}</p></div><div><p className="text-[10px] font-bold uppercase text-slate-400">Stay paid</p><p className="text-sm font-black text-emerald-600">{money(booking.shortStayPaidAmount)}</p></div><div><p className="text-[10px] font-bold uppercase text-slate-400">Total due</p><p className="text-sm font-black text-rose-600">{money(booking.shortStayDueAmount)}</p></div></div>
                {Number(booking.advanceAmount || 0) > 0 && <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs"><span className="font-bold text-amber-800">Advance: {money(booking.advanceAmount)}</span><span className="text-amber-700">Paid {money(booking.paidadvanceAmount)} · <strong>Due {money(booking.advancePending)}</strong></span></div>}
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4" onClick={(e) => e.stopPropagation()}><a href={`tel:${booking.phone}`} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"><PhoneCall size={16} /> Call</a><button onClick={() => openAction("pay", booking)} disabled={booking.status !== "Active" || booking.shortStayDueAmount <= 0} className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><CreditCard size={16} /> {booking.shortStayDueAmount > 0 ? "Record payment" : "Paid"}</button></div>
              </article>;
            })}
          </div>
        )}
      </div>

      {(notice || error) && <div className={`fixed right-4 top-20 z-[120] flex max-w-sm items-start gap-3 rounded-2xl border bg-white px-4 py-3.5 shadow-2xl ${error ? "border-rose-200 text-rose-700" : "border-emerald-200 text-emerald-700"}`} role="status"><div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${error ? "bg-rose-100" : "bg-emerald-100"}`}>{error ? <X size={15} /> : <CheckCircle2 size={16} />}</div><div className="min-w-0"><p className="text-sm font-extrabold">{error ? "Action failed" : "Success"}</p><p className="mt-0.5 text-xs font-semibold leading-5 text-slate-600">{error || notice}</p></div><button onClick={() => { setNotice(""); setError(""); }} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Dismiss"><X size={14} /></button></div>}

      {selected && <Modal title={selected.name} subtitle="Short-stay booking details" onClose={() => setSelected(null)} wide>
        <div className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <button onClick={() => { const booking = selected; setSelected(null); openAction("edit", booking); }} className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm font-bold text-indigo-700 shadow-sm ring-1 ring-slate-200"><Pencil size={16} /> Edit details</button>
          <a href={`tel:${selected.phone}`} className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200"><PhoneCall size={16} /> Call</a>
          {selected.status === "Active" && selected.shortStayDueAmount > 0 && <button onClick={() => { const booking = selected; setSelected(null); openAction("pay", booking); }} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-sm font-bold text-white shadow-sm"><CreditCard size={16} /> Record payment</button>}
          {selected.shortStayDueAmount > 0 && <button onClick={() => { const booking = selected; setSelected(null); sendReminder(booking); }} className="flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm font-bold text-amber-700 ring-1 ring-amber-200"><Mail size={16} /> Email reminder</button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
          ["Phone", selected.phone], ["Email", selected.email || "—"], ["Father's name", selected.fatherName || "—"], ["Father's phone", selected.fatherPhone || "—"], ["Stay from", dateText(selected.shortStayFrom)], ["Stay to", dateText(selected.shortStayTo)], ["Per day", money(selected.shortStayPerDayAmount)], ["Stay total", money(selected.shortStayTotalAmount)], ["Stay paid", money(selected.shortStayPaidAmount)], ["Stay rent due", money(selected.shortStayRentDueAmount)], ["Advance required", money(selected.advanceAmount)], ["Advance paid", money(selected.paidadvanceAmount)], ["Advance due", money(selected.advancePending)], ["Total outstanding", money(selected.shortStayDueAmount)], ["Status", selected.status], ["Building", selected.allocationInfo?.buildingName || "—"], ["Floor", selected.allocationInfo?.floorNumber ?? "—"], ["Room / Bed", selected.allocationInfo?.roomNumber ? `${selected.allocationInfo.roomNumber} / ${selected.allocationInfo.bedNumber}` : "—"], ["Booked on", dateText(selected.createdAt)],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 break-words text-sm font-bold text-slate-800">{value}</p></div>)}</div>
        <div className="mt-4 rounded-xl border border-slate-200 p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Permanent address</p><p className="mt-1 text-sm text-slate-700">{selected.permanentAddress}</p></div>
        <div className="mt-4 rounded-xl border border-slate-200 p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Documents</p><div className="mt-2 flex flex-wrap gap-2">{[["Aadhar front", selected.documents?.aadharFront], ["Aadhar back", selected.documents?.aadharBack], ["Passport photo", selected.documents?.passportPhoto]].map(([label, url]) => url ? <a key={label} href={url} target="_blank" rel="noreferrer" className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100">{label}</a> : <span key={label} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-400">{label}: unavailable</span>)}</div></div>
        <div className="mt-5 flex items-center gap-2"><BadgeIndianRupee size={18} className="text-indigo-600" /><h3 className="font-extrabold text-slate-900">Payment history</h3></div>
        <div className="mt-3 grid gap-2">{selected.shortStayPayments?.length ? [...selected.shortStayPayments].reverse().map((payment) => <div key={payment._id || payment.paidAt} className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${payment.paymentType === "advance" ? "bg-amber-50" : "bg-emerald-50"}`}><div><div className="flex items-center gap-2"><p className={`text-sm font-extrabold ${payment.paymentType === "advance" ? "text-amber-800" : "text-emerald-800"}`}>{money(payment.amount)}</p><span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase ${payment.paymentType === "advance" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{payment.paymentType === "advance" ? "Advance" : "Stay rent"}</span></div><p className={`text-xs ${payment.paymentType === "advance" ? "text-amber-700" : "text-emerald-700"}`}>{payment.note || (payment.paymentType === "advance" ? "Advance payment" : "Short-stay payment")}</p></div><span className={`text-xs font-semibold ${payment.paymentType === "advance" ? "text-amber-700" : "text-emerald-700"}`}>{dateText(payment.paidAt)}</span></div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No payments recorded yet.</p>}</div>
      </Modal>}

      {action && <Modal title={{ edit: "Edit booking", extend: "Extend stay", convert: "Convert to monthly tenant", pay: "Record payment" }[action.type]} subtitle={action.booking.name} onClose={() => !saving && setAction(null)}>
        <div className="grid gap-4">
          {action.type === "edit" && <><Field label="Name"><input className={inputClass} value={action.form.name} onChange={(e) => updateAction("name", e.target.value)} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Phone"><input className={inputClass} value={action.form.phone} onChange={(e) => updateAction("phone", e.target.value)} /></Field><Field label="Email"><input className={inputClass} value={action.form.email} onChange={(e) => updateAction("email", e.target.value)} /></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Father's name"><input className={inputClass} value={action.form.fatherName} onChange={(e) => updateAction("fatherName", e.target.value)} /></Field><Field label="Father's phone"><input className={inputClass} value={action.form.fatherPhone} onChange={(e) => updateAction("fatherPhone", e.target.value)} /></Field></div><Field label="Address"><textarea className={inputClass} rows="2" value={action.form.permanentAddress} onChange={(e) => updateAction("permanentAddress", e.target.value)} /></Field></>}
          {(action.type === "edit" || action.type === "extend") && <>
            <div className="grid grid-cols-2 gap-3">
              {action.type === "edit" && <Field label="Stay from"><input type="date" className={inputClass} value={action.form.shortStayFrom} onChange={(e) => updateEditPricing("shortStayFrom", e.target.value)} /></Field>}
              <Field label={action.type === "extend" ? "New stay to" : "Stay to"}><input type="date" className={inputClass} min={action.type === "extend" ? dateValue(action.booking.shortStayTo) : action.form.shortStayFrom} value={action.form.shortStayTo} onChange={(e) => action.type === "edit" ? updateEditPricing("shortStayTo", e.target.value) : updateAction("shortStayTo", e.target.value)} /></Field>
            </div>
            <Field label="Per-day amount"><input type="number" min="0.01" step="0.01" className={inputClass} value={action.form.shortStayPerDayAmount} onChange={(e) => action.type === "edit" ? updateEditPricing("shortStayPerDayAmount", e.target.value) : updateAction("shortStayPerDayAmount", e.target.value)} /></Field>
            {action.type === "edit" && <Field label="New total"><input type="number" min="0.01" step="0.01" className={inputClass} value={action.form.shortStayTotalAmount} onChange={(e) => updateEditPricing("shortStayTotalAmount", e.target.value)} /><span className="normal-case tracking-normal text-slate-500">{daysBetween(action.form.shortStayFrom, action.form.shortStayTo)} day(s) · {money(action.form.shortStayTotalAmount)} ÷ {daysBetween(action.form.shortStayFrom, action.form.shortStayTo) || 1} = {money(action.form.shortStayPerDayAmount)}/day</span></Field>}
          </>}
          {action.type === "convert" && <><Field label="Monthly joining date"><input type="date" max={dateValue(new Date())} className={inputClass} value={action.form.joiningDate} onChange={(e) => updateAction("joiningDate", e.target.value)} /></Field><Field label="Rent per month"><input type="number" min="1" className={inputClass} value={action.form.rentAmount} onChange={(e) => updateAction("rentAmount", e.target.value)} /></Field><div className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold leading-5 text-emerald-800">After conversion, this guest will move to normal monthly Rent Management and will no longer appear on this page.</div></>}
          {action.type === "pay" && <>
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-3"><span>Total outstanding</span><strong>{money(action.booking.shortStayDueAmount)}</strong></div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500"><span>Stay rent due: <b className="text-slate-700">{money(action.booking.shortStayRentDueAmount)}</b></span><span>Advance due: <b className="text-amber-700">{money(action.booking.advancePending)}</b></span></div>
            </div>
            {Number(action.booking.advancePending || 0) > 0 && <Field label="Select payment"><select className={inputClass} value={action.form.paymentType} onChange={(e) => changePaymentType(e.target.value)}><option value="booking" disabled={Number(action.booking.shortStayRentDueAmount || 0) <= 0}>Short-stay rent — {Number(action.booking.shortStayRentDueAmount || 0) > 0 ? `${money(action.booking.shortStayRentDueAmount)} due` : "Paid"}</option><option value="advance">Advance — {money(action.booking.advancePending)} due</option></select></Field>}
            <div className={`rounded-xl border p-3 ${action.form.paymentType === "advance" ? "border-amber-200 bg-amber-50" : "border-indigo-200 bg-indigo-50"}`}><p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{action.form.paymentType === "advance" ? "Advance balance" : "Short-stay rent balance"}</p><strong className="mt-1 block text-xl text-slate-900">{money(selectedPaymentDue)}</strong></div>
            <Field label="Payment amount"><input type="number" min="1" max={selectedPaymentDue} className={inputClass} value={action.form.amount} onChange={(e) => updateAction("amount", e.target.value)} /></Field>
            <Field label="Note"><input className={inputClass} value={action.form.note} onChange={(e) => updateAction("note", e.target.value)} placeholder="Cash, UPI, reference…" /></Field>
            <div className="rounded-xl bg-indigo-50 px-3 py-2.5 text-xs font-semibold text-indigo-700">{action.booking.email ? `A successful payment receipt will be emailed to ${action.booking.email}.` : "No email is available; the payment will still be recorded."}</div>
          </>}
          {action.error && <div className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{action.error}</div>}
          <div className="flex justify-end gap-2 pt-2"><button onClick={() => setAction(null)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600">Cancel</button><button onClick={submitAction} disabled={saving} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving…" : "Save"}</button></div>
        </div>
      </Modal>}
    </div>
  );
}
