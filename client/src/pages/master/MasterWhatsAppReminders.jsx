import { useCallback, useEffect, useMemo, useState } from "react";
import { API } from "../api.js";

const token = () => sessionStorage.getItem("token");
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

function formatDateTime(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
  });
}

function Toggle({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      className={`wr-toggle ${checked ? "on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      aria-label={label}
      aria-pressed={checked}
    ><span /></button>
  );
}

function Badge({ children, tone = "neutral" }) {
  return <span className={`wr-badge ${tone}`}>{children}</span>;
}

export default function MasterWhatsAppReminders() {
  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [summary, setSummary] = useState(null);
  const [owners, setOwners] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [history, setHistory] = useState({ data: [], totals: {}, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingOwner, setSavingOwner] = useState({});
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerStatus, setOwnerStatus] = useState("all");
  const [expandedOwner, setExpandedOwner] = useState("");
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [filters, setFilters] = useState({
    ownerId: "", propertyId: "", preset: "today", from: "", to: "",
    status: "", reminderType: "", search: "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API}/master/whatsapp-reminders${path}`, {
      ...options,
      headers: { ...headers(), ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed.");
    return data;
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsData, summaryData, ownerData, analyticsData, forecastData] = await Promise.all([
        request("/settings"), request("/summary"), request("/owners"),
        request("/owners/analytics"), request("/forecast"),
      ]);
      setGlobalEnabled(settingsData.globalEnabled);
      setSummary(summaryData);
      setOwners(ownerData);
      setAnalytics(analyticsData);
      setForecast(forecastData);
      setMessage({ type: "", text: "" });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  }, [request]);

  const loadHistory = useCallback(async (page = 1, activeFilters = appliedFilters) => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "15" });
      Object.entries(activeFilters).forEach(([key, value]) => { if (value) params.set(key, value); });
      const data = await request(`/history?${params.toString()}`);
      setHistory(data);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setHistoryLoading(false);
    }
  }, [appliedFilters, request]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { loadHistory(1, appliedFilters); }, [appliedFilters, loadHistory]);

  const toggleGlobal = async (enabled) => {
    setSavingGlobal(true);
    try {
      const data = await request("/settings", { method: "PATCH", body: JSON.stringify({ globalEnabled: enabled }) });
      setMessage({ type: "success", text: data.message });
      await loadDashboard();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally { setSavingGlobal(false); }
  };

  const toggleOwner = async (ownerId, enabled) => {
    setSavingOwner((current) => ({ ...current, [ownerId]: true }));
    try {
      const data = await request(`/owners/${ownerId}`, {
        method: "PATCH", body: JSON.stringify({ whatsappRemindersEnabled: enabled }),
      });
      setMessage({ type: "success", text: data.message });
      await loadDashboard();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally { setSavingOwner((current) => ({ ...current, [ownerId]: false })); }
  };

  const analyticsByOwner = useMemo(
    () => new Map(analytics.map((row) => [String(row.ownerId), row])), [analytics]
  );
  const properties = useMemo(() => {
    if (filters.ownerId) return owners.find((owner) => owner._id === filters.ownerId)?.properties || [];
    const seen = new Set();
    return owners.flatMap((owner) => owner.properties || []).filter((property) => {
      const key = String(property._id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filters.ownerId, owners]);
  const filteredOwners = useMemo(() => {
    const query = ownerSearch.trim().toLowerCase();
    return owners.filter((owner) => {
      const searchMatch = !query || `${owner.businessName} ${owner.ownerName} ${owner.email} ${owner.phone}`.toLowerCase().includes(query);
      const statusMatch = ownerStatus === "all" || owner.effectiveStatus.toLowerCase() === ownerStatus;
      return searchMatch && statusMatch;
    });
  }, [ownerSearch, ownerStatus, owners]);

  const cards = summary ? [
    ["Global status", summary.globalEnabled ? "ON" : "OFF", summary.globalEnabled ? "green" : "red"],
    ["Owners ON", summary.ownersOn, "green"], ["Owners OFF", summary.ownersOff, "gray"],
    ["Blocked owners", summary.blockedOwners, "red"], ["Sent today", summary.messagesSentToday, "blue"],
    ["Failed today", summary.failedToday, "red"], ["Skipped today", summary.duplicatesSkippedToday, "amber"],
    ["Invalid phones", summary.invalidPhonesToday, "amber"], ["Tomorrow", summary.scheduledForTomorrow, "purple"],
  ] : [];

  const applyFilters = () => setAppliedFilters({ ...filters });
  const resetFilters = () => {
    const reset = { ownerId: "", propertyId: "", preset: "today", from: "", to: "", status: "", reminderType: "", search: "" };
    setFilters(reset);
    setAppliedFilters(reset);
  };

  return (
    <div className="wr-root">
      <style>{`
        .wr-root{font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a;max-width:1500px;margin:0 auto}.wr-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap}.wr-head h1{font-size:25px;margin:0;font-weight:800;letter-spacing:-.02em}.wr-head p{font-size:13px;color:#64748b;margin:5px 0 0}.wr-panel{background:#fff;border:1px solid #e5eaf1;border-radius:16px;box-shadow:0 2px 10px rgba(15,23,42,.045)}.wr-global{padding:18px 20px;display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:18px;background:linear-gradient(135deg,#fff,#f0fdf7)}.wr-global.off{background:linear-gradient(135deg,#fff,#fff7f7)}.wr-global-title{font-size:15px;font-weight:800}.wr-global-sub{font-size:12px;color:#64748b;margin-top:4px;max-width:720px}.wr-toggle{width:48px;height:27px;border:0;border-radius:99px;padding:3px;background:#cbd5e1;cursor:pointer;transition:.2s;flex-shrink:0}.wr-toggle span{display:block;width:21px;height:21px;background:#fff;border-radius:50%;box-shadow:0 1px 4px #64748b66;transition:.2s}.wr-toggle.on{background:#16a34a}.wr-toggle.on span{transform:translateX(21px)}.wr-toggle:disabled{opacity:.45;cursor:not-allowed}.wr-message{padding:11px 14px;border-radius:10px;font-size:12.5px;font-weight:700;margin-bottom:16px}.wr-message.success{background:#ecfdf5;border:1px solid #a7f3d0;color:#047857}.wr-message.error{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c}.wr-metrics{display:grid;grid-template-columns:repeat(9,minmax(115px,1fr));gap:10px;margin-bottom:18px}.wr-metric{padding:14px;border-radius:13px;background:#fff;border:1px solid #e8edf4;box-shadow:0 1px 5px #0f172a0a}.wr-metric-value{font-size:21px;font-weight:850;margin-top:7px}.wr-metric-label{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.055em;font-weight:800}.wr-metric.green .wr-metric-value{color:#15803d}.wr-metric.red .wr-metric-value{color:#dc2626}.wr-metric.blue .wr-metric-value{color:#2563eb}.wr-metric.amber .wr-metric-value{color:#d97706}.wr-metric.purple .wr-metric-value{color:#7c3aed}.wr-section{margin-top:18px}.wr-section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:11px;flex-wrap:wrap}.wr-section-title{font-size:16px;font-weight:800}.wr-section-sub{font-size:12px;color:#64748b;margin-top:2px}.wr-forecast{padding:18px;margin-bottom:18px}.wr-forecast-grid{display:grid;grid-template-columns:220px 1fr;gap:18px;margin-top:15px}.wr-forecast-total{border-radius:13px;background:#f5f3ff;padding:18px;border:1px solid #ddd6fe}.wr-forecast-number{font-size:32px;font-weight:850;color:#7c3aed}.wr-forecast-owners{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}.wr-forecast-owner{padding:13px;border:1px solid #e5e7eb;border-radius:11px;background:#fafafa}.wr-owner-name{font-size:13px;font-weight:800}.wr-muted{font-size:11.5px;color:#64748b}.wr-owner-toolbar,.wr-filterbar{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.wr-input,.wr-select{height:38px;border:1px solid #dbe3ee;border-radius:9px;background:#fff;padding:0 11px;font:inherit;font-size:12.5px;color:#334155;outline:none}.wr-input:focus,.wr-select:focus{border-color:#7c3aed;box-shadow:0 0 0 3px #7c3aed14}.wr-input.search{min-width:240px;flex:1}.wr-owner-list{display:flex;flex-direction:column;gap:10px}.wr-owner-card{padding:15px 17px}.wr-owner-main{display:grid;grid-template-columns:minmax(240px,1.6fr) minmax(180px,1fr) auto auto;gap:14px;align-items:center}.wr-owner-ident{display:flex;gap:12px;align-items:center}.wr-avatar{width:42px;height:42px;border-radius:11px;background:#ecfdf5;color:#15803d;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:850}.wr-owner-contact{font-size:11.5px;color:#64748b;margin-top:3px;word-break:break-word}.wr-chips{display:flex;gap:6px;flex-wrap:wrap}.wr-chip{font-size:10.5px;font-weight:750;background:#f1f5f9;color:#475569;padding:4px 8px;border-radius:7px}.wr-badge{font-size:10.5px;font-weight:850;border-radius:99px;padding:5px 9px;display:inline-flex}.wr-badge.green{background:#dcfce7;color:#15803d}.wr-badge.red{background:#fee2e2;color:#b91c1c}.wr-badge.gray,.wr-badge.neutral{background:#f1f5f9;color:#64748b}.wr-badge.amber{background:#fef3c7;color:#b45309}.wr-badge.blue{background:#dbeafe;color:#1d4ed8}.wr-owner-actions{display:flex;align-items:center;gap:10px}.wr-detail-btn,.wr-btn{height:36px;border-radius:9px;border:1px solid #dbe3ee;background:#fff;color:#475569;padding:0 12px;font:inherit;font-size:12px;font-weight:750;cursor:pointer}.wr-btn.primary{background:#7c3aed;color:#fff;border-color:#7c3aed}.wr-owner-detail{border-top:1px solid #eef2f7;margin-top:14px;padding-top:14px;display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px}.wr-detail{padding:10px;background:#f8fafc;border-radius:9px}.wr-detail-label{font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;font-weight:800}.wr-detail-value{font-size:12px;font-weight:750;margin-top:4px;overflow-wrap:anywhere}.wr-history{padding:18px}.wr-filterbar{padding:12px;background:#f8fafc;border-radius:12px;margin:13px 0}.wr-filter-actions{display:flex;gap:7px}.wr-totals{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.wr-table-wrap{overflow:auto;border:1px solid #e8edf4;border-radius:12px}.wr-table{width:100%;border-collapse:collapse;min-width:1120px}.wr-table th{background:#f8fafc;color:#64748b;text-transform:uppercase;letter-spacing:.04em;font-size:9.5px;text-align:left;padding:10px;border-bottom:1px solid #e5e7eb}.wr-table td{padding:11px 10px;border-bottom:1px solid #f1f5f9;font-size:11.5px;vertical-align:top}.wr-table tr:last-child td{border-bottom:0}.wr-link{background:none;border:0;color:#7c3aed;font:inherit;font-weight:750;cursor:pointer;padding:0;text-align:left}.wr-pagination{display:flex;justify-content:space-between;align-items:center;margin-top:13px;font-size:12px;color:#64748b}.wr-empty{padding:30px;text-align:center;color:#94a3b8;font-size:13px}.wr-modal-backdrop{position:fixed;inset:0;background:#0f172a73;display:flex;align-items:center;justify-content:center;padding:20px;z-index:1000}.wr-modal{background:#fff;width:min(620px,100%);border-radius:17px;padding:20px;box-shadow:0 24px 70px #0f172a55}.wr-modal-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #eef2f7;padding-bottom:13px}.wr-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.wr-close{border:0;background:#f1f5f9;border-radius:8px;width:32px;height:32px;cursor:pointer}.wr-skeleton{height:90px;border-radius:13px;background:linear-gradient(90deg,#f1f5f9,#e2e8f0,#f1f5f9);background-size:200% 100%;animation:wr-shimmer 1.3s infinite}@keyframes wr-shimmer{to{background-position:-200% 0}}@media(max-width:1180px){.wr-metrics{grid-template-columns:repeat(3,1fr)}.wr-owner-main{grid-template-columns:1fr 1fr}.wr-owner-detail{grid-template-columns:repeat(2,1fr)}}@media(max-width:720px){.wr-metrics{grid-template-columns:repeat(2,1fr)}.wr-forecast-grid{grid-template-columns:1fr}.wr-owner-main{grid-template-columns:1fr}.wr-owner-detail,.wr-modal-grid{grid-template-columns:1fr}.wr-input,.wr-select{width:100%}.wr-filter-actions{width:100%}.wr-filter-actions .wr-btn{flex:1}}
      `}</style>

      <div className="wr-head"><div><h1>WhatsApp Reminders Setup</h1><p>Control delivery, monitor activity, and review tenant reminder history across all owners.</p></div></div>
      {message.text && <div className={`wr-message ${message.type}`}>{message.text}</div>}

      <div className={`wr-panel wr-global ${globalEnabled ? "" : "off"}`}>
        <div><div className="wr-global-title">System-wide WhatsApp reminders</div><div className="wr-global-sub">This master switch overrides every owner. Turning it off immediately blocks cron, startup, wake-up, and manual automated processing.</div></div>
        <div style={{display:"flex",alignItems:"center",gap:10}}><Badge tone={globalEnabled ? "green" : "red"}>{globalEnabled ? "ACTIVE" : "STOPPED"}</Badge><Toggle checked={globalEnabled} disabled={savingGlobal || loading} onChange={toggleGlobal} label="Global WhatsApp reminders" /></div>
      </div>

      {loading ? <div className="wr-skeleton" /> : <div className="wr-metrics">{cards.map(([label,value,tone]) => <div className={`wr-metric ${tone}`} key={label}><div className="wr-metric-label">{label}</div><div className="wr-metric-value">{value}</div></div>)}</div>}

      <div className="wr-panel wr-forecast">
        <div className="wr-section-title">Tomorrow’s Reminder Forecast</div><div className="wr-section-sub">Read-only forecast using the same eligibility, owner controls, and duplicate rules as production automation.</div>
        <div className="wr-forecast-grid"><div className="wr-forecast-total"><div className="wr-forecast-number">{forecast?.totalTenants ?? 0}</div><div className="wr-owner-name">tenants expected</div><div className="wr-muted">{forecast?.totalReminders ?? 0} reminder messages · {forecast?.processingDate || "Tomorrow"}</div></div><div className="wr-forecast-owners">{forecast?.byOwner?.length ? forecast.byOwner.map((row) => <div className="wr-forecast-owner" key={row.ownerId}><div className="wr-owner-name">{row.ownerName || row.businessName}</div><div className="wr-muted">{row.tenantCount} tenants · {row.reminderCount} reminders</div><div className="wr-chips" style={{marginTop:8}}><span className="wr-chip">Due today: {row.reminderTypes.DUE_TODAY}</span><span className="wr-chip">2 days before: {row.reminderTypes.TWO_DAYS_BEFORE}</span></div></div>) : <div className="wr-empty">No eligible reminders forecast for tomorrow.</div>}</div></div>
      </div>

      <section className="wr-section"><div className="wr-section-head"><div><div className="wr-section-title">Owner Controls & Analytics</div><div className="wr-section-sub">Blocked owners cannot send, even when their reminder toggle is stored as ON.</div></div><div className="wr-owner-toolbar"><input className="wr-input search" placeholder="Search owner, business, email or phone…" value={ownerSearch} onChange={(event) => setOwnerSearch(event.target.value)} /><select className="wr-select" value={ownerStatus} onChange={(event) => setOwnerStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option><option value="blocked">Blocked</option></select></div></div>
        <div className="wr-owner-list">{filteredOwners.map((owner) => { const details=analyticsByOwner.get(String(owner._id)) || {}; const blocked=owner.loginStatus !== "active"; const expanded=expandedOwner===owner._id; return <div className="wr-panel wr-owner-card" key={owner._id}><div className="wr-owner-main"><div className="wr-owner-ident"><div className="wr-avatar">{(owner.ownerName || owner.businessName || "O").charAt(0).toUpperCase()}</div><div><div className="wr-owner-name">{owner.businessName}</div><div className="wr-muted">{owner.ownerName}</div><div className="wr-owner-contact">{owner.email} · {owner.phone}</div></div></div><div className="wr-chips"><span className="wr-chip">{owner.buildingCount} properties</span><span className="wr-chip">{owner.activeTenantCount} active tenants</span><Badge tone={owner.effectiveStatus === "Active" ? "green" : owner.effectiveStatus === "Blocked" ? "red" : "gray"}>{owner.effectiveStatus}</Badge></div><div className="wr-owner-actions"><span className="wr-muted">Reminders</span><Toggle checked={owner.whatsappRemindersEnabled} disabled={blocked || savingOwner[owner._id]} onChange={(enabled) => toggleOwner(owner._id, enabled)} label={`WhatsApp reminders for ${owner.ownerName}`} /></div><button className="wr-detail-btn" onClick={() => setExpandedOwner(expanded ? "" : owner._id)}>{expanded ? "Hide analytics" : "View analytics"}</button></div>{expanded && <div className="wr-owner-detail">{[["Last reminder",formatDateTime(details.lastReminderAt)],["Last tenant",details.lastRecipientTenantName || "—"],["Last phone",details.lastRecipientPhone || "—"],["Last property",details.lastPropertyName || "—"],["Sent this month",details.sentThisMonth || 0],["Sent today",details.sentToday || 0],["Failed this month",details.failedThisMonth || 0],["Failed today",details.failedToday || 0],["Duplicate skips",details.duplicateSkipped || 0],["Invalid phones",details.invalidPhones || 0],["Scheduled tomorrow",details.scheduledTomorrow || 0],["Last failure",details.lastFailureReason || "None"]].map(([label,value]) => <div className="wr-detail" key={label}><div className="wr-detail-label">{label}</div><div className="wr-detail-value">{value}</div></div>)}</div>}</div>; })}{!loading && !filteredOwners.length && <div className="wr-panel wr-empty">No owners match the selected filters.</div>}</div>
      </section>

      <section className="wr-section wr-panel wr-history"><div className="wr-section-title">Message History</div><div className="wr-section-sub">Audit sent, failed, processing, and duplicate-skipped reminder activity.</div>
        <div className="wr-filterbar"><select className="wr-select" value={filters.ownerId} onChange={(event) => setFilters((current) => ({...current,ownerId:event.target.value,propertyId:""}))}><option value="">All owners</option>{owners.map((owner) => <option key={owner._id} value={owner._id}>{owner.ownerName || owner.businessName}</option>)}</select><select className="wr-select" value={filters.propertyId} onChange={(event) => setFilters((current) => ({...current,propertyId:event.target.value}))}><option value="">All properties</option>{properties.map((property) => <option key={property._id} value={property._id}>{property.buildingName}</option>)}</select><select className="wr-select" value={filters.preset} onChange={(event) => setFilters((current) => ({...current,preset:event.target.value}))}><option value="">Custom/all dates</option><option value="today">Today</option><option value="month">Current month</option></select><input className="wr-input" type="date" value={filters.from} onChange={(event) => setFilters((current) => ({...current,from:event.target.value,preset:""}))} /><input className="wr-input" type="date" value={filters.to} onChange={(event) => setFilters((current) => ({...current,to:event.target.value,preset:""}))} /><select className="wr-select" value={filters.status} onChange={(event) => setFilters((current) => ({...current,status:event.target.value}))}><option value="">All statuses</option><option>SENT</option><option>FAILED</option><option>PROCESSING</option><option>SKIPPED</option></select><select className="wr-select" value={filters.reminderType} onChange={(event) => setFilters((current) => ({...current,reminderType:event.target.value}))}><option value="">All reminder types</option><option>TWO_DAYS_BEFORE</option><option>DUE_TODAY</option></select><input className="wr-input search" placeholder="Tenant name or phone" value={filters.search} onChange={(event) => setFilters((current) => ({...current,search:event.target.value}))} /><div className="wr-filter-actions"><button className="wr-btn primary" onClick={applyFilters}>Apply</button><button className="wr-btn" onClick={resetFilters}>Reset</button></div></div>
        <div className="wr-totals"><Badge tone="green">Sent {history.totals?.sent || 0}</Badge><Badge tone="red">Failed {history.totals?.failed || 0}</Badge><Badge tone="amber">Skipped {history.totals?.skipped || 0}</Badge><Badge>Total records {history.totals?.totalRecords || 0}</Badge></div>
        <div className="wr-table-wrap"><table className="wr-table"><thead><tr><th>Date/time</th><th>Owner / Property</th><th>Tenant</th><th>Rent month</th><th>Reminder</th><th>Due date</th><th>Status</th><th>Error</th></tr></thead><tbody>{!historyLoading && history.data.map((row) => <tr key={row._id || `${row.tenantId}-${row.eventAt}-${row.reminderType}`}><td>{formatDateTime(row.eventAt)}</td><td><strong>{row.ownerName || "—"}</strong><div className="wr-muted">{row.propertyName || "—"}</div></td><td><button className="wr-link" onClick={() => setSelectedMessage(row)}>{row.tenantName || "Unknown tenant"}</button><div className="wr-muted">{row.tenantPhone}</div></td><td>{row.rentMonth || "—"}</td><td><Badge tone="blue">{row.reminderType}</Badge></td><td>{formatDate(row.dueDate)}</td><td><Badge tone={row.status === "SENT" ? "green" : row.status === "FAILED" ? "red" : "amber"}>{row.status}</Badge>{row.duplicateSkipCount > 0 && <div className="wr-muted">Skipped ×{row.duplicateSkipCount}</div>}</td><td>{row.errorReason || "—"}</td></tr>)}{historyLoading && <tr><td colSpan="8"><div className="wr-empty">Loading message history…</div></td></tr>}{!historyLoading && !history.data.length && <tr><td colSpan="8"><div className="wr-empty">No reminder records match these filters.</div></td></tr>}</tbody></table></div>
        <div className="wr-pagination"><span>Page {history.page} of {history.totalPages}</span><div style={{display:"flex",gap:7}}><button className="wr-btn" disabled={history.page<=1 || historyLoading} onClick={() => loadHistory(history.page-1)}>Previous</button><button className="wr-btn" disabled={history.page>=history.totalPages || historyLoading} onClick={() => loadHistory(history.page+1)}>Next</button></div></div>
      </section>

      {selectedMessage && <div className="wr-modal-backdrop" onClick={() => setSelectedMessage(null)}><div className="wr-modal" onClick={(event) => event.stopPropagation()}><div className="wr-modal-head"><div><div className="wr-section-title">Recipient Details</div><div className="wr-section-sub">Who received this reminder and when</div></div><button className="wr-close" onClick={() => setSelectedMessage(null)}>×</button></div><div className="wr-modal-grid">{[["Tenant",selectedMessage.tenantName || "—"],["Phone",selectedMessage.tenantPhone || "—"],["Owner",selectedMessage.ownerName || "—"],["Property",selectedMessage.propertyName || "—"],["Sent / attempted",formatDateTime(selectedMessage.eventAt)],["Reminder type",selectedMessage.reminderType],["Rent month",selectedMessage.rentMonth || "—"],["Messages this month",selectedMessage.tenantMessageCountCurrentMonth || 0],["Status",selectedMessage.status],["Due date",formatDate(selectedMessage.dueDate)],["Failure reason",selectedMessage.errorReason || "None"]].map(([label,value]) => <div className="wr-detail" key={label}><div className="wr-detail-label">{label}</div><div className="wr-detail-value">{value}</div></div>)}</div></div></div>}
    </div>
  );
}
