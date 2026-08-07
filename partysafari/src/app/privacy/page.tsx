import Link from "next/link";
import LegalPage, { type LegalSection } from "@/components/legal/LegalPage";

const sections: LegalSection[] = [
  {
    title: "1. Information we collect",
    paragraphs: ["PartySafari collects information you provide and information created when you use the service."],
    bullets: [
      "Account and profile data, such as your name, username, email address, profile details, birthday/age information, avatar, and account type.",
      "Location data you choose to provide or permit, including device location used for nearby venues, Radar, check-ins, venue eligibility, and market activation. Precise location may be sensitive personal data under applicable law.",
      "Social and nightlife activity, including follows, friends, RSVPs, check-ins, Lit signals, stories, reactions, messages, booking activity, reports, blocks, and venue interactions.",
      "User-generated content, such as photos, videos, stories, profile text, event details, and messages.",
      "Technical information such as device/browser information, session/authentication data, timestamps, diagnostics, and security logs.",
    ],
  },
  {
    title: "2. How we use information",
    paragraphs: ["We use personal data to operate PartySafari, personalize nearby nightlife discovery, calculate and display live venue activity, support social and booking features, secure accounts, prevent abuse, investigate reports, improve the service, and comply with law. We do not use precise location for a purpose that is unrelated to the location-driven features you request."],
  },
  {
    title: "3. What other people can see",
    paragraphs: ["Profile information and content you intentionally publish may be visible to other PartySafari users or the public depending on the feature. PartySafari does not publicly expose the identity behind a Lit signal. Direct messages and private safety/privacy reports are not public."],
  },
  {
    title: "4. Sharing and service providers",
    paragraphs: ["We may share data with infrastructure and service providers that help us host, authenticate, store, secure, monitor, and operate PartySafari, subject to their roles and applicable agreements. We may also disclose information when required by law, to protect users or the service, or as part of a business transaction. Venue owners receive information that a feature clearly makes available to them; claiming a venue does not give an owner access to private member data."],
  },
  {
    title: "5. Sale and targeted advertising",
    paragraphs: ["PartySafari does not currently sell personal data or use personal data for targeted advertising based on activity across unaffiliated services. If that changes, we will update this policy and provide any legally required notice and choices before using data that way."],
  },
  {
    title: "6. Retention and security",
    paragraphs: ["We retain data only as long as reasonably necessary for the feature, safety, fraud prevention, legal obligations, dispute resolution, and legitimate operational needs. Some live activity expires automatically. We use access controls, database authorization rules, and other safeguards, but no online service can guarantee absolute security."],
  },
  {
    title: "7. Your privacy choices and rights",
    paragraphs: ["Depending on where you live, you may have rights to access, correct, delete, or obtain a copy of personal data; opt out of certain processing; withdraw consent; or appeal a privacy-rights decision. Maryland residents may have rights under the Maryland Online Data Privacy Act when it applies. California residents may have rights under the CCPA/CPRA when applicable. We will not discriminate against you for exercising applicable privacy rights."],
  },
  {
    title: "8. Location controls",
    paragraphs: ["You can deny or revoke device-location permission in your browser or operating-system settings. Some Radar, nearby, check-in, story, and venue-verification features may then be unavailable or less accurate. We do not ask you to keep location permission enabled when you are not using a location feature."],
  },
  {
    title: "9. Age",
    paragraphs: ["PartySafari is intended for people age 18 and older. It is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If we learn that we have done so, we will take appropriate steps to delete it."],
  },
  {
    title: "10. Requests and contact",
    paragraphs: ["Use our authenticated privacy-request form so we can verify that a request concerns your account. We may ask for additional information when reasonably necessary to verify identity or scope."],
  },
  {
    title: "11. Changes",
    paragraphs: ["We may update this policy as PartySafari changes. Material changes will be reflected by a new effective date and, when required, additional notice."],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <LegalPage
        title="Privacy Policy"
        intro="This policy explains what PartySafari.live collects, why we use it, how it may be shared, and the choices available to you."
        sections={sections}
      />
      <div className="fixed bottom-5 right-5">
        <Link href="/privacy/request" className="rounded-full bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-violet-500">
          Privacy request
        </Link>
      </div>
    </>
  );
}
