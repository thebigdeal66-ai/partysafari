import LegalPage, { type LegalSection } from "@/components/legal/LegalPage";

const sections: LegalSection[] = [
  {
    title: "1. Eligibility and acceptance",
    paragraphs: ["By creating an account or using PartySafari.live, you agree to these Terms. PartySafari is intended for users age 18 and older. You must provide accurate account information and keep your account secure. Venue alcohol-service rules and applicable drinking-age laws still apply regardless of your eligibility to use PartySafari."],
  },
  {
    title: "2. What PartySafari provides",
    paragraphs: ["PartySafari helps people discover nightlife, venues, events, live activity, entertainers, and each other. Venue listings, hours, events, crowd activity, Party Scores, location information, and user posts can change quickly and may be incomplete or inaccurate. They are discovery signals, not guarantees of admission, safety, availability, pricing, capacity, or quality."],
  },
  {
    title: "3. Safety and responsible use",
    paragraphs: ["You are responsible for your decisions while traveling to, attending, or leaving any venue or event. Do not use PartySafari while driving. Follow venue rules and applicable laws. PartySafari does not provide emergency services; contact local emergency services when immediate help is needed."],
  },
  {
    title: "4. Your content",
    paragraphs: ["You keep ownership of content you create. By posting content to PartySafari, you give PartySafari a non-exclusive, worldwide, royalty-free license to host, store, reproduce, display, distribute, and technically adapt that content only as reasonably necessary to operate, promote, secure, and improve PartySafari. This license ends when content is deleted except where retention is reasonably necessary for backups, safety, legal compliance, or resolved disputes."],
  },
  {
    title: "5. Prohibited conduct",
    paragraphs: ["You may not use PartySafari to harass, threaten, impersonate, stalk, exploit, defraud, spam, or endanger another person; post illegal or infringing content; manipulate Party Scores, check-ins, Lit activity, reviews, claims, or engagement; scrape or attack the service; evade blocks or enforcement; falsely claim a venue; or access another person’s account or private information without permission."],
  },
  {
    title: "6. Venue claims, events, and bookings",
    paragraphs: ["A verified venue badge means PartySafari verified the claim method used for that listing; it is not an endorsement of the venue. Venue owners and entertainers are responsible for the accuracy of content and offers they publish. Unless PartySafari expressly says otherwise for a specific transaction, agreements between users, venues, and entertainers are between those parties."],
  },
  {
    title: "7. Reports, blocks, and enforcement",
    paragraphs: ["PartySafari may review reports and may remove content, limit features, suspend accounts, revoke venue ownership, or terminate accounts when reasonably necessary to enforce these Terms, protect people or the service, respond to legal obligations, or address fraud and abuse. Blocking a user is designed to stop new social contact; it does not necessarily erase prior records that PartySafari must retain for safety or legal reasons."],
  },
  {
    title: "8. Intellectual property",
    paragraphs: ["PartySafari’s name, branding, software, design, and original platform content are protected by applicable intellectual-property laws. You may not copy, reverse engineer, or commercially exploit them except as permitted by law or with written permission. If you believe content infringes your rights, submit a report with enough information for us to review it."],
  },
  {
    title: "9. Service availability",
    paragraphs: ["PartySafari may change, test, suspend, or discontinue features. During beta, features may contain errors or change without notice. To the maximum extent permitted by law, the service is provided “as is” and “as available,” without warranties that it will always be accurate, uninterrupted, secure, or error-free."],
  },
  {
    title: "10. Limitation of liability",
    paragraphs: ["To the maximum extent permitted by applicable law, PartySafari is not liable for indirect, incidental, special, consequential, or punitive damages arising from use of the service, third-party venues or events, user conduct, or content. Nothing in these Terms excludes rights or liability that cannot legally be excluded."],
  },
  {
    title: "11. Privacy",
    paragraphs: ["Our Privacy Policy explains how PartySafari handles personal data. By using location-dependent features, you instruct PartySafari to process location as described there and in the permission prompts shown by your device."],
  },
  {
    title: "12. Governing law and changes",
    paragraphs: ["These Terms are governed by the laws of the State of Maryland, without regard to conflict-of-laws principles, except where applicable consumer law requires otherwise. We may update these Terms as the service changes. Material changes will be reflected by a new effective date and additional notice when required."],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="These Terms govern access to and use of PartySafari.live. PartySafari is currently a pre-launch/public-beta service, so some features will evolve as we prepare for full launch."
      sections={sections}
    />
  );
}
