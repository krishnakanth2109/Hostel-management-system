import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

// Regular pages
import LoginPage          from "./pages/LoginPage";
import RegisterPage       from "./pages/RegisterPage";
import Dashboard          from "./pages/Dashboard";
import AddHostel          from "./pages/Addhostel";
import AddCandidate       from "./pages/Addcandidate";
import Overview           from "./pages/Overview";

// Master pages
import MasterDashboard    from "./pages/master/MasterDashboard";
import MasterUsers        from "./pages/master/MasterUsers";

// ── NEW: public tenant self-registration page ─────────────────────────────
import TenantRegisterPage from "./pages/TenantRegisterPage.jsx";

// Layouts
import Layout             from "./components/Layout";
import MasterLayout       from "./components/MasterLayout";
import RentManagement from "./pages/Rentmanagement.jsx";
import ManageLogins from "./pages/master/Managelogins.jsx";
import TenantOnboardingForm from "./pages/Tenantonboardingform.jsx";
import OnboardingManager from "./pages/Onboardingmanager.jsx";
import CandidatesManagement from "./pages/Candidatesmanagement.jsx";
import ActivityLogs from "./pages/ActivityLogs.jsx";
import MasterPlanSettings from "./pages/master/Masterplansettings.jsx";
import MasterApprovals from "./pages/master/Masterapprovals.jsx";
import LandingPage from "./pages/Landingpage.jsx";
import MasterPlanMonitor from "./pages/master/Masterplanmonitor.jsx";
import AutoMailSettings from "./pages/Automailsettings.jsx";
import MasterAutomailSettings from "./pages/master/MasterAutomailSettings.jsx";
import PublicTenantRentDetails from "./pages/PublicTenantRentDetails.jsx";
import PaymentRequests from "./pages/PaymentRequests.jsx";
import PrivacyPolicy from "./pages/PrivacyPolicy.jsx";

const HOME_SEO = {
  title: "NILAYAM Hostel Management Software | Hostel & PG Management",
  description:
    "NILAYAM is hostel management software for Indian hostel and PG owners to manage tenants, rooms, beds, rent payments, dues, reports, reminders and daily operations.",
  canonical: "https://nilayamhostelmanagement.in.net/",
  robots: "index, follow, max-image-preview:large",
  siteName: "NILAYAM",
};

const NOINDEX_SEO = {
  title: "NILAYAM Hostel Management",
  description: HOME_SEO.description,
  canonical: HOME_SEO.canonical,
  robots: "noindex, nofollow",
};

const PRIVACY_POLICY_SEO = {
  title: "Privacy Policy | NILAYAM",
  description:
    "Read the NILAYAM Privacy Policy for hostel and PG management services, including how account, tenant, rent, document and notification information may be handled.",
  canonical: "https://nilayamhostelmanagement.in.net/privacy-policy",
  robots: "index, follow",
  siteName: "NILAYAM",
};

function setMeta(name, content, attr = "name") {
  let tag = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function RouteSeo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const seo =
      pathname === "/"
        ? HOME_SEO
        : pathname === "/privacy-policy"
          ? PRIVACY_POLICY_SEO
          : NOINDEX_SEO;
    document.title = seo.title;
    setMeta("description", seo.description);
    setMeta("robots", seo.robots);
    setMeta("og:title", seo.title, "property");
    setMeta("og:description", seo.description, "property");
    setMeta("og:site_name", seo.siteName || "NILAYAM", "property");
    setMeta("twitter:title", seo.title);
    setMeta("twitter:description", seo.description);

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", seo.canonical);
  }, [pathname]);

  return null;
}

// ── Auth guards ───────────────────────────────────────────────────────────────
function RequireUser({ children }) {
  const user  = JSON.parse(sessionStorage.getItem("user")  || "{}");
  const token = sessionStorage.getItem("token");
  if (!token || !user?.id)          return <Navigate to="/login"            replace />;
  if (user.role === "master")       return <Navigate to="/master/dashboard" replace />;
  return children;
}

function RequireMaster({ children }) {
  const user  = JSON.parse(sessionStorage.getItem("user")  || "{}");
  const token = sessionStorage.getItem("token");
  if (!token || !user?.id)          return <Navigate to="/login"     replace />;
  if (user.role !== "master")       return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <>
    <RouteSeo />
    <Routes>


      {/* ── Public ─────────────────────────────────────────────────────── */}
       <Route path="/"    element={<LandingPage/>} />
      <Route path="/login"    element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/tenant-onboarding" element={<TenantOnboardingForm />} />
      {/* ── Tenant self-registration (no auth — uses link token in URL) ── */}
      {/* Owner shares: http://yourapp/tenant-register/<JWT>               */}
      <Route path="/tenant-register/:token" element={<TenantOnboardingForm />} />
      <Route path="/tenant/rent/:secureId" element={<PublicTenantRentDetails />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />

      {/* ── Regular user routes wrapped in Layout ──────────────────────── */}
      <Route path="/dashboard" element={
        <RequireUser><Layout><Dashboard /></Layout></RequireUser>
      } />
      <Route path="/overview" element={
        <RequireUser><Layout><Overview /></Layout></RequireUser>
      } />
      <Route path="/addhostel" element={
        <RequireUser><Layout><AddHostel /></Layout></RequireUser>
      } />
      <Route path="/addcandidate" element={
        <RequireUser><Layout><AddCandidate /></Layout></RequireUser>
      } />
            <Route path="/candidates" element={
        <RequireUser><Layout><CandidatesManagement/></Layout></RequireUser>
      } />
    <Route path="/rent-management" element={
        <RequireUser><Layout><RentManagement/></Layout></RequireUser>
      } />
          <Route path="/onboarding-manager" element={
        <RequireUser><Layout><OnboardingManager/></Layout></RequireUser>
      } />
                <Route path="/activity-logs" element={
        <RequireUser><Layout><ActivityLogs/></Layout></RequireUser>
      } />
                    <Route path="/automail-settings" element={
        <RequireUser><Layout><AutoMailSettings/></Layout></RequireUser>
      } />
                    <Route path="/payment-requests" element={
        <RequireUser><Layout><PaymentRequests/></Layout></RequireUser>
      } />

      {/* ── Master routes wrapped in MasterLayout ──────────────────────── */}
      <Route path="/master/dashboard" element={
        <RequireMaster><MasterLayout><MasterDashboard /></MasterLayout></RequireMaster>
      } />
      <Route path="/master/users" element={
        <RequireMaster><MasterLayout><MasterUsers /></MasterLayout></RequireMaster>
      } />
          <Route path="/master/logins" element={
        <RequireMaster><MasterLayout><ManageLogins /></MasterLayout></RequireMaster>
      } />
            <Route path="/master/plan-settings" element={
        <RequireMaster><MasterLayout><MasterPlanSettings /></MasterLayout></RequireMaster>
      } />
            <Route path="/master/approvals" element={
        <RequireMaster><MasterLayout><MasterApprovals /></MasterLayout></RequireMaster>
      } />
                  <Route path="/master/plan-monitor" element={
        <RequireMaster><MasterLayout><MasterPlanMonitor /></MasterLayout></RequireMaster>
      } />
                  <Route path="/master/automail-settings" element={
        <RequireMaster><MasterLayout><MasterAutomailSettings /></MasterLayout></RequireMaster>
      } />

      {/* ── Fallback ───────────────────────────────────────────────────── */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </>
  );
}
