import { useEffect, useMemo, useState } from "react";
import { API } from "../api.js";

const token = () => sessionStorage.getItem("token");

const emptyConfig = {
  isEnabled: false,
  sendArrears: false,
  sendOverdue: false,
  sendUpcoming: false,
  sendAdvancePending: false,
  timeArrears: "09:00",
  timeOverdue: "10:00",
  timeUpcoming: "11:00",
  timeAdvancePending: "12:00",
  lastRunArrears: null,
  lastRunOverdue: null,
  lastRunUpcoming: null,
  lastRunAdvancePending: null,
};

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token()}`,
});

function getMins(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function fmtDateTime(date) {
  if (!date) return "Never run";
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function validateConfig(config) {
  if (!config.isEnabled) return "";
  const active = [];
  if (config.sendArrears) active.push({ name: "Arrears", time: config.timeArrears });
  if (config.sendOverdue) active.push({ name: "Overdue", time: config.timeOverdue });
  if (config.sendUpcoming) active.push({ name: "Upcoming", time: config.timeUpcoming });
  if (config.sendAdvancePending) active.push({ name: "Advance Pending", time: config.timeAdvancePending });

  for (let i = 0; i < active.length; i++) {
    if (!active[i].time) return `${active[i].name} requires a scheduled time.`;
    for (let j = i + 1; j < active.length; j++) {
      let diff = Math.abs(getMins(active[i].time) - getMins(active[j].time));
      if (diff > 12 * 60) diff = 24 * 60 - diff;
      if (diff < 30) return `Keep at least a 30-minute gap between ${active[i].name} and ${active[j].name}.`;
    }
  }
  return "";
}

function ToggleRow({ title, sub, checked, time, lastRun, disabled, onToggle, onTime }) {
  return (
    <div className={`mas-policy ${checked ? "active" : ""}`}>
      <div className="mas-policy-main">
        <div>
          <div className="mas-policy-title">{title}</div>
          <div className="mas-policy-sub">{sub}</div>
        </div>
        <button type="button" className={`mas-switch ${checked ? "on" : ""}`} disabled={disabled} onClick={() => onToggle(!checked)}>
          <span />
        </button>
      </div>
      {checked && (
        <div className="mas-time-row">
          <label>
            <span>Schedule Time</span>
            <input type="time" value={time} disabled={disabled} onChange={(e) => onTime(e.target.value)} />
          </label>
          <div>
            <span>Last Run</span>
            <strong>{fmtDateTime(lastRun)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MasterAutomailSettings() {
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(emptyConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    fetch(`${API}/auto-mail/master/configs`, { headers: authHeaders() })
      .then(async (res) => {
        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error(data.message || "Failed to load owner auto email settings.");
        return data;
      })
      .then((data) => {
        setRows(data);
        if (data[0]?.owner?._id) {
          setSelectedId(data[0].owner._id);
          setDraft({ ...emptyConfig, ...(data[0].config || {}) });
        }
      })
      .catch((err) => setMessage({ type: "error", text: err.message }))
      .finally(() => setLoading(false));
  }, []);

  const selectedRow = rows.find((row) => row.owner._id === selectedId);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(({ owner }) => `${owner.name} ${owner.owner} ${owner.email} ${owner.ph}`.toLowerCase().includes(q));
  }, [rows, search]);

  const setField = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setMessage({ type: "", text: "" });
  };

  const selectOwner = (row) => {
    if (saving) return;
    setSelectedId(row.owner._id);
    setDraft({ ...emptyConfig, ...(row.config || {}) });
    setMessage({ type: "", text: "" });
  };

  const save = async () => {
    const validationError = validateConfig(draft);
    if (validationError) {
      setMessage({ type: "error", text: validationError });
      return;
    }

    setSaving(true);
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch(`${API}/auto-mail/master/configs/${selectedId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Save failed.");

      setRows((prev) => prev.map((row) => (
        row.owner._id === selectedId ? { ...row, config: data.config } : row
      )));
      setDraft({ ...emptyConfig, ...(data.config || {}) });
      setMessage({ type: "success", text: data.message || "Auto email settings saved." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style>{`
        .mas-root { font-family:'Plus Jakarta Sans',sans-serif; min-height:100vh; background:#f8f9fc; padding:28px 24px; }
        .mas-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:22px; flex-wrap:wrap; }
        .mas-head h1 { font-size:23px; margin:0; color:#0f172a; font-weight:800; }
        .mas-head p { margin:4px 0 0; color:#64748b; font-size:13px; }
        .mas-grid { display:grid; grid-template-columns:minmax(270px,360px) minmax(0,1fr); gap:18px; align-items:start; }
        .mas-panel { background:#fff; border:1px solid #e5e7eb; border-radius:14px; box-shadow:0 1px 5px rgba(15,23,42,0.05); overflow:hidden; }
        .mas-list-head { padding:16px; border-bottom:1px solid #eef2f7; }
        .mas-search { width:100%; padding:10px 12px; border:1.5px solid #e2e8f0; border-radius:9px; outline:none; font:inherit; font-size:13px; }
        .mas-search:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,0.12); }
        .mas-owner-list { max-height:calc(100vh - 230px); overflow:auto; }
        .mas-owner { width:100%; border:0; border-bottom:1px solid #f1f5f9; background:#fff; padding:13px 15px; text-align:left; cursor:pointer; display:flex; justify-content:space-between; gap:12px; font:inherit; }
        .mas-owner:hover, .mas-owner.active { background:#eef2ff; }
        .mas-owner-name { font-size:13.5px; font-weight:800; color:#0f172a; }
        .mas-owner-meta { margin-top:2px; color:#64748b; font-size:12px; word-break:break-word; }
        .mas-badge { height:24px; padding:0 9px; border-radius:99px; display:inline-flex; align-items:center; font-size:11px; font-weight:800; flex-shrink:0; }
        .mas-badge.on { background:#dcfce7; color:#15803d; }
        .mas-badge.off { background:#f1f5f9; color:#64748b; }
        .mas-editor { padding:20px; }
        .mas-editor-top { display:flex; justify-content:space-between; gap:14px; align-items:flex-start; padding-bottom:16px; border-bottom:1px solid #eef2f7; margin-bottom:16px; }
        .mas-editor-title { font-size:18px; font-weight:800; color:#0f172a; }
        .mas-editor-sub { color:#64748b; font-size:12.5px; margin-top:3px; }
        .mas-master-toggle { display:flex; align-items:center; gap:10px; padding:10px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; font-size:13px; font-weight:800; color:#334155; }
        .mas-policy { border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; margin-bottom:11px; background:#f8fafc; }
        .mas-policy.active { background:#fff; border-color:#c7d2fe; }
        .mas-policy-main { display:flex; justify-content:space-between; align-items:center; gap:14px; padding:14px; }
        .mas-policy-title { color:#111827; font-size:13.5px; font-weight:800; }
        .mas-policy-sub { color:#64748b; font-size:12px; margin-top:3px; }
        .mas-switch { width:48px; height:26px; border:0; border-radius:99px; background:#cbd5e1; padding:3px; cursor:pointer; flex-shrink:0; transition:background 0.18s; }
        .mas-switch span { display:block; width:20px; height:20px; border-radius:50%; background:#fff; transition:transform 0.18s; box-shadow:0 1px 3px rgba(15,23,42,0.25); }
        .mas-switch.on { background:#6366f1; }
        .mas-switch.on span { transform:translateX(22px); }
        .mas-switch:disabled { opacity:0.55; cursor:not-allowed; }
        .mas-time-row { border-top:1px solid #eef2f7; padding:12px 14px; display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap; }
        .mas-time-row span { display:block; color:#94a3b8; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; }
        .mas-time-row input { height:34px; border:1.5px solid #dbe3ef; border-radius:8px; padding:0 9px; font:inherit; font-size:13px; font-weight:700; }
        .mas-time-row strong { color:#475569; font-size:12px; }
        .mas-actions { display:flex; justify-content:flex-end; align-items:center; gap:12px; margin-top:16px; flex-wrap:wrap; }
        .mas-msg { flex:1; min-width:220px; font-size:12.5px; font-weight:700; padding:10px 12px; border-radius:9px; }
        .mas-msg.success { background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; }
        .mas-msg.error { background:#fef2f2; color:#dc2626; border:1px solid #fecaca; }
        .mas-save { height:40px; padding:0 18px; border:0; border-radius:9px; background:#6366f1; color:#fff; font-size:13px; font-weight:800; cursor:pointer; min-width:130px; }
        .mas-save:disabled { opacity:0.65; cursor:not-allowed; }
        .mas-empty { padding:36px 18px; text-align:center; color:#94a3b8; font-size:13px; }
        @media (max-width: 860px) { .mas-grid { grid-template-columns:1fr; } .mas-owner-list { max-height:360px; } }
      `}</style>

      <div className="mas-root">
        <div className="mas-head">
          <div>
            <h1>Auto Email Setup</h1>
            <p>Manage each owner's automatic rent reminder settings from the master admin.</p>
          </div>
        </div>

        <div className="mas-grid">
          <div className="mas-panel">
            <div className="mas-list-head">
              <input className="mas-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search owners by name, email or phone..." />
            </div>
            <div className="mas-owner-list">
              {loading && <div className="mas-empty">Loading owners...</div>}
              {!loading && filtered.length === 0 && <div className="mas-empty">No owners found.</div>}
              {filtered.map((row) => (
                <button key={row.owner._id} className={`mas-owner ${row.owner._id === selectedId ? "active" : ""}`} onClick={() => selectOwner(row)}>
                  <div>
                    <div className="mas-owner-name">{row.owner.owner || row.owner.name}</div>
                    <div className="mas-owner-meta">{row.owner.email}</div>
                    <div className="mas-owner-meta">{row.owner.ph}</div>
                  </div>
                  <span className={`mas-badge ${row.config?.isEnabled ? "on" : "off"}`}>{row.config?.isEnabled ? "Enabled" : "Off"}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mas-panel">
            {!selectedRow ? (
              <div className="mas-empty">Select an owner to manage auto email setup.</div>
            ) : (
              <div className="mas-editor">
                <div className="mas-editor-top">
                  <div>
                    <div className="mas-editor-title">{selectedRow.owner.owner || selectedRow.owner.name}</div>
                    <div className="mas-editor-sub">{selectedRow.owner.email} · {selectedRow.owner.ph}</div>
                  </div>
                  <div className="mas-master-toggle">
                    <span>Enable Automations</span>
                    <button type="button" className={`mas-switch ${draft.isEnabled ? "on" : ""}`} onClick={() => setField("isEnabled", !draft.isEnabled)}>
                      <span />
                    </button>
                  </div>
                </div>

                <ToggleRow
                  title="Previous Arrears"
                  sub="Tenants with past unpaid months"
                  checked={draft.sendArrears}
                  time={draft.timeArrears}
                  lastRun={draft.lastRunArrears}
                  disabled={!draft.isEnabled}
                  onToggle={(v) => setField("sendArrears", v)}
                  onTime={(v) => setField("timeArrears", v)}
                />
                <ToggleRow
                  title="Current Overdue"
                  sub="Current month payment has crossed due date"
                  checked={draft.sendOverdue}
                  time={draft.timeOverdue}
                  lastRun={draft.lastRunOverdue}
                  disabled={!draft.isEnabled}
                  onToggle={(v) => setField("sendOverdue", v)}
                  onTime={(v) => setField("timeOverdue", v)}
                />
                <ToggleRow
                  title="Upcoming / Due"
                  sub="Rent is due today or in the next 5 days"
                  checked={draft.sendUpcoming}
                  time={draft.timeUpcoming}
                  lastRun={draft.lastRunUpcoming}
                  disabled={!draft.isEnabled}
                  onToggle={(v) => setField("sendUpcoming", v)}
                  onTime={(v) => setField("timeUpcoming", v)}
                />
                <ToggleRow
                  title="Advance Payment Pending"
                  sub="Tenants whose rent dues are clear and only advance is pending"
                  checked={draft.sendAdvancePending}
                  time={draft.timeAdvancePending}
                  lastRun={draft.lastRunAdvancePending}
                  disabled={!draft.isEnabled}
                  onToggle={(v) => setField("sendAdvancePending", v)}
                  onTime={(v) => setField("timeAdvancePending", v)}
                />

                <div className="mas-actions">
                  {message.text && <div className={`mas-msg ${message.type}`}>{message.text}</div>}
                  <button className="mas-save" disabled={saving} onClick={save}>
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
