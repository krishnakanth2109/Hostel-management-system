// RegisterPage.jsx — updated with plan-aware registration
import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { API } from "../api.js";
import appLogo from "../assets/app-logo-transparent.png";
import loginHome from "../assets/loginhome.png";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", owner: "", ph: "", email: "", password: "", address: "" });
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [focused,  setFocused]  = useState("");
  const [showPass, setShowPass] = useState(false);
  const [mounted,  setMounted]  = useState(false);
  const [pending,  setPending]  = useState(false);

  const navigate  = useNavigate();
  const location  = useLocation();
  const chosenPlan = location.state?.plan || null;  // plan passed from landing page

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  const set = (k) => (e) => {
    let value = e.target.value;
    if (k === "ph") value = value.replace(/\D/g, "").slice(0, 10);
    if (k === "name" || k === "owner") value = value.replace(/[^a-zA-Z\s]/g, "");
    setForm({ ...form, [k]: value });
    setError("");
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    const { name, owner, ph, email, password, address } = form;
    if (!name || !owner || !ph || !email || !password || !address)
      return setError("All fields are required.");
    if (!/^[a-zA-Z\s]+$/.test(name.trim()))
      return setError("Property / Hostel Name should contain alphabets only.");
    if (!/^[a-zA-Z\s]+$/.test(owner.trim()))
      return setError("Owner Name should contain alphabets only.");
    if (!/^\d{10}$/.test(ph.trim()))
      return setError("Phone number must be exactly 10 digits.");
    if (!/\S+@\S+\.\S+/.test(email))
      return setError("Please enter a valid email address.");
    if (password.length < 6)
      return setError("Password must be at least 6 characters.");

    setError(""); setLoading(true);
    try {
      const body = { name: name.trim(), owner: owner.trim(), ph: ph.trim(), email: email.trim().toLowerCase(), password, address: address.trim() };
      if (chosenPlan) body.planId = chosenPlan._id;

      const res  = await fetch(`${API}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) return setError(data.message || "Registration failed.");

      if (data.pending) {
        setPending(true);
        return;
      }

      if (data.token && data.user) {
        sessionStorage.setItem("token", data.token);
        sessionStorage.setItem("user",  JSON.stringify(data.user));
        navigate(data.user.role === "master" ? "/master/dashboard" : "/dashboard", { replace: true });
      } else {
        navigate("/login", { replace: true });
      }
    } catch {
      setError("Cannot connect to server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  // ── Pending approval screen ───────────────────────────────────────────────
  if (pending) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          .pend-root { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8f9fc; font-family: 'Plus Jakarta Sans', sans-serif; padding: 24px; }
          .pend-card { background: #fff; border-radius: 20px; border: 2px solid #fde68a; box-shadow: 0 12px 40px rgba(0,0,0,0.08); padding: 48px 36px; max-width: 480px; width: 100%; text-align: center; animation: pend-in 0.5s cubic-bezier(0.16,1,0.3,1); }
          @keyframes pend-in { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
          .pend-icon { font-size: 56px; margin-bottom: 20px; }
          .pend-title { font-size: 22px; font-weight: 800; color: #92400e; margin-bottom: 12px; }
          .pend-body { font-size: 14px; color: #78350f; line-height: 1.75; margin-bottom: 24px; }
          .pend-plan { display: inline-flex; align-items: center; gap: 8px; background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 10px; padding: 10px 20px; font-size: 13.5px; font-weight: 700; color: #b45309; margin-bottom: 28px; }
          .pend-link { display: inline-block; padding: 11px 28px; border-radius: 10px; background: linear-gradient(135deg,#4f46e5,#6366f1); color: #fff; font-size: 14px; font-weight: 700; text-decoration: none; box-shadow: 0 4px 14px rgba(79,70,229,0.3); }
          .pend-sub { font-size: 12.5px; color: #94a3b8; margin-top: 16px; }
        `}</style>
        <div className="pend-root">
          <div className="pend-card">
            <div className="pend-icon">⏳</div>
            <div className="pend-title">Registration Successful!</div>
            <p className="pend-body">
              Your account has been created and is currently <strong>awaiting approval</strong> from the Nilayam admin team.
              We will review your registration and respond shortly.
            </p>
            {chosenPlan && (
              <div className="pend-plan">📋 Plan: {chosenPlan.name} — ₹{chosenPlan.price.toLocaleString("en-IN")}</div>
            )}
            <Link to="/login" className="pend-link">Go to Login →</Link>
            <p className="pend-sub">Once approved, you'll be able to sign in and start managing your hostel.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .rp-root { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; padding: 42px 20px 24px; font-family: 'Plus Jakarta Sans', sans-serif; background: linear-gradient(135deg,#f4faf9 0%,#eef6f7 50%,#f8fbfb 100%); color: #102033; }

        .rp-shell { width: min(100%,1000px); min-height: 620px; display: grid; grid-template-columns: minmax(0,1fr) minmax(390px,1fr); background: rgba(255,255,255,.72); border: 1px solid rgba(192,211,211,.62); border-radius: 18px; overflow: hidden; box-shadow: 0 24px 62px rgba(39,74,82,.11); }
        .rp-left { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 20px; min-height: 620px; padding: 64px 44px 28px; position: relative; overflow: hidden; background: linear-gradient(145deg,rgba(232,245,244,.82),rgba(246,251,250,.9)); text-align: center; }
        .rp-left::before,.rp-left::after { content: none; }
        .rp-blob1,.rp-blob2,.rp-steps,.rp-plan-banner,.rp-progress { display: none; }
        .rp-brand { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
        .rp-brand-icon { width: 126px; height: 78px; display: flex; align-items: center; justify-content: center; }
        .rp-brand-logo { width: 122px; max-height: 76px; object-fit: contain; display: block; }
        .rp-brand-name { display: none; }
        .rp-brand-lockup { display: flex; flex-direction: column; align-items: center; gap: 2px; line-height: 1; }
        .rp-brand-title { font-size: 28px; font-weight: 800; color: #13223a; letter-spacing: 0; }
        .rp-brand-subtitle { font-size: 8px; font-weight: 700; color: #5f6f78; letter-spacing: .18em; text-transform: uppercase; }
        .rp-left-mid { position: relative; z-index: 1; margin-top: 2px; }
        .rp-left-mid h2 { font-size: 32px; font-weight: 800; color: #13223a; line-height: 1.18; margin-bottom: 12px; }
        .rp-left-mid p  { font-size: 15px; font-style: italic; font-weight: 400; color: #65717b; line-height: 1.65; }
        .rp-illustration-wrap { position: relative; z-index: 1; width: 100%; display: flex; justify-content: center; margin-top: 58px; }
        .rp-illustration { width: min(100%,380px); max-height: 220px; object-fit: contain; filter: drop-shadow(0 18px 22px rgba(43,113,117,.13)); }
        .rp-left-support { position: relative; z-index: 1; margin-top: 12px; text-align: center; font-size: 15px; color: #707982; display: flex; align-items: center; justify-content: center; gap: 10px; font-style: italic; line-height: 1.45; flex-wrap: wrap; }
        .rp-left-support svg { color: #7d858c; flex-shrink: 0; }
        .rp-left-support a { color: #2c8688; font-weight: 700; text-decoration: none; }
        .rp-left-support a:hover { text-decoration: underline; }

        .rp-right { display: flex; align-items: center; justify-content: center; padding: 40px 48px; background: rgba(255,255,255,.92); border-left: 1px solid rgba(214,226,226,.72); overflow-y: auto; }
        .rp-card { width: 100%; max-width: 405px; opacity: 0; transform: translateY(16px); transition: opacity 0.5s cubic-bezier(0.16,1,0.3,1), transform 0.5s cubic-bezier(0.16,1,0.3,1); }
        .rp-card.in { opacity: 1; transform: translateY(0); }

        .rp-mob-brand { display: flex; flex-direction: column; align-items: center; gap: 5px; margin-bottom: 24px; text-align: center; }
        @media (min-width: 901px) { .rp-mob-brand { display: none; } }
        .rp-mob-brand-icon { width: 88px; height: 58px; background: transparent; border-radius: 0; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .rp-mob-brand-logo { width: 86px; max-height: 56px; object-fit: contain; display: block; }
        .rp-mob-brand-name { display: none; }
        .rp-mob-brand .rp-brand-title { font-size: 26px; }
        .rp-mob-brand .rp-brand-subtitle { font-size: 7.5px; letter-spacing: .17em; }

        /* Selected plan pill (mobile / top of form) */
        .rp-plan-pill { display: inline-flex; align-items: center; gap: 8px; background: #eefbf9; border: 1px solid #bfe2df; border-radius: 10px; padding: 8px 14px; font-size: 13px; font-weight: 700; color: #2c8688; margin-bottom: 18px; }
        .rp-plan-pill-free { background: #ecfdf5; border-color: #a7f3d0; color: #059669; }

        .rp-hd { display: none; }

        .rp-form { display: flex; flex-direction: column; gap: 17px; }
        .rp-grid-2 { display: grid; grid-template-columns: 1fr; gap: 17px; }
        .rp-field { display: flex; flex-direction: column; gap: 9px; }
        .rp-lbl { font-size: 15px; font-weight: 600; color: #142337; transition: color 0.2s; }
        .rp-lbl.on { color: #2e8f91; }
        .rp-iw { position: relative; }
        .rp-field-icon { position: absolute; left: 18px; top: 50%; transform: translateY(-50%); width: 19px; height: 19px; color: #7c878f; display: flex; align-items: center; justify-content: center; pointer-events: none; }
        .rp-field-icon.top { top: 18px; transform: none; }
        .rp-inp { width: 100%; height: 48px; padding: 0 50px 0 54px; font-size: 14px; font-family: 'Plus Jakarta Sans', sans-serif; color: #142337; background: #fff; border: 1px solid #dfe5e7; border-radius: 10px; outline: none; transition: border-color 0.2s, box-shadow 0.2s; -webkit-appearance: none; box-shadow: inset 0 1px 2px rgba(16,32,51,.025); }
        .rp-inp::placeholder { color: #9ca7b1; }
        .rp-inp:focus { border-color: #76b8ba; box-shadow: 0 0 0 4px rgba(57,151,153,0.11); }
        .rp-inp.err { border-color: #fca5a5; }
        .rp-eye-btn { position: absolute; right: 18px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #7c878f; display: flex; align-items: center; padding: 2px; transition: color 0.2s; }
        .rp-eye-btn:hover { color: #2e8f91; }
        .rp-textarea { width: 100%; padding: 14px 16px 14px 54px; font-size: 14px; font-family: 'Plus Jakarta Sans', sans-serif; color: #142337; background: #fff; border: 1px solid #dfe5e7; border-radius: 10px; outline: none; resize: vertical; min-height: 78px; transition: border-color 0.2s, box-shadow 0.2s; box-shadow: inset 0 1px 2px rgba(16,32,51,.025); }
        .rp-textarea::placeholder { color: #9ca7b1; }
        .rp-textarea:focus { border-color: #76b8ba; box-shadow: 0 0 0 4px rgba(57,151,153,0.11); }
        .rp-textarea.err { border-color: #fca5a5; }
        .rp-err { display: flex; align-items: center; gap: 8px; padding: 10px 13px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 9px; font-size: 12.5px; color: #e11d48; }
        .rp-btn { width: 100%; height: 58px; padding: 0 18px; font-size: 17px; font-weight: 700; font-family: 'Plus Jakarta Sans', sans-serif; color: #fff; background: linear-gradient(135deg,#5aaeb0 0%,#3f999b 100%); border: none; border-radius: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 9px 18px rgba(50,133,135,0.24); transition: transform 0.18s, box-shadow 0.18s; margin-top: 4px; }
        .rp-btn:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 12px 24px rgba(50,133,135,0.3); }
        .rp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .rp-spin { width: 15px; height: 15px; border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff; border-radius: 50%; animation: rp-rot 0.65s linear infinite; }
        @keyframes rp-rot { to { transform: rotate(360deg); } }
        .rp-foot { margin-top: 22px; text-align: center; font-size: 15px; color: #2b3440; }
        .rp-foot a { color: #2c8688; font-weight: 700; text-decoration: none; }
        .rp-foot a:hover { text-decoration: underline; }
        .rp-support-divider { display: flex; align-items: center; gap: 12px; margin: 20px 0 0; }
        .rp-support-divider::before,.rp-support-divider::after { content: ""; flex: 1; height: 1px; background: #e6eaec; }
        .rp-support { margin-top: 18px; text-align: center; font-size: 15px; color: #707982; display: flex; align-items: center; justify-content: center; gap: 10px; font-style: italic; line-height: 1.45; flex-wrap: wrap; }
        .rp-support svg { color: #7d858c; flex-shrink: 0; }
        .rp-support a { color: #2c8688; font-weight: 700; text-decoration: none; }
        .rp-support a:hover { text-decoration: underline; }

        /* Paid plan note */
        .rp-paid-note { display: flex; align-items: flex-start; gap: 10px; background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 10px; padding: 12px 14px; font-size: 12.5px; color: #92400e; line-height: 1.6; }
        .rp-copyright { color: #8b949b; font-size: 13px; }

        @media (max-width: 900px) {
          .rp-root { padding: 22px 16px 18px; justify-content: flex-start; gap: 16px; }
          .rp-shell { grid-template-columns: 1fr; min-height: 0; max-width: 520px; background: transparent; border: 0; box-shadow: none; overflow: visible; }
          .rp-left { display: none; }
          .rp-left-support { display: none; }
          .rp-right { border-left: 0; padding: 24px 22px; background: #fff; border: 1px solid rgba(214,226,226,.86); border-radius: 18px; box-shadow: 0 16px 38px rgba(39,74,82,.11); }
          .rp-card { max-width: 100%; }
          .rp-hd { display: block; margin-bottom: 22px; text-align: center; }
          .rp-hd h1 { font-size: 25px; font-weight: 800; color: #13223a; margin-bottom: 8px; }
          .rp-hd p { color: #65717b; font-size: 14px; line-height: 1.45; }
          .rp-form,.rp-grid-2 { gap: 16px; }
          .rp-lbl { font-size: 14px; }
          .rp-copyright { font-size: 12px; text-align: center; line-height: 1.4; padding: 0 8px; }
        }

        @media (max-width: 520px) {
          .rp-root { padding: 14px 12px 16px; gap: 14px; }
          .rp-right { padding: 20px 16px; border-radius: 16px; }
          .rp-mob-brand { margin-bottom: 18px; }
          .rp-mob-brand-icon { width: 76px; height: 48px; }
          .rp-mob-brand-logo { width: 74px; max-height: 48px; }
          .rp-mob-brand .rp-brand-title { font-size: 23px; }
          .rp-hd { margin-bottom: 18px; }
          .rp-hd h1 { font-size: 23px; }
          .rp-inp,.rp-btn { height: 52px; }
          .rp-inp { padding-left: 50px; padding-right: 46px; }
          .rp-field-icon { left: 17px; width: 18px; height: 18px; }
          .rp-eye-btn { right: 17px; }
          .rp-foot,.rp-support { font-size: 14px; }
          .rp-support svg { width: 17px; height: 17px; }
        }

        @media (max-width: 340px) {
          .rp-root { padding-left: 10px; padding-right: 10px; }
          .rp-right { padding: 18px 13px; }
          .rp-form,.rp-grid-2 { gap: 14px; }
          .rp-inp { padding-left: 46px; padding-right: 42px; font-size: 13.5px; }
          .rp-foot,.rp-support { font-size: 13px; }
        }
      `}</style>

      <div className="rp-root">
        <div className="rp-shell">
        {/* Left panel */}
        <div className="rp-left">
          <div className="rp-blob1" /><div className="rp-blob2" />
          <div className="rp-brand">
            <div className="rp-brand-icon"><img src={appLogo} alt="Nilayam logo" className="rp-brand-logo" /></div>
            <div className="rp-brand-lockup" aria-hidden="true">
              <div className="rp-brand-title">Nilayam</div>
              <div className="rp-brand-subtitle">Hostel Management</div>
            </div>
            <span className="rp-brand-name">Nilayam Hostel Management</span>
          </div>
          <div className="rp-left-mid"><h2>Create Your Account</h2><p>Join Nilayam and manage your hostel efficiently</p></div>
          <div className="rp-illustration-wrap">
            <img src={loginHome} alt="" className="rp-illustration" />
          </div>
          <div className="rp-left-support">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" viewBox="0 0 24 24"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v5Z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v5Z"/></svg>
            <span>Need help? <a href="https://wa.me/919515174064?text=Hello%20Nilayam%20Support%2C%20I%20need%20help%20with%20my%20login%2Faccount.%20Please%20assist%20me." target="_blank" rel="noopener noreferrer">Contact App Support</a></span>
          </div>

          {chosenPlan && (
            <div className="rp-plan-banner">
              <div className="rp-plan-banner-lbl">Selected Plan</div>
              <div className="rp-plan-banner-name">{chosenPlan.name}</div>
              <div className="rp-plan-banner-price">
                {chosenPlan.isFree ? "Free • Instant access" : `₹${chosenPlan.price.toLocaleString("en-IN")} • ${chosenPlan.days} days • ${chosenPlan.beds} beds`}
              </div>
            </div>
          )}

          <div className="rp-steps">
            {[
              { n: "1", h: "Create your account",    p: "Enter your property and contact details" },
              { n: "2", h: "Set up your rooms",      p: "Add beds, floors, and pricing" },
              { n: "3", h: "Onboard tenants",        p: "Add tenants and collect rent digitally" },
            ].map(s => (
              <div className="rp-step" key={s.n}>
                <div className="rp-step-num">{s.n}</div>
                <div className="rp-step-body"><h4>{s.h}</h4><p>{s.p}</p></div>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div className="rp-right">
          <div className={`rp-card ${mounted ? "in" : ""}`}>
            <div className="rp-mob-brand">
              <div className="rp-mob-brand-icon"><img src={appLogo} alt="Nilayam logo" className="rp-mob-brand-logo" /></div>
              <div className="rp-brand-lockup" aria-hidden="true">
                <div className="rp-brand-title">Nilayam</div>
                <div className="rp-brand-subtitle">Hostel Management</div>
              </div>
              <span className="rp-mob-brand-name">Nilayam Hostel Management</span>
            </div>

            {/* Plan pill */}
            {chosenPlan && (
              <div className={`rp-plan-pill ${chosenPlan.isFree ? "rp-plan-pill-free" : ""}`}>
                {chosenPlan.isFree ? "✅" : "📋"} {chosenPlan.name}
                {chosenPlan.isFree ? " — Free" : ` — ₹${chosenPlan.price.toLocaleString("en-IN")}`}
              </div>
            )}

            {/* Progress */}
            <div className="rp-progress">
              {[...Array(6)].map((_, i) => {
                const filled = [form.name, form.owner, form.ph, form.email, form.password, form.address][i];
                return <div key={i} className={`rp-pdot ${filled ? "done" : ""}`} style={{ flex: 1 }} />;
              })}
            </div>

            <div className="rp-hd">
              <h1>Create your account ✨</h1>
              <p>Fill in your property details to get started</p>
            </div>

            <form className="rp-form" onSubmit={handleRegister}>
              <div className="rp-grid-2">
                <div className="rp-field">
                  <label className={`rp-lbl ${focused === "name" ? "on" : ""}`}>Property / Hostel Name</label>
                  <div className="rp-iw">
                    <span className="rp-field-icon" aria-hidden="true">
                      <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1"/></svg>
                    </span>
                    <input className={`rp-inp ${error ? "err" : ""}`} value={form.name} onChange={set("name")} onFocus={() => setFocused("name")} onBlur={() => setFocused("")} placeholder="Enter property or hostel name" autoFocus />
                  </div>
                </div>
                <div className="rp-field">
                  <label className={`rp-lbl ${focused === "owner" ? "on" : ""}`}>Owner Name</label>
                  <div className="rp-iw">
                    <span className="rp-field-icon" aria-hidden="true">
                      <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
                    </span>
                    <input className={`rp-inp ${error ? "err" : ""}`} value={form.owner} onChange={set("owner")} onFocus={() => setFocused("owner")} onBlur={() => setFocused("")} placeholder="Enter owner name" />
                  </div>
                </div>
              </div>
              <div className="rp-grid-2">
                <div className="rp-field">
                  <label className={`rp-lbl ${focused === "ph" ? "on" : ""}`}>Phone</label>
                  <div className="rp-iw">
                    <span className="rp-field-icon" aria-hidden="true">
                      <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.62 2.6a2 2 0 0 1-.45 2.11L8 9.71a16 16 0 0 0 6.29 6.29l1.27-1.27a2 2 0 0 1 2.11-.45c.83.29 1.7.5 2.6.62A2 2 0 0 1 22 16.92Z"/></svg>
                    </span>
                    <input type="tel" inputMode="numeric" maxLength={10} className={`rp-inp ${error ? "err" : ""}`} value={form.ph} onChange={set("ph")} onFocus={() => setFocused("ph")} onBlur={() => setFocused("")} placeholder="Enter phone number" />
                  </div>
                </div>
                <div className="rp-field">
                  <label className={`rp-lbl ${focused === "email" ? "on" : ""}`}>Email</label>
                  <div className="rp-iw">
                    <span className="rp-field-icon" aria-hidden="true">
                      <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
                    </span>
                    <input type="email" className={`rp-inp ${error ? "err" : ""}`} value={form.email} onChange={set("email")} onFocus={() => setFocused("email")} onBlur={() => setFocused("")} placeholder="Enter email address" autoComplete="email" />
                  </div>
                </div>
              </div>
              <div className="rp-field">
                <label className={`rp-lbl ${focused === "password" ? "on" : ""}`}>Password</label>
                <div className="rp-iw">
                  <span className="rp-field-icon" aria-hidden="true">
                    <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><path d="M12 15v2"/></svg>
                  </span>
                  <input type={showPass ? "text" : "password"} className={`rp-inp ${error ? "err" : ""}`} value={form.password} onChange={set("password")} onFocus={() => setFocused("password")} onBlur={() => setFocused("")} placeholder="Create a password" autoComplete="new-password" />
                  <button type="button" className="rp-eye-btn" onClick={() => setShowPass(p => !p)} tabIndex={-1}>
                    {showPass
                      ? <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>
              <div className="rp-field">
                <label className={`rp-lbl ${focused === "address" ? "on" : ""}`}>Address</label>
                <div className="rp-iw">
                  <span className="rp-field-icon top" aria-hidden="true">
                    <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                  </span>
                  <textarea className={`rp-textarea ${error ? "err" : ""}`} value={form.address} onChange={set("address")} onFocus={() => setFocused("address")} onBlur={() => setFocused("")} placeholder="Enter complete address" />
                </div>
              </div>

              {/* Paid plan note */}
              {chosenPlan && !chosenPlan.isFree && (
                <div className="rp-paid-note">
                  ⏳ <span>After registering with the <strong>{chosenPlan.name}</strong> plan, your account will go into a <strong>pending state</strong> and require admin approval before you can log in.</span>
                </div>
              )}

              {error && (
                <div className="rp-err">
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {error}
                </div>
              )}

              <button type="submit" className="rp-btn" disabled={loading}>
                {loading && <div className="rp-spin" />}
                {loading ? "Creating account…" : "Create account →"}
              </button>
            </form>

            <p className="rp-foot">Already have an account? <Link to="/login">Sign in</Link></p>
          </div>
        </div>
        </div>
        <div className="rp-copyright">&copy; 2025 Nilayam Hostel Management. All rights reserved.</div>
      </div>
    </>
  );
}
