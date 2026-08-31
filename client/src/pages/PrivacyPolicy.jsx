const effectiveDate = "August 25, 2026";

const contactEmail = "nilayamhostelmanagment@gmail.com";

const policySections = [
  {
    title: "1. Introduction",
    body: [
      "NILAYAM is a hostel and PG management application used to manage hostel properties, tenants, rooms, beds, rent records, reminders, onboarding, and related operational workflows. This Privacy Policy explains how NILAYAM collects, uses, stores, and shares information when you use the NILAYAM website, mobile application, backend services, and related features.",
      "This policy is intended for hostel or PG owners, administrators, staff members, tenants, candidates, and other people whose information may be entered into or submitted through NILAYAM.",
    ],
  },
  {
    title: "2. Information We Collect",
    items: [
      {
        label: "Account and profile information",
        text: "We may collect account details such as name, owner or organization name, mobile number, email address, password, address, role, login status, plan details, and other profile information needed to create and manage NILAYAM accounts.",
      },
      {
        label: "Hostel, PG, room, and tenant information",
        text: "The application handles hostel and PG operational records, including property or building details, floors, rooms, beds, tenant or candidate names, mobile numbers, email addresses, father or guardian details, permanent addresses, joining dates, rent amounts, advance amounts, room and bed allocation details, onboarding status, checkout or inactive status, and related tenant-management information.",
      },
      {
        label: "Documents and uploaded files",
        text: "Where uploaded by an administrator, tenant, or candidate, NILAYAM may store document images or files such as Aadhaar front and back images, passport-size photos, and payment receipts. These files may be stored through Cloudinary when configured, or through the application's backend storage when Cloudinary is not configured.",
      },
      {
        label: "Rent, payment, and transaction-related records",
        text: "NILAYAM records rent amounts, pending dues, paid amounts, due dates, advance amounts, payment history, payment requests, payment mode such as online or cash, receipt uploads, approval or rejection status, rejection reasons, and related activity records. Based on the inspected project, NILAYAM records payment-management information and receipts, but does not itself store sensitive card numbers, card CVV, banking passwords, or payment gateway credentials.",
      },
      {
        label: "Device and application information",
        text: "For login sessions, notifications, and app operation, NILAYAM may process authentication tokens, session information, Firebase Cloud Messaging device tokens, platform information, timestamps, and basic technical information generated when the application is used.",
      },
      {
        label: "Communications and support information",
        text: "If you contact NILAYAM or use email-based workflows, we may process email addresses, OTPs, password reset requests, onboarding link messages, rent reminder emails, payment confirmation emails, and related communication records.",
      },
    ],
  },
  {
    title: "3. How We Use Information",
    items: [
      {
        label: "Account and access management",
        text: "To create accounts, authenticate users, manage roles, apply login status, manage plans, process password reset requests, and keep user sessions working.",
      },
      {
        label: "Hostel and PG operations",
        text: "To manage buildings, floors, rooms, beds, tenant onboarding, document records, tenant verification, rent ledgers, dues, checkout or inactive status, and day-to-day hostel-management workflows.",
      },
      {
        label: "Payments and rent tracking",
        text: "To record rent dues, paid amounts, advance amounts, payment requests, cash payment dates, online payment receipts, approvals, rejections, and payment history. NILAYAM uses this information for operational tracking and owner review.",
      },
      {
        label: "Communication and service notifications",
        text: "To send email OTPs, onboarding links, password reset OTPs, automated rent reminders, advance-payment reminders, payment-status emails, and push notifications about onboarding or payment activity where those features are configured.",
      },
      {
        label: "Security and fraud prevention",
        text: "To verify access tokens, protect authenticated routes and APIs, prevent unauthorized access, monitor activity logs, troubleshoot suspicious activity, and keep operational records accurate.",
      },
      {
        label: "Application improvement and maintenance",
        text: "To debug issues, maintain backend services, improve reliability, optimize uploaded media delivery, and understand how core application workflows are functioning.",
      },
      {
        label: "Legal and compliance purposes",
        text: "To respond to lawful requests, enforce terms or policies, resolve disputes, maintain audit records, and comply with applicable legal obligations.",
      },
    ],
  },
  {
    title: "4. How Information Is Shared",
    body: [
      "NILAYAM does not sell users' personal information.",
      "Information may be shared only as needed to operate the application, provide requested features, comply with law, or protect NILAYAM, users, tenants, and hostel or PG operations.",
    ],
    items: [
      {
        label: "Hostel or PG owners and authorized users",
        text: "Tenant, room, bed, rent, document, and payment records may be visible to the hostel or PG owner, administrator, or authorized staff account that manages those records.",
      },
      {
        label: "Backend, hosting, database, and storage providers",
        text: "Application data is processed through NILAYAM's backend services, database, hosting infrastructure, and file storage. Uploaded documents and receipts may be processed by Cloudinary when Cloudinary is configured.",
      },
      {
        label: "Email and notification providers",
        text: "NILAYAM uses Brevo email APIs in the backend for OTPs, password reset messages, onboarding links, rent reminders, and payment-related emails when configured. NILAYAM uses Firebase Cloud Messaging for push notifications when Firebase is configured.",
      },
      {
        label: "WhatsApp links",
        text: "Some reminder workflows open WhatsApp or WhatsApp Web with prepared message text. WhatsApp is a third-party service, and messages sent through WhatsApp are governed by WhatsApp's own terms and privacy practices.",
      },
      {
        label: "Legal, safety, and business reasons",
        text: "We may disclose information if required by law, legal process, government request, fraud prevention, security investigation, or to protect rights, safety, and property.",
      },
    ],
  },
  {
    title: "5. Data Security",
    body: [
      "NILAYAM uses authentication controls, protected API routes, role-based access patterns, password hashing, token-based authorization, and operational safeguards to help protect information. However, no internet-based service, database, or file-storage system can be guaranteed to be completely secure.",
      "Users should keep account credentials confidential, use trusted devices, and promptly report any suspected unauthorized access.",
    ],
  },
  {
    title: "6. Data Retention",
    body: [
      "We retain account, tenant, hostel, rent, document, payment, notification, and activity information for as long as needed to provide NILAYAM services, support hostel and PG operations, comply with legal obligations, resolve disputes, and maintain business records.",
      "When information is no longer required, it may be deleted, anonymized, or retained only where required for legitimate operational, legal, or security purposes.",
    ],
  },
  {
    title: "7. User Rights and Choices",
    body: [
      "Depending on applicable law and your relationship with NILAYAM, you may request access to, correction of, deletion of, or restriction of certain personal information. Hostel or PG tenants and candidates may also contact the relevant hostel or PG owner or administrator for correction or deletion of records managed by that owner.",
      `To request account correction, data deletion, or privacy support, contact us at ${contactEmail}. We may need to verify your identity and account relationship before processing a request.`,
    ],
  },
  {
    title: "8. Permissions",
    body: [
      "Based on the inspected project, NILAYAM supports file uploads for tenant documents and payment receipts, and push notifications through Firebase Cloud Messaging when configured. If the mobile application requests file, media, camera, notification, or similar permissions, those permissions are used to support the relevant application feature, such as uploading documents, uploading receipts, or receiving service notifications.",
      "You may control app permissions through your device settings. Disabling certain permissions may limit related features.",
    ],
  },
  {
    title: "9. Third-Party Services",
    body: [
      "NILAYAM may use third-party service providers only where needed for application operation. Based on the inspected project, relevant third-party services or integrations may include Cloudinary for document and receipt storage or delivery, Brevo for transactional email, Firebase Cloud Messaging for push notifications, WhatsApp or WhatsApp Web links for reminders, backend hosting, database hosting, and deployment infrastructure.",
      "We did not identify advertising SDKs or analytics SDKs in the inspected project. If such services are added in the future, this Privacy Policy should be updated before or when those services are used.",
    ],
  },
  {
    title: "10. Children's Privacy",
    body: [
      "NILAYAM is intended for hostel and PG management and is not directed to children under the age required by applicable law. We do not knowingly collect personal information from children for general consumer use.",
      "Hostel or PG records may include tenant or guardian information where entered by authorized hostel or PG administrators as part of legitimate accommodation-management operations. If you believe information about a child has been provided improperly, please contact us so the matter can be reviewed.",
    ],
  },
  {
    title: "11. Changes to This Privacy Policy",
    body: [
      "We may update this Privacy Policy from time to time to reflect changes in the application, services, legal requirements, or business practices. The updated version will be posted on this page with a revised effective date.",
    ],
  },
  {
    title: "12. Contact Us",
    body: [
      "If you have questions, concerns, correction requests, or deletion requests related to this Privacy Policy or NILAYAM's handling of personal information, please contact:",
      `Email: ${contactEmail}`,
      "Website: https://nilayamhostelmanagement.in.net/",
    ],
  },
];

function Section({ section }) {
  return (
    <section className="privacy-section">
      <h2>{section.title}</h2>
      {section.body?.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {section.items && (
        <div className="privacy-list">
          {section.items.map((item) => (
            <div className="privacy-list-item" key={item.label}>
              <h3>{item.label}</h3>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <main className="privacy-page">
      <div className="privacy-shell">
        <header className="privacy-hero">
          <p className="privacy-eyebrow">NILAYAM Hostel Management</p>
          <h1>Privacy Policy</h1>
          <p className="privacy-effective">Effective Date: {effectiveDate}</p>
          <p className="privacy-summary">
            This Privacy Policy explains how NILAYAM collects, uses, stores, and shares information for hostel and PG management services.
          </p>
        </header>

        <div className="privacy-card">
          {policySections.map((section) => (
            <Section key={section.title} section={section} />
          ))}
        </div>
      </div>
    </main>
  );
}
