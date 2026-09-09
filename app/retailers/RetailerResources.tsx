"use client";

import { useState } from "react";
import styles from "./page.module.css";

type PolicySection = {
  title: string;
  paragraphs?: string[];
  lead?: string;
  bullets?: string[];
  after?: string[];
};

const conductSections: PolicySection[] = [
  { title: "1. Purpose", paragraphs: ["This Retailer Code of Conduct (“Code”) establishes the minimum standards of behavior and operational practices required of all retailers (“Retailers”) who access or use the ShiftSupport platform (“Platform”). Compliance with this Code is a condition of continued access to the Platform."] },
  { title: "2. Accurate Business Information", paragraphs: ["Retailers must provide complete, accurate, and current business information, including legal business name, physical address, and authorized points of contact. Retailers are responsible for updating such information promptly upon any change."] },
  { title: "3. Truthful and Complete Shift Descriptions", lead: "Retailers must ensure that all posted shifts contain accurate, non-misleading information, including:", bullets: ["Start and end times", "Task descriptions", "Dress code requirements", "Physical or skill requirements", "Any other material information relevant to the performance of the shift"], after: ["Retailers may not materially alter shift expectations after a Helper has accepted the shift."] },
  { title: "4. Workplace Safety and Conditions", paragraphs: ["Retailers must provide a safe, lawful, and non-hazardous work environment.", "Retailers must ensure the workspace is clean, accessible, and free from known hazards.", "Retailers may not assign tasks that are illegal, unsafe, or materially different from the posted description."] },
  { title: "5. Professional Conduct and Non-Discrimination", lead: "Retailers must treat all Helpers with professionalism, dignity, and respect. Retailers shall not engage in or permit:", bullets: ["Harassment, abuse, or intimidation", "Discrimination based on race, color, religion, national origin, gender, gender identity, sexual orientation, disability, age, or any other protected characteristic", "Retaliatory behavior, including retaliatory ratings or feedback"] },
  { title: "6. Payment Obligations", lead: "Retailers must pay the posted rate for the full duration of the shift as accepted by the Helper. Retailers may not:", bullets: ["Reduce pay after acceptance", "Require unpaid trial work", "Withhold payment for reasons unrelated to the Helper’s performance"], after: ["All payments must be made in accordance with Platform processes and timelines."] },
  { title: "7. Cancellations and Attendance", paragraphs: ["Retailers must honor accepted shifts.", "Cancellations must be made in accordance with Platform policies.", "Excessive or last-minute cancellations may result in account limitations or suspension.", "Retailers may not no-show a Helper."] },
  { title: "8. Platform Communication Requirements", lead: "Retailers must conduct all shift-related communication through the Platform unless otherwise permitted by ShiftSupport. Retailers may not:", bullets: ["Request or require Helpers to work outside the Platform", "Solicit off-platform arrangements", "Share unnecessary personal contact information"] },
  { title: "9. Prohibited Conduct", lead: "Retailers are strictly prohibited from:", bullets: ["Posting fraudulent, misleading, or deceptive shifts", "Assigning tasks outside the scope of the posted shift", "Pressuring Helpers to extend shifts without compensation", "Attempting to circumvent Platform fees or processes", "Engaging in any unlawful, unsafe, or unethical conduct"] },
  { title: "10. Feedback and Ratings", paragraphs: ["Retailers must provide fair, accurate, and good-faith ratings and feedback.", "Feedback may not be used to threaten, coerce, or retaliate against Helpers."] },
  { title: "11. Compliance and Enforcement", lead: "ShiftSupport reserves the right to investigate alleged violations of this Code. Violations may result in corrective actions, including but not limited to:", bullets: ["Warnings", "Temporary account restrictions", "Permanent suspension or termination", "Reporting to appropriate authorities where required by law"], after: ["ShiftSupport may take action at its sole discretion."] },
  { title: "12. Acknowledgment", paragraphs: ["By accessing or using the Platform, Retailers acknowledge and agree to comply with this Code.", "Continued use of the Platform constitutes ongoing acceptance of these obligations."] },
];

const postingSections: PolicySection[] = [
  { title: "1. Purpose", paragraphs: ["This Shift Posting Policy (“Policy”) governs the creation, submission, and publication of shift postings (“Shift Postings”) by retailers (“Retailers”) on the ShiftSupport platform (“Platform”).", "This Policy is intended to ensure accuracy, safety, fairness, and transparency for all Helpers who rely on posted shift information."] },
  { title: "2. Requirements for All Shift Postings", lead: "Retailers must ensure that each Shift Posting is complete, accurate, and not misleading. Each posting must include, at minimum:", bullets: ["Shift date and start/end times", "Business location where the shift will occur", "Clear description of duties and expected responsibilities", "Dress code or appearance requirements, if applicable", "Physical requirements, such as lifting, standing, or mobility expectations", "Compensation rate, as displayed on the Platform", "Any additional material information necessary for a Helper to make an informed decision"], after: ["Retailers are responsible for verifying that all information is correct at the time of posting."] },
  { title: "3. Accuracy and Truthfulness", lead: "Retailers must not post shifts that contain:", bullets: ["False, incomplete, or misleading information", "Tasks or requirements not disclosed in the posting", "Compensation rates that differ from the actual rate paid", "Any information intended to deceive or misrepresent the nature of the shift"], after: ["ShiftSupport may request clarification or documentation if a posting appears inaccurate or inconsistent."] },
  { title: "4. Scope of Work", lead: "Retailers may assign only those tasks that:", bullets: ["Are explicitly described in the Shift Posting", "Are lawful, safe, and appropriate for short-term retail support", "Do not require specialized training, certification, or licensing unless clearly disclosed"], after: ["Helpers may decline any task outside the posted scope without penalty."] },
  { title: "5. Prohibited Shift Postings", lead: "Retailers may not post shifts that involve:", bullets: ["Hazardous, unsafe, or illegal activities", "Work requiring professional licensing unless disclosed", "Tasks unrelated to retail support", "Shifts intended to recruit Helpers for off-platform work", "Compensation below the minimum rate established by the Platform"], after: ["ShiftSupport may remove any prohibited posting at its sole discretion."] },
  { title: "6. Modifications to Posted Shifts", lead: "Once a Helper has accepted a shift:", bullets: ["Retailers may not materially change the duties, compensation, location, or schedule", "Minor clarifications are permitted", "Substantive changes require cancellation and reposting", "Any attempt to alter the shift in a way that disadvantages the Helper is prohibited"] },
  { title: "7. Cancellation Requirements", lead: "Retailers must comply with the Platform’s cancellation policies. Excessive or last-minute cancellations may result in:", bullets: ["Temporary posting restrictions", "Account review", "Suspension or termination"], after: ["Retailers may not cancel a shift for the purpose of reposting it at a lower rate or with altered terms."] },
  { title: "8. Off-Platform Solicitation", lead: "Retailers may not use Shift Postings to:", bullets: ["Solicit Helpers for off-platform work", "Circumvent Platform fees", "Collect personal contact information beyond what is necessary for the shift"], after: ["All shift-related communication must occur through the Platform unless otherwise permitted."] },
  { title: "9. Enforcement", lead: "ShiftSupport may review, modify, or remove any Shift Posting that violates this Policy. Violations may result in:", bullets: ["Removal of the Shift Posting", "Warnings or corrective actions", "Temporary or permanent account suspension", "Reporting to appropriate authorities where required by law"], after: ["ShiftSupport retains sole discretion in enforcement decisions."] },
  { title: "10. Acceptance of Policy", paragraphs: ["By creating or submitting a Shift Posting, Retailers acknowledge and agree to comply with this Policy.", "Continued use of the Platform constitutes ongoing acceptance."] },
];

const tabs = ["Code of Conduct", "ShiftSupport for Retailers", "Retailer Responsibilities", "Shift Posting Policy"];

function Policy({ title, sections }: { title: string; sections: PolicySection[] }) {
  return <div className={styles.policyPanel}>
    <header className={styles.resourceHeader}><span className={`headingFont ${styles.termsLabel}`}>For inclusion in Terms &amp; Conditions</span><h3>{title}</h3><p>A practical guide for retailers using the ShiftSupport platform.</p></header>
    <div className={styles.policyContent}>{sections.map((section) => <section className={styles.policySection} key={section.title}>
      <h4>{section.title}</h4>
      {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      {section.lead && <p>{section.lead}</p>}
      {section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
      {section.after?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    </section>)}</div>
  </div>;
}

function DocumentIcon() {
  return <span className={styles.documentIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3.5h6.8L18.5 8v12.5H7z"/><path d="M13.5 3.5V8h5M9.7 12h6M9.7 15h6"/></svg></span>;
}

function ResourceLink({ title, description, href, button }: { title: string; description: string; href: string; button: string }) {
  return <div className={styles.pdfPanel}><div className={styles.pdfAccent} aria-hidden="true" /><DocumentIcon /><span className={`headingFont ${styles.pdfLabel}`}>PDF RESOURCE</span><h3>{title}</h3><p>{description}</p><a className={`headingFont ${styles.resourceButton}`} href={href} target="_blank" rel="noreferrer">{button} <span aria-hidden="true">↗</span></a></div>;
}

export default function RetailerResources() {
  const [activeTab, setActiveTab] = useState(0);

  return <section className={styles.resourcesSection}>
    <div className="container">
      <div className={styles.resourcesHeading}><p className={`headingFont ${styles.eyebrow}`}><span aria-hidden="true" />RETAILER RESOURCES</p><h2>Policies and Guides for Retailers.</h2><p>Review the practical standards, responsibilities, and resources that support every shift.</p></div>
      <div className={styles.tabs} role="tablist" aria-label="Retailer resources">
        {tabs.map((tab, index) => <button className={`${styles.tabButton} ${activeTab === index ? styles.activeTab : ""}`} type="button" role="tab" aria-selected={activeTab === index} aria-controls={`resource-panel-${index}`} id={`resource-tab-${index}`} onClick={() => setActiveTab(index)} key={tab}>{tab}</button>)}
      </div>
      <div className={styles.tabContent} role="tabpanel" id={`resource-panel-${activeTab}`} aria-labelledby={`resource-tab-${activeTab}`}>
        {activeTab === 0 && <Policy title="ShiftSupport - Retailer Code of Conduct, 2026" sections={conductSections} />}
        {activeTab === 1 && <ResourceLink title="ShiftSupport for Retailers" description="Learn what ShiftSupport provides to local stores and how the platform supports short, flexible staffing needs." button="View Retailer Guide" href="https://cdn.prod.website-files.com/6968056bfb2385986ec61801/6a0374fc932bc9adee104ec7_What%20we%20deliver%20to%20local%20stores.pdf" />}
        {activeTab === 2 && <ResourceLink title="Retailer Responsibilities" description="Review the key responsibilities retailers should follow when using ShiftSupport, including workplace expectations, shift accuracy, worker safety, and platform compliance." button="View Retailer Responsibilities" href="https://cdn.prod.website-files.com/6968056bfb2385986ec61801/6a0357d959187b63a52bc0e1_retailer%20responsibilities.pdf" />}
        {activeTab === 3 && <Policy title="ShiftSupport - Shift Posting Policy" sections={postingSections} />}
      </div>
    </div>
  </section>;
}
