import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import aboutImage from "../assets/aboutimg.png";
import appLogo from "../assets/app-logo-transparent.png";
import chooseVideo from "../assets/choosevideo.mp4";
import heroSectionVideo from "../assets/herosectionvideo.mp4";
import mobileApp1 from "../assets/mobileapp1.png";
import mobileApp2 from "../assets/mobileapp2.png";
import mobileApp3 from "../assets/mobileapp3.png";
import { API } from "../api.js";
import { useNavigate } from "react-router-dom";

const APP_DOWNLOAD_URL = "https://drive.google.com/file/d/1ENS7y9i-ucrFNY5ySZ4LbkFTwEb9WzCm/view?usp=drivesdk";
const MOBILE_APP_IMAGES = [mobileApp1, mobileApp2, mobileApp3];
const NAV = [
  { label: "Home", href: "#home" },
  { label: "About", href: "#about" },
  { label: "Features", href: "#features" },
  { label: "Why Nilayam", href: "#why" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
];

const FEATURES = [
  { icon: "🏢", title: "Building & Property Management", desc: "Manage multiple hostel buildings and organize floors, rooms, and beds from a centralized platform." },
  { icon: "🛏️", title: "Room & Bed Allocation", desc: "Create rooms, define bed capacity, and allocate available beds. See what's occupied, available, or partial." },
  { icon: "👥", title: "Tenant Management", desc: "Maintain organized tenant profiles and easily track who is staying in which room and bed." },
  { icon: "💰", title: "Rent Management", desc: "Track monthly rent payments and monitor the payment status of every tenant." },
  { icon: "💳", title: "Payment Request & Approval", desc: "Tenants submit payment requests; owners review, approve and keep a clear payment history." },
  { icon: "📌", title: "Pending & Overdue Dues", desc: "Clear view of pending and overdue payments so you never lose track of outstanding rent." },
  { icon: "📱", title: "WhatsApp Rent Reminders", desc: "Send rent reminders through WhatsApp and cut down manual monthly follow-ups." },
  { icon: "🔔", title: "Smart Notifications", desc: "Stay updated with timely notifications about payments, reminders, and important events." },
  { icon: "📊", title: "Reports & Analytics", desc: "Understand your hostel performance with clear reports on tenants, rooms and rent collection." },
  { icon: "📈", title: "Owner Dashboard", desc: "A complete overview of tenants, rooms, rent collection, dues and key metrics at a glance." },
  { icon: "🔐", title: "Secure & Reliable", desc: "Keep management information organized with a secure, reliable digital platform." },
  { icon: "🌐", title: "Web & Mobile Access", desc: "Manage your hostel through a modern web experience and mobile app, anywhere." },
];

const EXPLORER = [
  {
    key: "rent",
    icon: "💰",
    title: "Rent Management",
    tagline: "Track every rent payment with confidence.",
    stats: [
      { label: "Paid", value: "82", tone: "good" },
      { label: "Pending", value: "24", tone: "warn" },
      { label: "Overdue", value: "14", tone: "bad" },
    ],
  },
  {
    key: "rooms",
    icon: "🛏️",
    title: "Room & Bed Allocation",
    tagline: "Know exactly where every tenant is staying.",
    stats: [
      { label: "Building", value: "3", tone: "good" },
      { label: "Floors", value: "12", tone: "good" },
      { label: "Rooms", value: "45", tone: "good" },
      { label: "Occupied", value: "108/135", tone: "warn" },
    ],
  },
  {
    key: "reports",
    icon: "📊",
    title: "Reports & Analytics",
    tagline: "Turn data into decisions.",
    stats: [
      { label: "Rent Collected", value: "₹1.76L", tone: "good" },
      { label: "Monthly Revenue", value: "₹2.45L", tone: "good" },
      { label: "Pending Dues", value: "₹68.5K", tone: "warn" },
      { label: "Occupancy", value: "80%", tone: "good" },
    ],
  },
  {
    key: "tenants",
    icon: "👥",
    title: "Tenant Management",
    tagline: "Every tenant, perfectly organized.",
    stats: [
      { label: "Active", value: "120", tone: "good" },
      { label: "New this month", value: "9", tone: "good" },
      { label: "Notice", value: "4", tone: "warn" },
    ],
  },
];

const FAQS = [
  [
    "What is NILAYAM?",
    "NILAYAM is hostel management software for hostel and PG owners to manage tenants, rooms, beds, rent, dues, reports and reminders.",
  ],
  [
    "Who can use NILAYAM?",
    "Hostel owners, PG owners, property managers and accommodation businesses can use NILAYAM to organize daily operations.",
  ],
  [
    "Does NILAYAM manage rent payments?",
    "Yes. NILAYAM helps track paid, pending and overdue rent payments with payment request approval and rent history.",
  ],
  [
    "Can I manage rooms and beds?",
    "Yes. NILAYAM supports buildings, floors, rooms and bed allocation so owners can quickly see occupancy and availability.",
  ],
  [
    "Is NILAYAM available on mobile?",
    "Yes. NILAYAM offers web access and an Android app so hostel owners can manage their hostel from anywhere.",
  ],
  [
    "Is NILAYAM useful for PG management?",
    "Yes. NILAYAM works as PG management software for tenant records, room allocation, rent tracking and reminders.",
  ],
];

export default function NilayamSite() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chooseMuted, setChooseMuted] = useState(true);
  const [showWhatsAppPrompt, setShowWhatsAppPrompt] = useState(false);
  const [appSlide, setAppSlide] = useState(0);
  const [openFaq, setOpenFaq] = useState(0);
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    fetch(`${API}/plans`)
      .then((res) => res.json())
      .then((data) => setPlans(Array.isArray(data) ? data : []))
      .catch(() => setPlans([]))
      .finally(() => setPlansLoading(false));
  }, []);

  useEffect(() => {
    const items = document.querySelectorAll(".reveal-up");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            window.setTimeout(() => {
              entry.target.style.transitionDelay = "0ms";
            }, 800);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -40px 0px" }
    );

    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [plansLoading, plans]);

  useEffect(() => {
    setShowWhatsAppPrompt(true);
    const timer = window.setTimeout(() => {
      setShowWhatsAppPrompt(false);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setAppSlide((slide) => (slide + 1) % MOBILE_APP_IMAGES.length);
    }, 2500);

    return () => window.clearInterval(timer);
  }, []);

  const scrollTo = (href) => {
    setMenuOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleChoosePlan = (plan) => {
    navigate("/register", { state: { plan } });
  };

  return (
    <div className="nly-root">
      <style>{CSS}</style>

      <div className="nly-bg" aria-hidden="true">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
        <div className="grid-overlay" />
      </div>

      <header className={`nav ${scrolled ? "nav--solid" : ""}`}>
        <div className="nav-inner">
          <a href="#home" className="brand" onClick={(e) => { e.preventDefault(); scrollTo("#home"); }}>
            <img src={appLogo} alt="Nilayam logo" className="brand-logo" />
            <span className="brand-text">
              <strong>NILAYAM</strong>
              <em>HOSTEL MANAGEMENT</em>
            </span>
          </a>

          <nav className="nav-links">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={(e) => { e.preventDefault(); scrollTo(n.href); }}>
                {n.label}
              </a>
            ))}
          </nav>

          <div className="nav-cta">
            <button className="btn btn-primary" onClick={() => scrollTo("#app")}>Download App</button>
            <button className="btn btn-outline" onClick={() => navigate("/login")}>Login</button>
          </div>

          <button className={`hamburger ${menuOpen ? "hamburger--open" : ""}`} aria-label="Menu" onClick={() => setMenuOpen((s) => !s)}>
            <span /><span /><span />
          </button>
        </div>

        <div className={`mobile-menu ${menuOpen ? "mobile-menu--open" : ""}`}>
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={(e) => { e.preventDefault(); scrollTo(n.href); }}>
              {n.label}
            </a>
          ))}
          <button className="btn btn-primary" onClick={() => scrollTo("#app")}>Download App</button>
          <button className="btn btn-outline" onClick={() => navigate("/login")}>Login</button>
        </div>
      </header>

      <section id="home" className="hero">
        <video
          className="hero-video"
          src={heroSectionVideo}
          autoPlay
          loop
          muted
          preload="auto"
          playsInline
          aria-hidden="true"
        />
        <div className="hero-video-overlay" aria-hidden="true" />
        <div className="container hero-grid">
          <div className="hero-copy">
            <h1 className="h1">
              NILAYAM Hostel Management <span className="grad">Software.</span><br />
              Manage Your Hostel <span className="grad-gold">Better.</span>
            </h1>
            <p className="sub">Hostel and PG Management System, Made Simple.</p>
            <p className="desc">
              NILAYAM is an all-in-one hostel management software for Indian hostel and PG owners.
              Manage tenant records, room and bed allocation, rent collection, payment tracking,
              pending dues, reports, reminders and everyday hostel operations from one place.
            </p>
            <div className="cta-row">
              <button className="btn btn-primary lg" onClick={() => scrollTo("#pricing")}>Get Started</button>
              <a className="btn btn-gold lg" href={APP_DOWNLOAD_URL} download>📱 Download App</a>
            </div>
          </div>

        </div>
      </section>

      <section id="about" className="section">
        <div className="container">
          <SectionHead kicker="About" title="About NILAYAM" />
          <div className="about-panel reveal-up">
            <div className="about-grid">
              <div className="about-copy">
                <div className="highlight">
                  <span>One Platform.</span>
                  <strong>Complete Hostel Management.</strong>
                </div>
                <p>
                  NILAYAM is a modern hostel management software platform built to simplify the everyday
                  operations of hostel owners, PG owners and managers.
                </p>
                <p>
                  From managing buildings, floors, rooms and beds to handling tenants, rent, payments,
                  pending dues, reports and notifications — NILAYAM brings everything together in one
                  simple, organized hostel software platform.
                </p>
                <p>
                  Our goal is to reduce manual work, improve transparency, save valuable time and help
                  hostel owners manage their properties more efficiently.
                </p>
              </div>

              <div className="about-media">
                <img src={aboutImage} alt="Nilayam hostel management overview" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="section alt">
        <div className="container">
          <SectionHead
            kicker="Features"
            title={<>Everything You Need. <span className="grad">All in One App.</span></>}
            sub="NILAYAM brings the most important hostel management and PG management tasks into one organized platform. Spend less time on paperwork and more time growing your hostel business."
          />
          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <article key={f.title} className="feature-card glass reveal-up" style={{ transitionDelay: `${i * 40}ms` }}>
                <div className="feature-head">
                  <div className="fc-icon">{f.icon}</div>
                  <h3>{f.title}</h3>
                </div>
                <p>{f.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="why" className="section alt">
        <div className="container">
          <SectionHead kicker="Why Nilayam" title="Why Choose NILAYAM?" />
          <div className="why-showcase">
            <div className="why-grid">
              {[
                "Simple to Use", "Saves Time", "Reduces Manual Work", "Better Rent Tracking",
                "Clear Reports & Insights", "Smart Notifications", "Centralized Management", "Built for Modern Hostel Owners",
              ].map((w, i) => (
                <div key={w} className="why-item reveal-up" style={{ transitionDelay: `${i * 40}ms` }}>
                  <span className="tick">✓</span>{w}
                </div>
              ))}
            </div>
            <div className="choose-video-wrap reveal-up">
              <video
                className="choose-video"
                src={chooseVideo}
                autoPlay
                loop
                muted={chooseMuted}
                playsInline
                aria-label="Nilayam hostel management features preview"
              />
              <button
                className="sound-toggle"
                type="button"
                aria-label={chooseMuted ? "Turn video sound on" : "Turn video sound off"}
                onClick={() => setChooseMuted((muted) => !muted)}
              >
                {chooseMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section id="app" className="section app-section">
        <div className="container app-grid">
          <div>
            <SectionHead kicker="Mobile App" title={<>Take <span className="grad">NILAYAM</span> With You</>} align="left" />
            <p className="sub-left">Manage Your Hostel Anytime, Anywhere.</p>
            <p className="desc">
              Stay connected with your hostel operations wherever you are. Access important information,
              monitor your hostel, manage tenants, track payments and stay updated through the NILAYAM
              mobile experience.
            </p>
            <div className="cta-row">
              <a className="btn btn-gold lg" href={APP_DOWNLOAD_URL} download target="_blank" rel="noreferrer">
                📱 Download NILAYAM App
              </a>
        
            </div>
            <span className="android-tag">▲ Available for Android</span>
          </div>
          <div className="app-phone-preview">
            <div className="app-phone-carousel">
              <div className="app-phone-track" style={{ transform: `translateX(-${appSlide * 100}%)` }}>
                {MOBILE_APP_IMAGES.map((image, index) => (
                  <div className="app-phone-slide" key={image}>
                    <img src={image} alt={`Nilayam mobile app screen ${index + 1}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="section pricing-section">
        <div className="container">
          <SectionHead
            kicker="Pricing"
            title={<>Choose the Plan That Fits <span className="grad">Your Hostel</span></>}
            sub="Start with the right plan for your room size, tenant count and daily operations. Plans are fetched live from NILAYAM."
          />

          {plansLoading ? (
            <div className="pricing-grid">
              {[1, 2, 3].map((n) => (
                <div key={n} className="price-card price-card--loading reveal-up" style={{ transitionDelay: `${(n - 1) * 60}ms` }} />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div className="pricing-empty glass reveal-up">
              <strong>No active plans available right now.</strong>
              <span>Please check back soon or contact the NILAYAM team.</span>
            </div>
          ) : (
            <div className={`pricing-grid ${plans.length === 1 ? "pricing-grid--single" : ""}`}>
              {plans.map((plan, index) => (
                <article key={plan._id || plan.name} className={`price-card reveal-up ${index === 1 ? "price-card--featured" : ""}`} style={{ transitionDelay: `${index * 60}ms` }}>
                  {index === 1 && <span className="price-ribbon">Popular</span>}
                  <div className="price-head">
                    <span className="price-name">{plan.name}</span>

                  </div>
                  <div className="price-value">
                    {plan.isFree || Number(plan.price) === 0 ? (
                      <strong>Free</strong>
                    ) : (
                      <>
                        <span>₹</span>
                        <strong>{Number(plan.price || 0).toLocaleString("en-IN")}</strong>
                      </>
                    )}
                  </div>
                  <p className="price-duration">{plan.days} days access</p>
                  <ul className="price-list">
                    <li><span className="tick">✓</span>Up to {plan.beds} beds</li>
                    <li><span className="tick">✓</span>Tenant and rent management</li>
                    <li><span className="tick">✓</span>Reports, reminders and dashboard access</li>
                  </ul>
                  <button className="btn btn-primary lg price-btn" onClick={() => handleChoosePlan(plan)}>
                    Choose Plan
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="how" className="section">
        <div className="container">
          <SectionHead kicker="How it works" title={<>Get running in <span className="grad">4 simple steps</span></>} />
          <div className="steps">
            {[
              ["01", "Add Your Hostel", "Add buildings, floors, rooms and beds."],
              ["02", "Add Tenants", "Create tenant profiles and allocate rooms and beds."],
              ["03", "Manage Rent", "Track rent, payments, pending dues and overdue amounts."],
              ["04", "Manage Everything", "Monitor complete hostel operations from one dashboard."],
            ].map(([n, t, d]) => (
              <div key={n} className="step glass reveal-up" style={{ transitionDelay: `${(Number(n) - 1) * 60}ms` }}>
                <span className="step-num">{n}</span>
                <h4>{t}</h4>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead kicker="Benefits" title="Built to Make Hostel Management Easier" />
          <div className="benefits-grid">
            {[
              ["⏱", "Save Time", "Reduce repetitive manual tasks."],
              ["📋", "Stay Organized", "Keep hostel information structured and accessible."],
              ["💰", "Track Payments", "Know what is paid, pending or overdue."],
              ["📊", "Better Insights", "Understand your hostel performance."],
              ["📱", "Stay Connected", "Keep tenants informed with reminders and notifications."],
              ["🚀", "Grow Your Business", "Focus on growth while NILAYAM manages daily operations."],
            ].map(([i, t, d]) => (
              <div key={t} className="benefit glass reveal-up">
                <span className="b-ico">{i}</span>
                <h4>{t}</h4>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="container security">
          <SectionHead kicker="Security" title="Your Data. Your Trust. Our Responsibility." />
          <p className="center-text">
            NILAYAM is designed with security and privacy in mind. Your hostel management data and tenant
            information are handled responsibly with secure systems and controlled access.
          </p>
          <div className="sec-pills">
            {["Secure", "Private", "Reliable", "Protected"].map((s) => (
              <span key={s} className="pill glass">🛡 {s}</span>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="section">
        <div className="container">
          <SectionHead kicker="FAQ" title="NILAYAM Hostel Software Questions" />
          <div className="faq-panel reveal-up">
            {FAQS.map(([q, a], i) => (
              <div key={q} className={`faq-item ${openFaq === i ? "faq-item--open" : ""}`}>
                <button
                  className="faq-question"
                  type="button"
                  aria-expanded={openFaq === i}
                  aria-controls={`faq-answer-${i}`}
                  onClick={() => setOpenFaq((current) => (current === i ? -1 : i))}
                >
                  <span>{q}</span>
                  <span className="faq-plus" aria-hidden="true" />
                </button>
                <div id={`faq-answer-${i}`} className="faq-answer" role="region">
                  <p>{a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="container final-inner">
          <span className="glow" />
          <h2>Ready to Manage Your Hostel <span className="grad-gold">Smarter?</span></h2>
          <p>Join the smarter way to manage hostel operations with NILAYAM.</p>
          <div className="cta-row center">
            <a className="btn btn-gold lg" href={APP_DOWNLOAD_URL} download target="_blank" rel="noreferrer">
              📱 Download NILAYAM App
            </a>
          </div>
        </div>
      </section>

      <section id="contact" className="section">
        <div className="container contact">
          <SectionHead kicker="Contact" title="Let's Connect" />
          <p className="center-text">
            Have questions or want to learn more about NILAYAM? Get in touch with us.
          </p>
          <div className="contact-cards">
            <a href="tel:9346178913" className="c-card glass reveal-up">
              <span>📞</span>
              <strong>+91 93461 78913</strong>
              <em>Call us anytime</em>
            </a>
            <a href="tel:9515174064" className="c-card glass reveal-up">
              <span>📞</span>
              <strong>+91 95151 74064</strong>
              <em>Talk to our team</em>
            </a>
            <a href="mailto:nilayamhostelmanagment@gmail.com" className="c-card glass reveal-up">
              <span>✉</span>
              <strong>nilayamhostelmanagment@gmail.com</strong>
              <em>Email us</em>
            </a>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container footer-grid">
          <div>
            <div className="brand" style={{ marginBottom: 14 }}>
              <img src={appLogo} alt="Nilayam" className="brand-logo" />
              <span className="brand-text">
                <strong>NILAYAM</strong>
                <em>HOSTEL MANAGEMENT</em>
              </span>
            </div>
            <p className="tag">Manage Smarter. Live Better. With NILAYAM.</p>
          </div>
          <div>
            <h5>Explore</h5>
            <ul>
              {NAV.slice(0, 7).map((n) => (
                <li key={n.href}>
                  <a href={n.href} onClick={(e) => { e.preventDefault(); scrollTo(n.href); }}>{n.label}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h5>Get NILAYAM</h5>
            <ul>
              <li><a href={APP_DOWNLOAD_URL} download>📱 Download Android App</a></li>
              <li><a href="tel:9346178913">📞 +91 93461 78913</a></li>
              <li><a href="tel:9515174064">📞 +91 95151 74064</a></li>
            </ul>
          </div>
        </div>
        <div className="copy">© 2026 NILAYAM HOSTEL MANAGEMENT. All rights reserved.</div>
      </footer>

      <a
        className={`whatsapp-float ${showWhatsAppPrompt ? "whatsapp-float--prompt" : ""}`}
        href="https://wa.me/919515174064"
        target="_blank"
        rel="noreferrer"
        aria-label="Contact NILAYAM on WhatsApp"
      >
        <span className="whatsapp-prompt">
          <strong>Have a Question?</strong>
          <em>Contact Us now</em>
        </span>
        <span className="whatsapp-icon">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M16.02 4.3c-6.48 0-11.74 5.2-11.74 11.61 0 2.2.63 4.34 1.82 6.18L4.2 29l7.14-1.86a11.86 11.86 0 0 0 4.68 1c6.48 0 11.74-5.2 11.74-11.62S22.5 4.3 16.02 4.3Zm0 21.86c-1.48 0-2.93-.32-4.25-.96l-.3-.15-4.23 1.1 1.13-4.05-.2-.32a10.03 10.03 0 0 1-1.61-5.47c0-5.31 4.36-9.63 9.72-9.63 5.35 0 9.72 4.32 9.72 9.63 0 5.53-4.36 9.85-9.98 9.85Z" />
            <path d="M21.58 18.78c-.3-.15-1.77-.87-2.04-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.95 1.16-.17.2-.35.22-.65.07-.3-.15-1.27-.46-2.42-1.48-.9-.8-1.5-1.78-1.67-2.08-.18-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1-1.04 2.45s1.07 2.86 1.22 3.06c.15.2 2.1 3.18 5.1 4.46.71.3 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.08 1.77-.72 2.02-1.4.25-.69.25-1.28.17-1.4-.07-.13-.27-.2-.57-.35Z" />
          </svg>
        </span>
      </a>
    </div>
  );
}

function SectionHead({ kicker, title, sub, align = "center" }) {
  return (
    <div className={`sec-head ${align}`}>
      <span className="kicker">{kicker}</span>
      <h2 className="h2">{title}</h2>
      {sub && <p className="sec-sub">{sub}</p>}
    </div>
  );
}

function FloatingCard({ className, icon, title, text }) {
  return (
    <div className={`float-card glass ${className}`}>
      <div className="fic">{icon}</div>
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    </div>
  );
}

function DashboardMock({ large = false }) {
  return (
    <div className={`dash glass ${large ? "dash-lg" : ""}`}>
      <div className="dash-top">
        <div className="dash-brand">
          <span className="dash-dot" />
          <span>NILAYAM • Dashboard</span>
        </div>
        <div className="dash-tabs">
          <span className="on">Overview</span><span>Tenants</span><span>Rent</span><span>Reports</span>
        </div>
      </div>
      <div className="dash-kpis">
        <Kpi label="Total Tenants" value="120" trend="+8" />
        <Kpi label="Total Rooms" value="45" trend="+2" />
        <Kpi label="Monthly Rent" value="₹2,45,000" trend="+12%" gold />
        <Kpi label="Pending Rent" value="₹68,500" trend="-5%" warn />
      </div>
      <div className="dash-charts">
        <div className="chart">
          <div className="chart-title">Rent Collection Overview</div>
          <div className="bars">
            {[60, 78, 52, 88, 74, 92, 68].map((h, i) => (
              <div key={i} className="bar-col"><i style={{ height: `${h}%` }} /></div>
            ))}
          </div>
        </div>
        <div className="donut">
          <div className="donut-title">Paid / Pending / Overdue</div>
          <div className="ring">
            <svg viewBox="0 0 42 42">
              <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="rgba(15,42,90,0.08)" strokeWidth="4" />
              <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#0f9d76" strokeWidth="4"
                strokeDasharray="62 100" strokeDashoffset="25" />
              <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#e8b23a" strokeWidth="4"
                strokeDasharray="22 100" strokeDashoffset="-37" />
              <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#d94c4c" strokeWidth="4"
                strokeDasharray="16 100" strokeDashoffset="-59" />
            </svg>
            <div className="ring-center"><strong>82%</strong><span>Collected</span></div>
          </div>
          <div className="legend">
            <span><i style={{ background: "#0f9d76" }} />Paid 62%</span>
            <span><i style={{ background: "#e8b23a" }} />Pending 22%</span>
            <span><i style={{ background: "#d94c4c" }} />Overdue 16%</span>
          </div>
        </div>
      </div>
      <div className="dash-list">
        <div className="dl-title">Recent Payments</div>
        {[
          ["Priya Sharma", "Room 204", "₹6,500", "Paid"],
          ["Ravi Kumar", "Room 118", "₹5,800", "Pending"],
          ["Aisha Khan", "Room 302", "₹7,200", "Paid"],
        ].map(([n, r, a, s]) => (
          <div key={n} className="dl-row">
            <span className="av">{n[0]}</span>
            <span className="nm">{n}</span>
            <span className="rm">{r}</span>
            <span className="am">{a}</span>
            <span className={`st ${s === "Paid" ? "ok" : "wn"}`}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, trend, gold, warn }) {
  return (
    <div className={`kpi ${gold ? "kpi-gold" : ""} ${warn ? "kpi-warn" : ""}`}>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
      <span className="kpi-trend">{trend}</span>
    </div>
  );
}

function PhoneMock({ floating, big }) {
  return (
    <div className={`phone ${floating ? "phone-float" : ""} ${big ? "phone-big" : ""}`}>
      <div className="phone-notch" />
      <div className="phone-screen">
        <div className="ps-head">
          <div>
            <span className="ps-hi">Hi, Owner 👋</span>
            <strong>Nilayam</strong>
          </div>
          <div className="ps-bell">🔔</div>
        </div>
        <div className="ps-card gold">
          <span>Monthly Collected</span>
          <strong>₹1,76,500</strong>
          <em>+12% vs last month</em>
        </div>
        <div className="ps-row">
          <div className="ps-mini"><span>Tenants</span><strong>120</strong></div>
          <div className="ps-mini"><span>Rooms</span><strong>45</strong></div>
        </div>
        <div className="ps-list-title">Recent</div>
        {["Priya • ₹6,500", "Ravi • Pending", "Aisha • ₹7,200"].map((t, i) => (
          <div key={i} className="ps-item">
            <span className="ps-dot" />
            <span>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap');

.nly-root{
  --navy:#0b1a3a;
  --navy-2:#122a5c;
  --navy-3:#1b3b82;
  --blue:#3b7bff;
  --blue-2:#5aa8ff;
  --teal:#5dc9c1;
  --green:#2ec4a2;
  --gold:#d9ad4a;
  --gold-2:#f0cc72;
  --ink:#0e1a35;
  --muted:#5a6a86;
  --bg:#f4f7fc;
  --bg-2:#eaf1fb;
  --card:#ffffff;
  --line:rgba(15,42,90,0.10);
  font-family:'Inter Tight','Inter',system-ui,sans-serif;
  color:var(--ink);
  background:var(--bg);
  -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
}
.nly-root *{box-sizing:border-box}
.container{max-width:1200px;margin:0 auto;padding:0 24px}
.nly-root a{color:inherit;text-decoration:none}

.nly-bg{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden}
.blob{position:absolute;width:520px;height:520px;border-radius:50%;filter:blur(90px);opacity:.45;animation:float 18s ease-in-out infinite}
.b1{background:linear-gradient(135deg,#5aa8ff,#93d3ce);top:-160px;left:-120px}
.b2{background:linear-gradient(135deg,#93d3ce,#3b7bff);top:40%;right:-160px;animation-delay:-6s}
.b3{background:linear-gradient(135deg,#f0cc72,#5aa8ff);bottom:-200px;left:30%;opacity:.28;animation-delay:-12s}
.grid-overlay{position:absolute;inset:0;background-image:linear-gradient(rgba(15,42,90,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(15,42,90,.05) 1px,transparent 1px);background-size:56px 56px;mask-image:radial-gradient(ellipse at 50% 0%,#000 30%,transparent 70%)}
@keyframes float{0%,100%{transform:translate(0,0)}50%{transform:translate(30px,-40px)}}

.nly-root > *:not(.nly-bg):not(.nav){position:relative;z-index:1}
.reveal-up{opacity:0;transform:translateY(38px);transition:opacity .7s ease,transform .7s cubic-bezier(.22,1,.36,1)}
.reveal-up.is-visible{opacity:1;transform:translateY(0)}

.nav{position:fixed;top:0;left:0;right:0;width:100%;z-index:9999;transition:box-shadow .3s ease;padding:14px 0;background:#fff;border-bottom:1px solid var(--line);box-shadow:0 10px 30px -24px rgba(15,42,90,.18)}
.nav--solid{background:#fff;border-bottom-color:var(--line);box-shadow:0 10px 30px -20px rgba(15,42,90,.25)}
.nav-inner{max-width:1200px;margin:0 auto;padding:0 24px;display:flex;align-items:center;gap:24px}
.brand{display:flex;align-items:center;gap:10px}
.brand-logo{width:48px;height:48px;object-fit:contain;background:transparent;filter:none}
.brand-text{display:flex;flex-direction:column;line-height:1}
.brand-text strong{font-weight:800;letter-spacing:.5px;color:var(--navy);font-size:15px}
.brand-text em{font-style:normal;font-size:9px;letter-spacing:2.4px;color:var(--muted);margin-top:3px}
.nav-links{display:flex;gap:26px;margin-left:auto}
.nav-links a{font-size:14px;color:var(--ink);font-weight:500;position:relative;transition:color .2s}
.nav-links a:hover{color:var(--blue)}
.nav-links a::after{content:"";position:absolute;left:0;right:0;bottom:-6px;height:2px;background:linear-gradient(90deg,var(--blue),var(--teal));transform:scaleX(0);transform-origin:left;transition:transform .3s}
.nav-links a:hover::after{transform:scaleX(1)}
.nav-cta{display:flex;gap:10px}
.hamburger{display:none;background:transparent;border:0;padding:8px;cursor:pointer;width:38px;height:38px;position:relative}
.hamburger span{position:absolute;left:8px;display:block;width:22px;height:2px;background:var(--navy);border-radius:2px;transition:transform .25s ease,opacity .2s ease,top .25s ease}
.hamburger span:nth-child(1){top:11px}
.hamburger span:nth-child(2){top:18px}
.hamburger span:nth-child(3){top:25px}
.hamburger--open span:nth-child(1){top:18px;transform:rotate(45deg)}
.hamburger--open span:nth-child(2){opacity:0;transform:scaleX(0)}
.hamburger--open span:nth-child(3){top:18px;transform:rotate(-45deg)}
.mobile-menu{display:flex;flex-direction:column;gap:12px;max-height:0;opacity:0;overflow:hidden;padding:0 24px;background:rgba(255,255,255,.95);backdrop-filter:blur(20px);border-bottom:0 solid transparent;transform:translateY(-8px);transition:max-height .32s ease,opacity .24s ease,transform .32s ease,padding .32s ease,border-color .32s ease}
.mobile-menu--open{max-height:420px;opacity:1;padding:18px 24px 20px;border-bottom-width:1px;border-bottom-color:var(--line);transform:translateY(0)}
.mobile-menu a{color:var(--ink);font-weight:500;padding:8px 0;border-bottom:1px solid var(--line)}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:600;font-size:14px;padding:10px 18px;border-radius:12px;border:0;cursor:pointer;transition:all .25s cubic-bezier(.4,0,.2,1);white-space:nowrap;font-family:inherit}
.btn.lg{padding:14px 26px;font-size:15px;border-radius:14px}
.btn-primary{background:linear-gradient(135deg,var(--navy-3),var(--blue));color:#fff;box-shadow:0 10px 24px -10px rgba(59,123,255,.6)}
.btn-primary:visited,.btn-primary:active,.btn-primary:focus{color:#fff}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 16px 34px -10px rgba(59,123,255,.7)}
.btn-ghost{background:rgba(15,42,90,.06);color:var(--navy)}
.btn-ghost:hover{background:rgba(15,42,90,.12)}
.btn-gold{background:linear-gradient(135deg,var(--gold),var(--gold-2));color:#3d2c07;box-shadow:0 10px 28px -8px rgba(217,173,74,.55)}
.btn-gold:hover{transform:translateY(-2px);box-shadow:0 18px 40px -8px rgba(217,173,74,.75)}
.btn-outline{background:transparent;color:var(--navy);border:1.5px solid var(--navy)}
.btn-outline:hover{background:var(--navy);color:#fff}
.btn-outline-light{background:transparent;color:#fff;border:1.5px solid rgba(255,255,255,.55)}
.btn-outline-light:hover{background:#fff;color:var(--navy)}
.link-btn{background:transparent;border:0;color:var(--blue);font-weight:600;cursor:pointer;font-family:inherit;font-size:15px}
.link-btn:hover{text-decoration:underline}

.hero{position:relative;min-height:100vh;padding:126px 0 96px;overflow:hidden;background:#07172f}
.hero-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;background:#07172f}
.hero-video-overlay{display:none}
.hero-grid{position:relative;z-index:2;display:grid;grid-template-columns:minmax(0,660px);gap:0;align-items:start;max-width:none;padding-left:clamp(42px,5vw,96px);padding-right:24px}
.hero-copy{max-width:660px}
.hero .h1{color:#f7fbff;text-shadow:0 8px 28px rgba(1,9,28,.62)}
.hero .sub{color:#eaf6ff;text-shadow:0 4px 18px rgba(1,9,28,.55)}
.hero .desc{color:#fff;text-shadow:0 3px 14px rgba(1,9,28,.58)}
.hero .link-btn{color:#66d9ff;text-shadow:0 3px 14px rgba(1,9,28,.55)}
.badge{display:inline-flex;align-items:center;gap:8px;background:rgba(59,123,255,.1);color:var(--navy-3);font-weight:700;font-size:12px;letter-spacing:1.5px;padding:8px 14px;border-radius:999px;border:1px solid rgba(59,123,255,.25);margin-bottom:22px;animation:pulse 2.4s infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(59,123,255,.4)}50%{box-shadow:0 0 0 12px rgba(59,123,255,0)}}
.h1{font-family:'Inter Tight',sans-serif;font-weight:800;font-size:clamp(38px,5.2vw,68px);line-height:1.02;letter-spacing:-.03em;margin:0 0 20px}
.grad{background:linear-gradient(135deg,#4f7dff 0%,#28a7ff 48%,#62f2e8 100%);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:900;text-shadow:0 8px 26px rgba(23,132,255,.32)}
.grad-gold{background:linear-gradient(135deg,#ffd35b 0%,#ffb52e 48%,#fff08b 100%);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:900;text-shadow:0 8px 26px rgba(255,181,46,.32)}
.sub{font-size:20px;font-weight:600;color:var(--navy);margin:0 0 14px}
.desc{color:var(--muted);font-size:16px;line-height:1.6;max-width:560px;margin:0 0 28px}
.cta-row{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.cta-row.center{justify-content:center}
.hero-visual{position:relative;min-height:520px}
.hero-visual.center{display:flex;justify-content:center;align-items:center}

.glass{background:linear-gradient(180deg,rgba(255,255,255,.85),rgba(255,255,255,.7));backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.7);box-shadow:0 20px 60px -30px rgba(15,42,90,.25),0 1px 0 rgba(255,255,255,.7) inset;border-radius:22px}

.dash{padding:20px;width:100%;max-width:640px}
.dash-lg{max-width:1000px;margin:0 auto;padding:26px}
.dash-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.dash-brand{display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px;color:var(--navy)}
.dash-dot{width:10px;height:10px;border-radius:50%;background:linear-gradient(135deg,var(--blue),var(--teal))}
.dash-tabs{display:flex;gap:6px}
.dash-tabs span{font-size:12px;padding:6px 10px;border-radius:8px;color:var(--muted);cursor:pointer}
.dash-tabs .on{background:var(--navy);color:#fff}
.dash-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
.kpi{background:linear-gradient(180deg,rgba(59,123,255,.06),rgba(59,123,255,.02));border:1px solid var(--line);padding:14px;border-radius:14px;display:flex;flex-direction:column;gap:4px}
.kpi-label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;font-weight:600}
.kpi-value{font-size:20px;font-weight:800;color:var(--navy);font-family:'Inter Tight'}
.kpi-trend{font-size:11px;color:#0f9d76;font-weight:600}
.kpi-warn .kpi-trend{color:#d94c4c}
.kpi-gold{background:linear-gradient(180deg,rgba(217,173,74,.14),rgba(217,173,74,.04));border-color:rgba(217,173,74,.35)}
.kpi-gold .kpi-value{background:linear-gradient(135deg,var(--gold),var(--gold-2));-webkit-background-clip:text;color:transparent}

.dash-charts{display:grid;grid-template-columns:1.3fr 1fr;gap:14px;margin-bottom:14px}
.chart,.donut{background:#fff;border:1px solid var(--line);padding:14px;border-radius:14px}
.chart-title,.donut-title,.dl-title{font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
.bars{display:flex;align-items:flex-end;gap:8px;height:120px}
.bar-col{flex:1;background:rgba(59,123,255,.08);border-radius:6px;position:relative;overflow:hidden}
.bar-col i{display:block;width:100%;background:linear-gradient(180deg,var(--blue),var(--teal));border-radius:6px;position:absolute;bottom:0;animation:grow 1.2s ease-out}
@keyframes grow{from{height:0!important}}
.ring{position:relative;display:flex;justify-content:center}
.ring svg{width:150px;height:150px;transform:rotate(-90deg)}
.ring-center{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center}
.ring-center strong{font-size:26px;font-weight:800;color:var(--navy);font-family:'Inter Tight'}
.ring-center span{font-size:11px;color:var(--muted)}
.legend{display:flex;flex-direction:column;gap:6px;margin-top:10px;font-size:12px}
.legend span{display:flex;align-items:center;gap:8px;color:var(--muted)}
.legend i{width:10px;height:10px;border-radius:3px;display:inline-block}
.dash-list{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px}
.dl-row{display:grid;grid-template-columns:32px 1.4fr 1fr 1fr 80px;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line);font-size:13px}
.av{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--blue),var(--teal));color:#fff;display:grid;place-items:center;font-weight:700;font-size:13px}
.nm{font-weight:600;color:var(--navy)}
.rm,.am{color:var(--muted)}
.am{font-weight:700;color:var(--navy);text-align:right}
.st{font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;text-align:center}
.st.ok{background:rgba(46,196,162,.15);color:#0f9d76}
.st.wn{background:rgba(232,178,58,.18);color:#a37a10}

.phone{width:260px;height:520px;border-radius:38px;background:linear-gradient(180deg,#101a3a,#1b2f66);padding:12px;box-shadow:0 30px 80px -20px rgba(15,42,90,.5),inset 0 0 0 2px rgba(255,255,255,.06);position:relative}
.phone-big{width:290px;height:580px}
.phone-float{position:absolute;right:-10px;bottom:-20px;animation:sway 6s ease-in-out infinite}
@keyframes sway{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-14px) rotate(-1deg)}}
.phone-notch{position:absolute;top:14px;left:50%;transform:translateX(-50%);width:80px;height:22px;background:#000;border-radius:0 0 16px 16px;z-index:2}
.phone-screen{width:100%;height:100%;border-radius:28px;background:linear-gradient(180deg,#f4f7fc,#eaf1fb);padding:44px 14px 14px;overflow:hidden;position:relative}
.ps-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.ps-hi{font-size:11px;color:var(--muted)}
.ps-head strong{display:block;font-size:16px;color:var(--navy);font-weight:800}
.ps-bell{width:32px;height:32px;background:#fff;border-radius:10px;display:grid;place-items:center;box-shadow:0 4px 12px -4px rgba(15,42,90,.15)}
.ps-card{background:#fff;border-radius:14px;padding:14px;margin-bottom:12px;box-shadow:0 6px 18px -8px rgba(15,42,90,.2)}
.ps-card.gold{background:linear-gradient(135deg,var(--navy-3),var(--blue));color:#fff}
.ps-card span{font-size:10px;text-transform:uppercase;letter-spacing:1px;opacity:.75}
.ps-card strong{display:block;font-size:22px;font-weight:800;margin:4px 0}
.ps-card em{font-style:normal;font-size:11px;opacity:.85}
.ps-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.ps-mini{background:#fff;border-radius:12px;padding:10px}
.ps-mini span{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px}
.ps-mini strong{display:block;font-size:18px;color:var(--navy);font-weight:800;margin-top:2px}
.ps-list-title{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;font-weight:700}
.ps-item{display:flex;align-items:center;gap:8px;background:#fff;padding:8px 10px;border-radius:10px;margin-bottom:6px;font-size:12px;color:var(--navy);font-weight:500}
.ps-dot{width:8px;height:8px;border-radius:50%;background:linear-gradient(135deg,var(--blue),var(--teal))}

.float-card{position:absolute;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;font-size:13px;min-width:180px;animation:sway 5s ease-in-out infinite}
.float-card .fic{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--blue),var(--teal));color:#fff;display:grid;place-items:center;font-size:16px}
.float-card strong{display:block;color:var(--navy);font-size:13px}
.float-card span{color:var(--muted);font-size:11px}
.fc1{top:20px;left:-10px;animation-delay:-2s}
.fc2{bottom:60px;left:-20px;animation-delay:-4s}
.fc-a1{top:40px;right:0;animation-delay:-2s}
.fc-a2{bottom:60px;left:0;animation-delay:-4s}

.section{padding:70px 0;position:relative}
.section.alt{background:linear-gradient(180deg,rgba(255,255,255,.5),rgba(234,241,251,.6))}
.sec-head{margin-bottom:36px}
.sec-head.center{text-align:center}
.sec-head.left{text-align:left}
.kicker{display:inline-block;font-size:12px;font-weight:700;color:var(--blue);letter-spacing:2.5px;text-transform:uppercase;margin-bottom:14px;padding:6px 12px;background:rgba(59,123,255,.1);border-radius:999px}
.h2{font-family:'Inter Tight';font-weight:800;font-size:clamp(30px,4vw,50px);line-height:1.08;letter-spacing:-.02em;margin:0}
.sec-sub{color:var(--muted);font-size:17px;max-width:680px;margin:16px auto 0;line-height:1.6}
.sec-head.left .sec-sub{margin-left:0}
.center-text{text-align:center;color:var(--muted);max-width:640px;margin:0 auto 24px;font-size:16px;line-height:1.6}

.about-panel{background:#fff;border:1px solid var(--line);border-radius:24px;padding:34px;box-shadow:0 24px 70px -36px rgba(15,42,90,.36)}
.about-grid{display:grid;grid-template-columns:1.12fr .88fr;gap:36px;align-items:center}
.p-lg{padding:36px}
.about-copy p{margin:0 0 14px;color:var(--muted);line-height:1.7;font-size:16px}
.highlight{margin:0 0 22px;padding:20px;border-radius:16px;background:linear-gradient(135deg,rgba(59,123,255,.08),rgba(93,201,193,.08));border:1px dashed rgba(59,123,255,.35)}
.highlight span{display:block;font-size:14px;color:var(--muted);font-weight:600}
.highlight strong{display:block;font-family:'Inter Tight';font-size:22px;font-weight:800;color:var(--navy);margin-top:4px}
.about-media{position:relative;overflow:hidden;border-radius:18px;background:#dfeaf7;box-shadow:0 18px 48px -28px rgba(15,42,90,.45);aspect-ratio:4/3}
.about-media img{width:100%;height:100%;display:block;object-fit:cover;object-position:center}
.about-media::after{content:"";position:absolute;inset:0;border:1px solid rgba(255,255,255,.55);border-radius:inherit;pointer-events:none}
.flow{display:flex;flex-direction:column;gap:16px;position:relative}
.flow-node{display:flex;align-items:center;gap:14px;padding:18px 22px;border-radius:16px;background:#fff;border:1px solid var(--line);box-shadow:0 10px 30px -20px rgba(15,42,90,.2);transition:transform .3s}
.flow-node:hover{transform:translateX(6px)}
.flow-dot{width:36px;height:36px;border-radius:12px;color:#fff;font-weight:800;display:grid;place-items:center;font-family:'Inter Tight'}
.n0 .flow-dot{background:linear-gradient(135deg,var(--navy),var(--navy-3))}
.n1 .flow-dot{background:linear-gradient(135deg,var(--blue),var(--teal))}
.n2 .flow-dot{background:linear-gradient(135deg,var(--teal),var(--green))}
.n3 .flow-dot{background:linear-gradient(135deg,var(--gold),var(--gold-2));color:#3d2c07}
.flow-node span{font-weight:700;color:var(--navy);letter-spacing:1px;font-size:13px}

.features-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.feature-card{padding:26px;transition:opacity .7s ease,transform .7s cubic-bezier(.22,1,.36,1),box-shadow .35s cubic-bezier(.4,0,.2,1);cursor:default}
@keyframes rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
.feature-card:hover{transform:translateY(-6px);box-shadow:0 30px 60px -20px rgba(15,42,90,.28)}
.feature-head{display:flex;align-items:center;gap:14px;margin-bottom:14px}
.fc-icon{width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,rgba(59,123,255,.15),rgba(93,201,193,.15));display:grid;place-items:center;font-size:24px;flex-shrink:0;transition:transform .3s}
.feature-card:hover .fc-icon{transform:rotate(-6deg) scale(1.08)}
.feature-card h3{font-family:'Inter Tight';font-size:18px;font-weight:700;color:var(--navy);margin:0;line-height:1.2}
.feature-card p{color:var(--muted);font-size:14px;line-height:1.6;margin:0}
.learn{font-size:13px;font-weight:700;color:var(--blue);opacity:0;transform:translateX(-6px);transition:all .3s}
.feature-card:hover .learn{opacity:1;transform:translateX(0)}

.faq-panel{max-width:880px;margin:0 auto;background:#fff;border:1px solid rgba(15,42,90,.08);border-radius:18px;box-shadow:0 28px 70px -44px rgba(15,42,90,.32);overflow:hidden}
.faq-item{border-bottom:1px solid rgba(15,42,90,.08);transition:background .25s ease}
.faq-item:last-child{border-bottom:0}
.faq-item--open{background:linear-gradient(180deg,#fff,rgba(244,247,252,.64))}
.faq-question{width:100%;min-height:68px;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 28px;background:transparent;border:0;color:var(--ink);font-family:inherit;font-size:15px;font-weight:800;text-align:left;cursor:pointer}
.faq-question:hover{color:var(--blue)}
.faq-question:focus-visible{outline:3px solid rgba(59,123,255,.24);outline-offset:-3px}
.faq-plus{position:relative;width:18px;height:18px;flex:0 0 18px;transition:transform .28s ease}
.faq-plus::before,.faq-plus::after{content:"";position:absolute;left:50%;top:50%;width:12px;height:2px;background:currentColor;border-radius:999px;transform:translate(-50%,-50%);transition:transform .28s ease,opacity .2s ease}
.faq-plus::after{transform:translate(-50%,-50%) rotate(90deg)}
.faq-item--open .faq-plus{transform:rotate(180deg)}
.faq-item--open .faq-plus::after{opacity:0;transform:translate(-50%,-50%) rotate(0deg)}
.faq-answer{display:grid;grid-template-rows:0fr;transition:grid-template-rows .36s cubic-bezier(.22,1,.36,1),opacity .28s ease;opacity:0}
.faq-answer p{overflow:hidden;margin:0;padding:0 28px;color:var(--muted);font-size:15px;line-height:1.7}
.faq-item--open .faq-answer{grid-template-rows:1fr;opacity:1}
.faq-item--open .faq-answer p{padding-bottom:22px}

.explorer{display:grid;grid-template-columns:280px 1fr;gap:0;overflow:hidden;padding:0}
.explorer-nav{padding:20px;border-right:1px solid var(--line);display:flex;flex-direction:column;gap:6px;background:rgba(255,255,255,.5)}
.ex-item{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px;background:transparent;border:0;cursor:pointer;text-align:left;font-family:inherit;font-size:14px;font-weight:600;color:var(--muted);transition:all .25s}
.ex-item:hover{background:rgba(59,123,255,.08);color:var(--navy)}
.ex-item.on{background:linear-gradient(135deg,var(--navy-3),var(--blue));color:#fff;box-shadow:0 8px 20px -8px rgba(59,123,255,.5)}
.ex-ico{font-size:18px}
.explorer-view{padding:36px;animation:fadeSlide .4s ease-out}
@keyframes fadeSlide{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.ev-head{display:flex;align-items:center;gap:16px;margin-bottom:26px}
.ev-icon{width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,var(--blue),var(--teal));color:#fff;display:grid;place-items:center;font-size:26px}
.ev-head h3{font-family:'Inter Tight';font-size:24px;margin:0;color:var(--navy)}
.ev-head p{margin:4px 0 0;color:var(--muted)}
.ev-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px}
.stat{background:#fff;border-radius:14px;padding:18px;border:1px solid var(--line);display:flex;flex-direction:column}
.stat--good{border-left:4px solid #0f9d76}
.stat--warn{border-left:4px solid #e8b23a}
.stat--bad{border-left:4px solid #d94c4c}
.s-val{font-family:'Inter Tight';font-size:26px;font-weight:800;color:var(--navy)}
.s-lbl{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;font-weight:600;margin-top:4px}
.ev-bars{display:flex;flex-direction:column;gap:10px}
.bar{height:10px;background:rgba(15,42,90,.06);border-radius:6px;overflow:hidden}
.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--blue),var(--teal));border-radius:6px;animation:slide 1.2s ease-out}
@keyframes slide{from{width:0!important}}

.app-section{min-height:760px;background:linear-gradient(160deg,rgba(59,123,255,.06),rgba(93,201,193,.05));overflow:visible}
.app-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,45%);gap:60px;align-items:center;min-height:620px;overflow:visible}
.sub-left{font-size:20px;font-weight:600;color:var(--navy);margin:0 0 14px}
.android-tag{display:inline-block;margin-top:16px;font-size:12px;color:var(--muted);font-weight:600;letter-spacing:1px}
.app-phone-preview{height:min(82vh,720px);min-height:650px;overflow:visible;display:flex;align-items:center;justify-content:flex-end}
.app-phone-carousel{width:100%;height:100%;overflow:hidden}
.app-phone-track{height:100%;display:flex;transition:transform .75s cubic-bezier(.22,1,.36,1)}
.app-phone-slide{height:100%;min-width:100%;display:flex;align-items:center;justify-content:flex-end}
.app-phone-slide img{width:auto;height:100%;max-height:90%;max-width:100%;display:block;object-fit:contain}

.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;position:relative}
.step{padding:28px;position:relative;transition:all .3s}
.step:hover{transform:translateY(-6px)}
.step-num{font-family:'Inter Tight';font-size:44px;font-weight:800;background:linear-gradient(135deg,var(--blue),var(--teal));-webkit-background-clip:text;color:transparent;display:block;line-height:1;margin-bottom:14px}
.step h4{font-family:'Inter Tight';font-size:18px;color:var(--navy);margin:0 0 8px}
.step p{color:var(--muted);font-size:14px;line-height:1.6;margin:0}

.why-showcase{display:grid;grid-template-columns:.9fr 1.6fr;gap:34px;align-items:start}
.why-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-content:start}
.why-item{height:96px;padding:18px 20px;font-weight:700;color:var(--navy);display:flex;align-items:center;gap:12px;font-size:15px;line-height:1.35;background:#fff;border:1px solid rgba(15,42,90,.12);border-radius:16px;box-shadow:0 16px 40px -28px rgba(15,42,90,.38);transition:all .3s}
.why-item:hover{transform:translateY(-4px);border-color:rgba(59,123,255,.28);box-shadow:0 22px 48px -28px rgba(15,42,90,.42)}
.tick{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,var(--green),var(--teal));color:#fff;display:grid;place-items:center;font-weight:800;flex-shrink:0}
.choose-video-wrap{position:relative;overflow:hidden;border-radius:20px;background:#07172f;border:1px solid rgba(15,42,90,.16);box-shadow:0 26px 70px -34px rgba(15,42,90,.48);height:440px}
.choose-video-wrap::after{content:"";position:absolute;inset:0;border:1px solid rgba(255,255,255,.28);border-radius:inherit;pointer-events:none}
.choose-video{width:100%;height:100%;display:block;object-fit:cover}
.sound-toggle{position:absolute;right:16px;bottom:16px;z-index:2;width:34px;height:34px;border:0;background:transparent;color:#fff;display:grid;place-items:center;cursor:pointer;padding:0;filter:drop-shadow(0 3px 8px rgba(0,0,0,.55));transition:transform .2s,color .2s}
.sound-toggle:hover{color:#66d9ff;transform:translateY(-1px)}
.compare{display               :grid;grid-template-columns:1fr 60px 1fr;gap:24px;align-items:center}
.col{padding:32px;border-radius:22px;background:#fff;border:1px solid var(--line)}
.col.old{opacity:.9}
.col.old li{color:#8a95ab}
.col.new{border:2px solid transparent;background:linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,var(--blue),var(--gold)) border-box;box-shadow:0 30px 60px -30px rgba(59,123,255,.4)}
.col h4{font-family:'Inter Tight';color:var(--navy);margin:0 0 16px;text-transform:uppercase;letter-spacing:1px;font-size:13px;font-weight:800}
.col ul{list-style:none;padding:0;margin:0}
.col li{padding:10px 0;border-bottom:1px solid var(--line);font-size:15px;color:var(--navy)}
.vs{font-family:'Inter Tight';font-size:24px;font-weight:800;color:var(--gold);text-align:center;letter-spacing:2px}

.benefits-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.benefit{padding:26px;transition:all .3s}
.benefit:hover{transform:translateY(-6px);box-shadow:0 30px 60px -20px rgba(15,42,90,.28)}
.b-ico{font-size:32px;display:block;margin-bottom:12px}
.benefit h4{font-family:'Inter Tight';font-size:18px;color:var(--navy);margin:0 0 6px}
.benefit p{color:var(--muted);font-size:14px;line-height:1.6;margin:0}

.security .sec-pills{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;margin-top:20px}
.pill{padding:12px 22px;border-radius:999px;font-weight:600;color:var(--navy);font-size:14px}

.pricing-section{background:linear-gradient(180deg,rgba(255,255,255,.72),rgba(234,241,251,.72))}
.pricing-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px;align-items:stretch}
.pricing-grid--single{display:flex;justify-content:center}
.pricing-grid--single .price-card{width:100%;max-width:430px}
.price-card{position:relative;background:#fff;border:1px solid rgba(15,42,90,.11);border-radius:20px;padding:28px;box-shadow:0 22px 58px -36px rgba(15,42,90,.36);display:flex;flex-direction:column;min-height:420px;transition:transform .25s,box-shadow .25s,border-color .25s}
.price-card:hover{transform:translateY(-5px);border-color:rgba(59,123,255,.28);box-shadow:0 28px 70px -36px rgba(15,42,90,.46)}
.price-card--featured{border:2px solid transparent;background:linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,var(--blue),var(--teal)) border-box}
.price-ribbon{position:absolute;top:18px;right:18px;padding:6px 12px;border-radius:999px;background:linear-gradient(135deg,var(--navy-3),var(--blue));color:#fff;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase}
.price-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:22px}
.price-name{font-family:'Inter Tight';font-size:24px;font-weight:800;color:var(--navy);line-height:1.1}
.price-beds{padding:7px 10px;border-radius:999px;background:rgba(46,196,162,.12);color:#0f9d76;font-size:12px;font-weight:800;white-space:nowrap}
.price-value{display:flex;align-items:flex-start;gap:4px;color:var(--navy);margin-bottom:8px}
.price-value span{font-size:24px;font-weight:800;margin-top:4px}
.price-value strong{font-family:'Inter Tight';font-size:46px;line-height:1;font-weight:900}
.price-duration{color:var(--muted);font-size:14px;font-weight:600;margin:0 0 24px}
.price-list{list-style:none;margin:0 0 26px;padding:0;display:flex;flex-direction:column;gap:12px;flex:1}
.price-list li{display:flex;align-items:flex-start;gap:10px;color:var(--muted);font-size:14px;line-height:1.45}
.price-list .tick{width:22px;height:22px;border-radius:7px;font-size:13px}
.price-btn{width:100%}
.pricing-empty{max-width:560px;margin:0 auto;padding:32px;text-align:center;display:flex;flex-direction:column;gap:8px}
.pricing-empty strong{color:var(--navy);font-size:18px}
.pricing-empty span{color:var(--muted)}
.price-card--loading{min-height:360px;overflow:hidden;background:linear-gradient(90deg,#fff 0%,#eef5ff 45%,#fff 90%);background-size:220% 100%;animation:priceShimmer 1.3s ease-in-out infinite}
@keyframes priceShimmer{0%{background-position:120% 0}100%{background-position:-120% 0}}

.final-cta{padding:100px 0;background:linear-gradient(135deg,#081432 0%,#0f2350 50%,#122a5c 100%);color:#fff;position:relative;overflow:hidden}
.final-cta::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);background-size:56px 56px;mask-image:radial-gradient(ellipse at 50% 50%,#000 40%,transparent 75%)}
.final-inner{position:relative;text-align:center}
.glow{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:500px;height:500px;background:radial-gradient(circle,rgba(217,173,74,.35),transparent 60%);filter:blur(60px)}
.final-inner h2{font-family:'Inter Tight';font-size:clamp(32px,4vw,54px);font-weight:800;letter-spacing:-.02em;margin:0 0 14px;position:relative}
.final-inner p{color:rgba(255,255,255,.7);font-size:18px;margin:0 0 32px;position:relative}
.final-inner .cta-row{position:relative}

.contact-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:20px}
.c-card{padding:32px;display:flex;flex-direction:column;align-items:center;text-align:center;transition:all .3s;cursor:pointer}
.c-card:hover{transform:translateY(-6px);box-shadow:0 30px 60px -20px rgba(15,42,90,.3)}
.c-card > span{font-size:32px;margin-bottom:12px}
.c-card strong{font-family:'Inter Tight';font-size:18px;color:var(--navy);margin-bottom:4px}
.c-card em{font-style:normal;font-size:13px;color:var(--muted)}

.whatsapp-float{position:fixed!important;right:28px!important;bottom:34px!important;z-index:2147483647!important;display:flex;align-items:center;gap:14px;color:inherit;text-decoration:none;pointer-events:auto}
.whatsapp-icon{width:68px;height:68px;border-radius:50%;background:#05c331;color:#fff;display:grid;place-items:center;border:6px solid #fff;box-shadow:0 14px 34px -14px rgba(0,0,0,.55);transition:transform .22s ease,box-shadow .22s ease}
.whatsapp-icon svg{width:38px;height:38px;display:block;fill:currentColor}
.whatsapp-float:hover .whatsapp-icon{transform:translateY(-3px) scale(1.03);box-shadow:0 18px 38px -14px rgba(0,0,0,.62)}
.whatsapp-prompt{position:relative;display:flex;flex-direction:column;gap:3px;background:#e7e5e5;color:#0f172a;border-radius:12px;padding:13px 24px;box-shadow:8px 10px 0 rgba(0,0,0,.08);opacity:0;visibility:hidden;transform:translateX(10px);transition:opacity .22s ease,visibility .22s ease,transform .22s ease}
.whatsapp-float--prompt .whatsapp-prompt,.whatsapp-float:hover .whatsapp-prompt,.whatsapp-float:focus-visible .whatsapp-prompt{opacity:1;visibility:visible;transform:translateX(0)}
.whatsapp-prompt::after{content:"";position:absolute;right:-17px;top:50%;transform:translateY(-50%);border-width:8px 0 8px 18px;border-style:solid;border-color:transparent transparent transparent #e7e5e5}
.whatsapp-prompt strong{font-size:14px;font-weight:500;line-height:1.15}
.whatsapp-prompt em{font-style:normal;font-size:14px;line-height:1.15}
@keyframes promptIn{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:translateX(0)}}

.footer{background:linear-gradient(180deg,#0a1830,#050d1f);color:#fff;padding:56px 0 28px;margin-top:50px}
.footer .brand-text strong{color:#fff}
.footer .brand-text em{color:rgba(255,255,255,.55)}
.footer-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:40px}
.footer h5{font-family:'Inter Tight';font-size:14px;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 16px;color:#fff}
.footer ul{list-style:none;padding:0;margin:0}
.footer li{padding:6px 0}
.footer li a{color:rgba(255,255,255,.65);font-size:14px;transition:color .2s}
.footer li a:hover{color:var(--gold-2)}
.tag{color:rgba(255,255,255,.6);font-size:14px}
.copy{text-align:center;margin-top:50px;padding-top:24px;border-top:1px solid rgba(255,255,255,.1);font-size:13px;color:rgba(255,255,255,.4)}

@media (max-width:1024px){
  .hero-grid,.about-grid,.app-grid{grid-template-columns:1fr;gap:50px}
  .hero-visual{min-height:auto;display:flex;justify-content:center}
  .app-section{min-height:auto}
  .app-grid{min-height:auto}
  .app-phone-preview{height:580px;min-height:0;justify-content:center}
  .app-phone-slide{justify-content:center}
  .features-grid,.benefits-grid{grid-template-columns:repeat(2,1fr)}
  .steps{grid-template-columns:repeat(2,1fr)}
  .why-showcase{grid-template-columns:1fr}
  .why-grid{grid-template-columns:repeat(2,1fr)}
  .choose-video-wrap{height:360px}
  .dash-kpis{grid-template-columns:repeat(2,1fr)}
  .dash-charts{grid-template-columns:1fr}
  .explorer{grid-template-columns:1fr}
  .explorer-nav{flex-direction:row;overflow-x:auto;border-right:0;border-bottom:1px solid var(--line)}
  .ex-item{flex-shrink:0}
  .contact-cards,.footer-grid{grid-template-columns:1fr}
  .compare{grid-template-columns:1fr;gap:16px}
  .vs{padding:10px 0}
}
@media (max-width:720px){
  .nav-links,.nav-cta{display:none}
  .hamburger{display:block;margin-left:auto}
  .mobile-menu{display:flex}
  .features-grid,.benefits-grid,.steps,.why-grid{grid-template-columns:1fr}
  .why-item{height:84px}
  .choose-video-wrap{height:280px}
  .app-phone-preview{height:480px;min-height:0}
  .whatsapp-float{right:16px!important;bottom:24px!important;gap:10px}
  .whatsapp-icon{width:60px;height:60px;border-width:5px}
  .whatsapp-icon svg{width:34px;height:34px}
  .whatsapp-prompt{padding:11px 18px}
  .section{padding:52px 0}
  .faq-panel{border-radius:14px}
  .faq-question{min-height:62px;padding:0 18px;font-size:14px}
  .faq-answer p{padding:0 18px;font-size:14px}
  .faq-item--open .faq-answer p{padding-bottom:18px}
  .hero{padding:106px 0 60px}
  .about-panel{padding:20px;border-radius:18px}
  .p-lg{padding:24px}
  .cta-row{flex-direction:column;align-items:stretch}
  .btn{width:100%}
  .link-btn{width:auto;align-self:center}
  .dash{padding:14px}
  .dash-kpis{grid-template-columns:1fr 1fr;gap:8px}
  .kpi-value{font-size:16px}
  .dl-row{grid-template-columns:28px 1fr 60px;font-size:12px}
  .dl-row .rm,.dl-row .am{display:none}
  .phone{width:230px;height:460px}
  .float-card{display:none}
}
`;
