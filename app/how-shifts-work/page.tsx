import type { Metadata } from "next";
import type { ReactNode } from "react";
import Header from "@/components/layout/Header/Header";
import Footer from "@/components/layout/Footer/Footer";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "How ShiftSupport Works | ShiftSupport",
  description: "See how ShiftSupport memberships, shift payments, earnings, completed shifts, and verified reviews work for workers and retailers.",
};

const workerBenefits = ["One simple $18 annual membership", "Membership valid for 1 full year", "Access available shift opportunities", "Apply for local shifts", "Earn $20/hour gross for completed work", "Manage hired and completed shifts", "Build a trusted profile through verified reviews"];
const retailerBenefits = ["Free Retailer account", "No annual membership fee", "Create and prepare a shift", "Select date and shift hours", "See the total cost before payment", "Pay before publishing the shift", "Manage applicants and hired workers", "Access completed-shift summaries and reviews"];

function Icon({ name }: { name: "worker" | "store" | "card" | "check" | "star" }) {
  const paths: Record<string, ReactNode> = {
    worker: <><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></>,
    store: <><path d="m4 9 1.5-5h13L20 9M5 9v11h14V9M9 20v-6h6v6"/><path d="M3.5 9h17"/></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    star: <path d="m12 3 2.6 5.3 5.9.8-4.2 4.1 1 5.8-5.3-2.8L6.7 19l1-5.8-4.2-4.1 5.9-.8L12 3Z"/>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Eyebrow({ children }: { children: ReactNode }) { return <p className={`headingFont ${styles.eyebrow}`}><span />{children}</p>; }
function CheckList({ items }: { items: string[] }) { return <ul className={styles.checkList}>{items.map(item => <li key={item}><span>✓</span>{item}</li>)}</ul>; }
export default function HowShiftsWorkPage() {
  return <>
    <Header />
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={`container ${styles.heroInner}`}>
          <Eyebrow>HOW SHIFTSUPPORT WORKS</Eyebrow>
          <h1>Simple Shifts. Clear Pay.<br/><span>Built-In Support.</span></h1>
          <p>ShiftSupport connects local retailers with reliable workers through a simple, transparent system for finding shifts, posting work, payments, job completion and trusted reviews.</p>
          <div className={styles.badges}><span><Icon name="worker"/>For Workers — <strong>$18/year</strong></span><span><Icon name="store"/>For Retailers — <strong>Free to Join</strong></span></div>
        </div>
      </section>

      <section className={styles.section} id="workers">
        <div className="container">
          <div className={styles.sectionHeading}><Eyebrow>CHOOSE YOUR SIDE</Eyebrow><h2>One Platform. <span>Two Simple Experiences.</span></h2></div>
          <div className={styles.sideGrid}>
            <article className={styles.sideCard}>
              <div className={styles.cardTop}><span className={styles.iconCircle}><Icon name="worker"/></span><span className={styles.audience}>FOR WORKERS</span></div>
              <h3>Find Flexible Local Work</h3><div className={styles.price}><strong>$18</strong><span>/ YEAR<br/><small>Annual Worker Membership</small></span></div>
              <p>Workers join through a paid annual membership that remains active for one full year. An active membership is required to access available opportunities and apply for shifts.</p>
              <CheckList items={workerBenefits}/><div className={styles.note}>$18 once per year — not $18 per month.</div>
            </article>
            <article className={`${styles.sideCard} ${styles.darkCard}`} id="retailers">
              <div className={styles.cardTop}><span className={styles.iconCircle}><Icon name="store"/></span><span className={styles.audience}>FOR RETAILERS</span></div>
              <h3>Get Reliable Help When You Need It</h3><div className={styles.price}><strong>FREE</strong><span>ACCOUNT<br/><small>No membership fee</small></span></div>
              <p>Creating a ShiftSupport Retailer account is completely free. There is no signup or annual membership fee. Payment is required when a retailer is ready to publish a shift.</p>
              <CheckList items={retailerBenefits}/><div className={styles.note}>Creating an account is free. You pay when you publish a shift.</div>
            </article>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.rateSection}`} id="pricing">
        <div className="container"><div className={styles.sectionHeading}><Eyebrow>TRANSPARENT PRICING</Eyebrow><h2>One Clear Rate. <span>No Guesswork.</span></h2><p>Retailers pay a fixed $28/hour for a ShiftSupport shift.</p></div>
          <div className={styles.rateDiagram}><div className={styles.totalRate}><small>RETAILER RATE</small><strong>$28 <em>/ HOUR</em></strong></div><div className={styles.splitLine}/><div className={styles.rateGrid}>
            <article><span className={styles.rateIcon}><Icon name="worker"/></span><small>WORKER GROSS PAY</small><strong>$20 <em>/ HOUR</em></strong><p>$20/hour represents the worker&apos;s gross hourly pay for completed work.</p></article>
            <article><span className={styles.rateIcon}><Icon name="card"/></span><small>SHIFTSUPPORT PLATFORM PORTION</small><strong>$8 <em>/ HOUR</em></strong><p>Supports applicable employment-related administration, insurance, compliance, payroll-related operations and platform services.</p></article>
          </div></div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.costSection}`}>
        <div className="container"><div className={styles.sectionHeading}><Eyebrow>COST EXAMPLE</Eyebrow><h2>See Exactly What a Shift Costs</h2></div>
          <div className={styles.calculator}><div className={styles.calcMain}><span className={styles.calcLabel}>5-HOUR SHIFT</span><div className={styles.calcRow}><span>Shift duration</span><strong>5 hours</strong></div><div className={styles.calcRow}><span>Retailer rate</span><strong>$28/hour</strong></div><div className={`${styles.calcRow} ${styles.calcTotal}`}><span>TOTAL RETAILER AMOUNT</span><strong>$140.00</strong></div><div className={styles.calcSplit}><div><span>WORKER GROSS</span><small>5 × $20</small><strong>$100.00</strong></div><div><span>PLATFORM PORTION</span><small>5 × $8</small><strong>$40.00</strong></div></div></div>
            <div className={styles.quickExamples}>{[["2 Hours","2 × $28","$56"],["4 Hours","4 × $28","$112"],["6 Hours","6 × $28","$168"]].map(x=><div key={x[0]}><span>{x[0]}</span><small>{x[1]}</small><strong>{x[2]}</strong></div>)}<p>The estimated total automatically changes based on the shift&apos;s start and end time.</p></div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.publishSection}`}><div className={`container ${styles.publishGrid}`}><div><Eyebrow>PAYMENT BEFORE PUBLISHING</Eyebrow><h2>Your Shift Goes Live After Payment</h2><p>Retailers can create their account and prepare their shift for free. Before publication, ShiftSupport displays the calculated total based on the selected duration.</p><div className={styles.formula}>4 hours <span>×</span> $28/hour <span>=</span> <strong>$112</strong></div></div><div className={styles.publishFlow}><span className={styles.secureIcon}><Icon name="card"/></span>{["Review Shift","Review Total — $112","Complete Payment","Payment Confirmed","Shift Published","Eligible Workers Can See It"].map((x,i)=><div key={x} className={i===5?styles.flowDone:""}><span>{i<5?String(i+1).padStart(2,"0"):"✓"}</span>{x}</div>)}</div></div></section>

      <section className={styles.section}><div className={`container ${styles.summaryGrid}`}><div><Eyebrow>AFTER THE WORK</Eyebrow><h2>A Clear Summary After Every Shift</h2><p>Completed shifts give retailers a clear record of the shift and its financial breakdown, including duration, total retailer amount, worker gross amount and the ShiftSupport platform portion.</p></div><article className={styles.receipt}><div className={styles.receiptHead}><div><small>SHIFT SUMMARY</small><h3>Shop Floor Support</h3><p>Demo Store</p></div><span>✓ Completed</span></div><dl><div><dt>Date</dt><dd>September 18, 2026</dd></div><div><dt>Shift Duration</dt><dd>5 hours</dd></div><div><dt>Retailer Rate</dt><dd>$28/hour</dd></div><div className={styles.receiptTotal}><dt>TOTAL RETAILER AMOUNT</dt><dd>$140.00</dd></div><div><dt>Worker Gross</dt><dd>$100.00</dd></div><div><dt>ShiftSupport Platform Portion</dt><dd>$40.00</dd></div><div><dt>Payment Status</dt><dd>Paid</dd></div></dl><div className={styles.receiptActions}><span>View Shift Summary</span><span>View Receipt</span></div><small className={styles.exampleNote}>Informational example — no transaction data shown.</small></article></div></section>

      <section className={`${styles.section} ${styles.tintSection}`} id="reviews"><div className="container"><div className={styles.sectionHeading}><Eyebrow>REVIEWS &amp; TRUST</Eyebrow><h2>Every Completed Shift Builds Trust</h2><p>Reviews are tied to genuine completed-shift experiences, helping both sides build stronger and more trustworthy profiles over time.</p></div><div className={styles.reviewGrid}>{[["Retailers Review Workers","After an eligible completed shift, retailers can rate their experience with the Worker from 1 to 5 stars and provide feedback.","★★★★★","4.9","Worker Rating"],["Workers Review Retailers","Workers can also rate their experience with the Retailer/store after an eligible completed shift.","★★★★☆","4.7","Retailer Rating"]].map(x=><article key={x[0]}><span className={styles.rateIcon}><Icon name="star"/></span><h3>{x[0]}</h3><p>{x[1]}</p><div className={styles.rating}><span>{x[2]}</span><strong>{x[3]}</strong><small>{x[4]}</small></div></article>)}</div></div></section>

      <section className={`${styles.section} ${styles.comingSection}`}><div className="container"><div className={styles.comingHead}><div><Eyebrow>FUTURE FEATURE</Eyebrow><h2>Top Rated Workers</h2><p>As verified completed-shift reviews grow, ShiftSupport plans to highlight highly rated Workers, helping great local Workers build visibility through a strong track record.</p></div><span>COMING SOON</span></div><div className={styles.workerPreviews}>{["AM","JL","SK","DR"].map((initials,i)=><article key={initials}><div className={styles.avatar}>{initials}</div><div><h3>Worker Name</h3><span>★★★★★</span><p>{["4.9 · 12 Reviews","4.8 · 9 Reviews","5.0 · 8 Reviews","4.9 · 7 Reviews"][i]}</p></div></article>)}</div><p className={styles.comingNote}>Top Rated Workers will be introduced once sufficient verified review history is available.</p></div></section>

      <section className={styles.section}><div className="container"><div className={styles.sectionHeading}><Eyebrow>SIMPLE &amp; TRANSPARENT</Eyebrow><h2>ShiftSupport at a Glance</h2></div><div className={styles.comparison}><div className={styles.comparisonHead}><span>DETAIL</span><strong>WORKER</strong><strong>RETAILER</strong></div>{[["Account","Paid Membership","Free"],["Membership","$18/year","$0"],["Validity","1 year","No expiry fee"],["Shift Access","Active members","—"],["Hourly Amount","$20/hr gross","$28/hr cost"],["Platform Portion","—","Included in $28/hr"],["Reviews","Yes","Yes"]].map(row=><div key={row[0]}><span>{row[0]}</span><strong>{row[1]}</strong><strong>{row[2]}</strong></div>)}</div></div></section>

      <section className={`${styles.section} ${styles.ctaSection}`}><div className="container"><div className={styles.sectionHeading}><Eyebrow>JOIN THE COMMUNITY</Eyebrow><h2>Ready to Get Started?</h2></div><div className={styles.ctaGrid}><article><span>WORKER</span><h3>Find flexible local shifts and build your reputation through completed work.</h3><strong>$18/year</strong><a href="/worker/signup">Join as a Worker →</a></article><article><span>RETAILER</span><h3>Create your account for free and get reliable local help when you need it.</h3><strong>Free to Join</strong><a href="/retailer/signup">Create Retailer Account →</a></article></div></div></section>
    </main>
    <Footer />
  </>;
}
