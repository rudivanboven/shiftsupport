import type { Metadata } from "next";
import type { ReactNode } from "react";
import Header from "@/components/layout/Header/Header";
import Footer from "@/components/layout/Footer/Footer";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "How ShiftSupport Works | ShiftSupport",
  description: "See how ShiftSupport connects local retailers with local workers — creating an account, posting and applying for shifts, completing work, and building trust through verified reviews.",
};

const workerBenefits = ["Create your worker account", "Complete your profile", "Access eligible shift opportunities", "Apply for local shifts near you", "Manage hired and completed shifts", "Build your work history", "Build a trusted profile through verified reviews"];
const retailerBenefits = ["Free Retailer account", "Create and prepare a shift", "Select the date, hours and location", "Complete the checkout step before publishing", "Receive and review applicants", "Hire the worker you want", "ShiftSupport handles the employment model", "Access completed-shift records and reviews"];

const workerSteps: [string, string][] = [
  ["Create Your Account", "Sign up as a worker and get your ShiftSupport account set up in a few minutes."],
  ["Complete Your Profile", "Add your details and the required information so retailers know who they are hiring."],
  ["Access Shift Opportunities", "Once your account setup is complete, eligible shift opportunities become available to you."],
  ["Apply for Shifts", "Review the location, timing and duties of a shift, then apply for the ones that fit your schedule."],
  ["Get Hired", "The retailer reviews applicants and confirms the worker they want for the shift."],
  ["Complete the Shift", "Turn up prepared, complete the approved work, and confirm the shift once it is done."],
  ["Build Your Reputation", "Completed shifts can earn verified reviews that strengthen your profile over time."],
];

const retailerSteps: [string, string][] = [
  ["Create Your Retailer Account", "Creating a ShiftSupport retailer account is free — no membership required."],
  ["Add Your Store", "Add your business details so workers can see who they would be working with."],
  ["Create a Shift", "Set the date, the hours, the location and the tasks the shift involves."],
  ["Review the Shift Details", "Check the shift before it goes out, so the details workers see are the ones you meant."],
  ["Complete Checkout", "A short checkout step is completed before the shift is published."],
  ["Receive Applicants", "Local workers see your published shift and apply through the platform."],
  ["Hire a Worker", "Compare applicants from your dashboard and hire the person you want."],
  ["Complete the Shift", "The worker helps with the approved tasks and the shift is confirmed as completed."],
  ["Access Records and Reviews", "Completed shifts keep a clear record, and both sides can leave a verified review."],
];

const valueCards: [IconName, string, string][] = [
  ["store", "Simple Shift Posting", "Create a shift around the staffing gap you actually have — the date, the hours, the location and the tasks."],
  ["worker", "Flexible Local Work", "Short, local shifts that workers can pick up around school, study and everything else in their week."],
  ["shield", "Built-In Employment Support", "ShiftSupport handles the W-2 employment structure, payroll, payroll taxes, workers’ compensation and compliance."],
  ["file", "Clear Shift Records", "Every completed shift keeps a clear record of what was worked, when it was worked, and by whom."],
  ["star", "Reviews & Trust", "Reviews are tied to genuine completed shifts, so a reputation on ShiftSupport is one that was earned."],
  ["people", "Community-Focused Staffing", "Local people supporting local businesses — staffing that keeps money and opportunity in the neighbourhood."],
];

type IconName = "worker" | "store" | "card" | "check" | "star" | "shield" | "file" | "people";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    worker: <><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></>,
    store: <><path d="m4 9 1.5-5h13L20 9M5 9v11h14V9M9 20v-6h6v6"/><path d="M3.5 9h17"/></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    star: <path d="m12 3 2.6 5.3 5.9.8-4.2 4.1 1 5.8-5.3-2.8L6.7 19l1-5.8-4.2-4.1 5.9-.8L12 3Z"/>,
    shield: <><path d="M12 3.2 5.6 5.8v5.1c0 4 2.6 7.4 6.4 8.5 3.8-1.1 6.4-4.5 6.4-8.5V5.8L12 3.2Z"/><path d="m9.2 11.8 1.9 1.9 3.8-3.9"/></>,
    file: <><path d="M6 3.5h7l5 5V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20V4a.5.5 0 0 1 .5-.5Z"/><path d="M13 3.5V9h5M9 13h6M9 16.5h4"/></>,
    people: <><circle cx="9" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M4 19a5.2 5.2 0 0 1 10.2 0M14 18.6a4.3 4.3 0 0 1 6 0"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Eyebrow({ children }: { children: ReactNode }) { return <p className={`headingFont ${styles.eyebrow}`}><span />{children}</p>; }
function CheckList({ items }: { items: string[] }) { return <ul className={styles.checkList}>{items.map(item => <li key={item}><span>✓</span>{item}</li>)}</ul>; }
function Journey({ steps }: { steps: [string, string][] }) {
  return <div className={styles.journey}>{steps.map(([title, text], index) => <article className={styles.step} key={title}>
    <span className={styles.stepNumber}>STEP {String(index + 1).padStart(2, "0")}</span>
    <h3>{title}</h3><p>{text}</p>
  </article>)}</div>;
}

export default function HowShiftsWorkPage() {
  return <>
    <Header />
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={`container ${styles.heroInner}`}>
          <Eyebrow>HOW SHIFTSUPPORT WORKS</Eyebrow>
          <h1>Simple Shifts. Local People.<br/><span>Built-In Support.</span></h1>
          <p>ShiftSupport connects local retailers with reliable local workers through a simple, clear process for posting shifts, applying for work, completing the job and building trust through verified reviews.</p>
          <div className={styles.badges}><span><Icon name="worker"/>For Workers — <strong>Flexible Local Shifts</strong></span><span><Icon name="store"/>For Retailers — <strong>Free to Join</strong></span></div>
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <div className={styles.sectionHeading}><Eyebrow>CHOOSE YOUR SIDE</Eyebrow><h2>One Platform. <span>Two Simple Experiences.</span></h2></div>
          <div className={styles.sideGrid}>
            <article className={styles.sideCard}>
              <div className={styles.cardTop}><span className={styles.iconCircle}><Icon name="worker"/></span><span className={styles.audience}>FOR WORKERS</span></div>
              <h3>Find Flexible Local Work</h3><div className={styles.price}><strong>Flexible</strong><span>LOCAL SHIFTS<br/><small>Work that fits your schedule</small></span></div>
              <p>Create your account, complete your profile, and discover short local shifts you can apply for around school, study and everything else in your week.</p>
              <CheckList items={workerBenefits}/><div className={styles.note}>Discover opportunities near you and build your work history shift by shift.</div>
            </article>
            <article className={`${styles.sideCard} ${styles.darkCard}`}>
              <div className={styles.cardTop}><span className={styles.iconCircle}><Icon name="store"/></span><span className={styles.audience}>FOR RETAILERS</span></div>
              <h3>Get Reliable Help When You Need It</h3><div className={styles.price}><strong>Simple</strong><span>SHIFT POSTING<br/><small>Create a shift in minutes</small></span></div>
              <p>Creating a ShiftSupport Retailer account is completely free. Build a shift around your actual staffing needs, review who applies, and hire from one dashboard.</p>
              <CheckList items={retailerBenefits}/><div className={styles.note}>Creating an account is free. A short checkout step is completed before a shift is published.</div>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section} id="workers">
        <div className="container">
          <div className={styles.sectionHeading}><Eyebrow>FOR WORKERS</Eyebrow><h2>From Sign-Up to <span>Your First Review.</span></h2><p>Seven straightforward steps between creating your account and building a reputation through completed work.</p></div>
          <Journey steps={workerSteps}/>
        </div>
      </section>

      <section className={`${styles.section} ${styles.tintSection}`} id="retailers">
        <div className="container">
          <div className={styles.sectionHeading}><Eyebrow>FOR RETAILERS</Eyebrow><h2>From Your Store to <span>a Completed Shift.</span></h2><p>Create your account, build the shift around your staffing need, and hire the local help you want.</p></div>
          <Journey steps={retailerSteps}/>
        </div>
      </section>

      <section className={styles.section} id="support">
        <div className="container">
          <div className={styles.sectionHeading}><Eyebrow>WHAT SHIFTSUPPORT GIVES YOU</Eyebrow><h2>Simple, Compliant and <span>Community-Focused.</span></h2></div>
          <div className={styles.valueGrid}>{valueCards.map(([icon, title, text]) => <article className={styles.valueCard} key={title}>
            <span className={styles.rateIcon}><Icon name={icon}/></span><h3>{title}</h3><p>{text}</p>
          </article>)}</div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.publishSection}`}><div className={`container ${styles.publishGrid}`}><div><Eyebrow>BEFORE A SHIFT GOES LIVE</Eyebrow><h2>Your Shift Publishes After Checkout</h2><p>Retailers can create their account and prepare a shift for free. Before the shift is published, a short checkout step is completed — the full details are shown in your retailer dashboard.</p><div className={styles.formula}>Create a shift <span>→</span> Complete checkout <span>→</span> <strong>Shift goes live</strong></div></div><div className={styles.publishFlow}><span className={styles.secureIcon}><Icon name="card"/></span>{["Create the Shift","Review Shift Details","Complete Checkout","Shift Published","Eligible Workers Can See It"].map((x,i)=><div key={x} className={i===4?styles.flowDone:""}><span>{i<4?String(i+1).padStart(2,"0"):"✓"}</span>{x}</div>)}</div></div></section>

      <section className={styles.section}><div className={`container ${styles.summaryGrid}`}><div><Eyebrow>AFTER THE WORK</Eyebrow><h2>A Clear Record After Every Shift</h2><p>Completed shifts keep a clear record of the work for both sides — the store, the date, the hours worked and the worker who covered the shift — alongside the reviews that came out of it.</p></div><article className={styles.receipt}><div className={styles.receiptHead}><div><small>SHIFT RECORD</small><h3>Shop Floor Support</h3><p>Demo Store</p></div><span>✓ Completed</span></div><dl><div><dt>Date</dt><dd>September 18, 2026</dd></div><div><dt>Shift Duration</dt><dd>5 hours</dd></div><div><dt>Location</dt><dd>Demo Store, Redondo Beach</dd></div><div className={styles.receiptTotal}><dt>STATUS</dt><dd>Completed</dd></div><div><dt>Worker</dt><dd>Hired through ShiftSupport</dd></div><div><dt>Review</dt><dd>★★★★★ Left by the retailer</dd></div></dl><div className={styles.receiptActions}><span>View Shift Record</span><span>View Reviews</span></div><small className={styles.exampleNote}>Illustrative example — no account or transaction data shown.</small></article></div></section>

      <section className={`${styles.section} ${styles.tintSection}`} id="reviews"><div className="container"><div className={styles.sectionHeading}><Eyebrow>REVIEWS &amp; TRUST</Eyebrow><h2>Every Completed Shift Builds Trust</h2><p>Reviews are tied to genuine completed-shift experiences, helping both sides build stronger and more trustworthy profiles over time.</p></div><div className={styles.reviewGrid}>{[["Retailers Review Workers","After an eligible completed shift, retailers can rate their experience with the Worker from 1 to 5 stars and provide feedback.","★★★★★","4.9","Worker Rating"],["Workers Review Retailers","Workers can also rate their experience with the Retailer/store after an eligible completed shift.","★★★★☆","4.7","Retailer Rating"]].map(x=><article key={x[0]}><span className={styles.rateIcon}><Icon name="star"/></span><h3>{x[0]}</h3><p>{x[1]}</p><div className={styles.rating}><span>{x[2]}</span><strong>{x[3]}</strong><small>{x[4]}</small></div></article>)}</div></div></section>

      <section className={`${styles.section} ${styles.comingSection}`}><div className="container"><div className={styles.comingHead}><div><Eyebrow>FUTURE FEATURE</Eyebrow><h2>Top Rated Workers</h2><p>As verified completed-shift reviews grow, ShiftSupport plans to highlight highly rated Workers, helping great local Workers build visibility through a strong track record.</p></div><span>COMING SOON</span></div><div className={styles.workerPreviews}>{["AM","JL","SK","DR"].map((initials,i)=><article key={initials}><div className={styles.avatar}>{initials}</div><div><h3>Worker Name</h3><span>★★★★★</span><p>{["4.9 · 12 Reviews","4.8 · 9 Reviews","5.0 · 8 Reviews","4.9 · 7 Reviews"][i]}</p></div></article>)}</div><p className={styles.comingNote}>Top Rated Workers will be introduced once sufficient verified review history is available.</p></div></section>

      <section className={styles.section}><div className="container"><div className={styles.sectionHeading}><Eyebrow>SIMPLE &amp; TRANSPARENT</Eyebrow><h2>ShiftSupport at a Glance</h2></div><div className={styles.comparison}><div className={styles.comparisonHead}><span>DETAIL</span><strong>WORKER</strong><strong>RETAILER</strong></div>{[["Account","Worker membership","Free to create"],["Shift Access","Active members","—"],["Posting Shifts","—","Create anytime"],["Before Publishing","—","Checkout step required"],["Applications","Apply for shifts","Review and hire"],["Shift Records","Yes","Yes"],["Reviews","Yes","Yes"]].map(row=><div key={row[0]}><span>{row[0]}</span><strong>{row[1]}</strong><strong>{row[2]}</strong></div>)}</div><p className={styles.comingNote}>Full membership, rate and payment details are shown inside your ShiftSupport dashboard once you are signed in.</p></div></section>

      <section className={`${styles.section} ${styles.ctaSection}`}><div className="container"><div className={styles.sectionHeading}><Eyebrow>JOIN THE COMMUNITY</Eyebrow><h2>Ready to Get Started?</h2></div><div className={styles.ctaGrid}><article><span>WORKER</span><h3>Find flexible local shifts and build your reputation through completed work.</h3><strong>Flexible Local Shifts</strong><a href="/worker/signup">Join as a Worker →</a></article><article><span>RETAILER</span><h3>Create your account for free and get reliable local help when you need it.</h3><strong>Free to Join</strong><a href="/retailer/signup">Create Retailer Account →</a></article></div></div></section>
    </main>
    <Footer />
  </>;
}
